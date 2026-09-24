'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Mirrors maintenance/actions.ts's requireMaintenanceAccess. RLS on every
// mould_* table is has_dept_access('mould') for ALL roles — same accepted
// pattern as every other department here (role restriction is nav-hiding,
// not RLS; see v23's migration comment). requireMouldRole below adds an
// app-level check on top of that for the two actions where role matters
// operationally (locking a month, changing the standard rate) — it is an
// additional guard, not a replacement for RLS.
async function requireMouldAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'mould' })
  if (!hasAccess) throw new Error('Not authorized')
  return { supabase, user }
}

async function requireMouldRole(allowedRoles: string[]) {
  const { supabase, user } = await requireMouldAccess()
  const { data: access } = await supabase
    .from('user_department_access')
    .select('role')
    .eq('user_id', user.id)
    .eq('department', 'mould')
    .maybeSingle()
  if (!access || !allowedRoles.includes(access.role)) {
    throw new Error(`Requires role: ${allowedRoles.join(' or ')}`)
  }
  return { supabase, user, role: access.role }
}

// ---------------------------------------------------------------------------
// Moulds (assets)
// ---------------------------------------------------------------------------

export async function createMouldAsset(input: {
  mould_code?: string
  name: string
  mould_type: 'project_bound' | 'common'
  owning_project_id: number | null
  product_weight_kg?: number | null
}) {
  const { supabase } = await requireMouldAccess()
  const { error } = await supabase.from('mould_assets').insert({
    mould_code: input.mould_code || null,
    name: input.name,
    mould_type: input.mould_type,
    status: 'fabricating',
    owning_project_id: input.owning_project_id,
    current_project_id: input.owning_project_id,
    product_weight_kg: input.product_weight_kg ?? null,
  })
  if (error) throw error
  revalidatePath('/mould/assets')
}

// Changing status to 'parked' also clears current_project_id — a parked
// mould has no project until it's reassigned (Q9ii: idle moulds belong to
// Factory, not their last project).
export async function updateMouldAssetStatus(id: number, status: 'fabricating' | 'active' | 'parked' | 'eol') {
  const { supabase } = await requireMouldAccess()
  const patch: Record<string, unknown> = { status }
  if (status === 'parked') {
    patch.current_project_id = null
    patch.parked_at = new Date().toISOString()
  }
  const { error } = await supabase.from('mould_assets').update(patch).eq('id', id)
  if (error) throw error
  revalidatePath('/mould/assets')
}

// Reassigning a Common mould to a new current project — the receiving
// project is who pays for the next change/maintenance job on it (Q9i).
export async function reassignMouldProject(id: number, projectId: number) {
  const { supabase } = await requireMouldAccess()
  const { error } = await supabase
    .from('mould_assets')
    .update({ current_project_id: projectId, status: 'active' })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/mould/assets')
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

// cost_center / project_id are derived server-side from the mould's CURRENT
// state, never trusted from the client — the whole point of the receiving-
// project-pays rule (Q9i) is that it can't be picked arbitrarily by whoever
// opens the job.
export async function createMouldJob(input: {
  mould_id: number
  job_type: 'fabrication' | 'change' | 'maintenance' | 'decommission'
  started_on: string
  notes?: string
}) {
  const { supabase } = await requireMouldAccess()

  const { data: mould, error: mouldErr } = await supabase
    .from('mould_assets')
    .select('id, status, current_project_id, owning_project_id')
    .eq('id', input.mould_id)
    .single()
  if (mouldErr) throw mouldErr

  // Fabrication charges the owning project. Change/maintenance charge
  // whichever project currently has the mould; a parked (no current
  // project) mould's maintenance goes to Factory. Decommission is always
  // Factory (Q23: scrap value credits Factory, not any project).
  let costCenter: 'project' | 'factory' = 'project'
  let projectId: number | null = null
  if (input.job_type === 'fabrication') {
    projectId = mould.owning_project_id
    costCenter = projectId ? 'project' : 'factory'
  } else if (input.job_type === 'decommission') {
    costCenter = 'factory'
  } else {
    projectId = mould.current_project_id
    costCenter = projectId ? 'project' : 'factory'
  }

  const { error } = await supabase.from('mould_jobs').insert({
    mould_id: input.mould_id,
    job_type: input.job_type,
    cost_center: costCenter,
    project_id: projectId,
    status: 'open',
    started_on: input.started_on,
    notes: input.notes || null,
  })
  if (error) throw error
  revalidatePath('/mould/jobs')
}

// Completing a job is the one place added_steel_kg becomes money (Q11: book
// on completion, not when weighed) — the standard rate is snapshotted here
// so a later rate change never rewrites this job's cost (Q26).
// added_steel_kg > 0 is also the objective test (Q22) that separates a real
// modification from routine mould work, but that test lives in how the job
// was categorised at creation (job_type), not re-derived here.
export async function completeMouldJob(jobId: number, input: {
  completed_on: string
  added_steel_kg?: number
  scrap_weight_kg?: number
}) {
  const { supabase } = await requireMouldAccess()

  const { data: settings, error: settingsErr } = await supabase
    .from('mould_settings')
    .select('standard_steel_rate_per_kg, scrap_rate_per_kg')
    .eq('id', 1)
    .single()
  if (settingsErr) throw settingsErr

  const { data: job, error: jobErr } = await supabase
    .from('mould_jobs')
    .select('id, mould_id, job_type')
    .eq('id', jobId)
    .single()
  if (jobErr) throw jobErr

  const addedSteel = input.added_steel_kg || 0
  const scrapWeight = input.scrap_weight_kg || 0
  const materialCost = addedSteel * settings.standard_steel_rate_per_kg
  const scrapValue = scrapWeight * settings.scrap_rate_per_kg

  const { error } = await supabase.from('mould_jobs').update({
    status: 'completed',
    completed_on: input.completed_on,
    added_steel_kg: addedSteel,
    steel_rate_snapshot: settings.standard_steel_rate_per_kg,
    material_cost_snapshot: materialCost,
    scrap_weight_kg: job.job_type === 'decommission' ? scrapWeight : null,
    scrap_rate_snapshot: job.job_type === 'decommission' ? settings.scrap_rate_per_kg : null,
    scrap_value_snapshot: job.job_type === 'decommission' ? scrapValue : null,
  }).eq('id', jobId)
  if (error) throw error

  // The mould's own steel weight only grows on a real modification/
  // fabrication, never on maintenance/decommission (Q8/Q19).
  if (addedSteel > 0 && (job.job_type === 'fabrication' || job.job_type === 'change')) {
    const { data: mould } = await supabase.from('mould_assets').select('steel_weight_kg').eq('id', job.mould_id).single()
    await supabase.from('mould_assets')
      .update({ steel_weight_kg: (mould?.steel_weight_kg || 0) + addedSteel })
      .eq('id', job.mould_id)
  }

  revalidatePath('/mould/jobs')
  revalidatePath('/mould/assets')
  revalidatePath('/mould')
}

// ---------------------------------------------------------------------------
// Time entries — the supervisor's daily allocation (Q24). One row per
// worker per day per target; cost_target and the rate are derived/snapshotted
// server-side, never trusted from the client.
// ---------------------------------------------------------------------------

export async function addTimeEntry(input: {
  work_date: string
  worker_id: number
  hours: number
  activity_code: string
  job_id?: number | null
  project_id?: number | null
}) {
  const { supabase } = await requireMouldAccess()

  const { data: activity, error: actErr } = await supabase
    .from('mould_activities')
    .select('code, cost_target')
    .eq('code', input.activity_code)
    .single()
  if (actErr) throw actErr

  const { data: settings, error: settingsErr } = await supabase
    .from('mould_settings')
    .select('provisional_labour_rate_per_hour')
    .eq('id', 1)
    .single()
  if (settingsErr) throw settingsErr

  if (activity.cost_target === 'mould' && !input.job_id) {
    throw new Error('This activity requires a mould job.')
  }
  if (activity.cost_target === 'project' && !input.project_id) {
    throw new Error('This activity requires a project.')
  }

  const rate = settings.provisional_labour_rate_per_hour
  const { error } = await supabase.from('mould_time_entries').insert({
    work_date: input.work_date,
    worker_id: input.worker_id,
    hours: input.hours,
    activity_code: input.activity_code,
    cost_target: activity.cost_target,
    job_id: activity.cost_target === 'mould' ? input.job_id : null,
    project_id: activity.cost_target === 'project' ? input.project_id : null,
    rate_used: rate,
    labour_cost: input.hours * rate,
    is_provisional_rate: true,
  })
  if (error) throw error
  revalidatePath('/mould/allocation')
}

export async function deleteTimeEntry(id: number) {
  const { supabase } = await requireMouldAccess()
  // The lock trigger rejects this outright if work_date falls in a locked
  // period — the error surfaces to the caller as-is.
  const { error } = await supabase.from('mould_time_entries').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/mould/allocation')
}

// Q30: supervisor's allocated hours are scaled to match the timecard total
// for that worker/day, not overwritten. Ratio-scales every entry for the
// given worker+date by the same factor so the allocation split (which job/
// project got what share) is preserved.
export async function reconcileDayToTimecard(workerId: number, workDate: string, timecardHours: number) {
  const { supabase } = await requireMouldAccess()

  const { data: entries, error } = await supabase
    .from('mould_time_entries')
    .select('id, hours, rate_used')
    .eq('worker_id', workerId)
    .eq('work_date', workDate)
  if (error) throw error
  if (!entries || entries.length === 0) throw new Error('No allocated hours to reconcile for this worker/day.')

  const allocatedTotal = entries.reduce((sum, e) => sum + e.hours, 0)
  if (allocatedTotal <= 0) throw new Error('Allocated total is zero — cannot scale.')

  const factor = timecardHours / allocatedTotal
  for (const e of entries) {
    const newHours = Math.round(e.hours * factor * 100) / 100
    const { error: updErr } = await supabase.from('mould_time_entries')
      .update({ hours: newHours, labour_cost: newHours * e.rate_used })
      .eq('id', e.id)
    if (updErr) throw updErr
  }
  revalidatePath('/mould/allocation')
}

// ---------------------------------------------------------------------------
// Month lock (Q33: admin only, deviating from other actions' has_dept_access-
// only gate — this is the one place a wrong click has month-end consequences).
// ---------------------------------------------------------------------------

export async function lockMonth(period: string) {
  const { supabase, user } = await requireMouldRole(['admin'])
  const { error } = await supabase.from('mould_month_locks').upsert({
    period,
    status: 'locked',
    locked_by: user.email,
    locked_at: new Date().toISOString(),
  }, { onConflict: 'period' })
  if (error) throw error
  revalidatePath('/mould/month-lock')
}

export async function unlockMonth(period: string) {
  const { supabase } = await requireMouldRole(['admin'])
  const { error } = await supabase.from('mould_month_locks')
    .update({ status: 'open', locked_by: null, locked_at: null })
    .eq('period', period)
  if (error) throw error
  revalidatePath('/mould/month-lock')
}

// ---------------------------------------------------------------------------
// Settings (Q26: admin only — a wrong standard rate silently skews every
// job costed after it).
// ---------------------------------------------------------------------------

export async function updateMouldSettings(input: {
  standard_steel_rate_per_kg: number
  provisional_labour_rate_per_hour: number
  scrap_rate_per_kg: number
}) {
  const { supabase } = await requireMouldRole(['admin'])
  const { error } = await supabase.from('mould_settings').update({
    ...input,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
  if (error) throw error
  revalidatePath('/mould/settings')
}
