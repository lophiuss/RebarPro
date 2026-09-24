'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { daysStayedInMonth, computeProration, dayBefore } from '@/lib/plantpro-hostel'
import { uploadToDrive, deleteFromDrive } from '@/lib/google-drive'
import { parseTimecardPdf } from '@/lib/plantpro-import/parseTimecard'
import { parseWorkerExcel, type ExcelWorkerRow } from '@/lib/plantpro-import/parseWorkerExcel'
import { normalizeName, normalizeAddress } from '@/lib/plantpro-import/matching'

// Mirrors mould/actions.ts's requireMouldAccess/requireMouldRole pattern.
async function requirePlantproAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'plantpro' })
  if (!hasAccess) throw new Error('Not authorized')
  return { supabase, user }
}

// slugify(), matching PMS's src/lib/db-helpers.ts exactly, so re-running
// the same label always produces the same key.
function slugify(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

// Postgres raises a foreign-key violation (code 23503) when an `on delete
// restrict` relation blocks a delete — PMS surfaced this as a friendly 409
// message per entity; this does the same instead of leaking the raw
// Postgres error text to the UI.
function friendlyDeleteError(err: any, whatItWasBlockedBy: string): never {
  if (err?.code === '23503') throw new Error(`Cannot delete — still referenced by ${whatItWasBlockedBy}. Remove those first.`)
  throw err
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(name: string, typeId: number | null) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_projects').insert({ name, type_id: typeId })
  if (error) throw error
  revalidatePath('/plantpro/config')
}

export async function updateProject(id: number, patch: { name?: string; type_id?: number | null; status?: 'Active' | 'Inactive' }) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_projects').update(patch).eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/config')
}

export async function deleteProject(id: number) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_projects').delete().eq('id', id)
  if (error) friendlyDeleteError(error, 'allocations, targets, or claims')
  revalidatePath('/plantpro/config')
}

// ---------------------------------------------------------------------------
// Project Types
// ---------------------------------------------------------------------------

export async function createProjectType(name: string) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_project_types').insert({ name })
  if (error) throw error
  revalidatePath('/plantpro/config')
}

export async function renameProjectType(id: number, name: string) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_project_types').update({ name }).eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/config')
}

export async function deleteProjectType(id: number) {
  const { supabase } = await requirePlantproAccess()
  // type_id is `on delete set null` on plantpro_projects, so this never
  // actually fails — projects just lose their type, matching PMS.
  const { error } = await supabase.from('plantpro_project_types').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/config')
}

// ---------------------------------------------------------------------------
// Supervisors
// ---------------------------------------------------------------------------

export async function createSupervisor(name: string) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_supervisors').insert({ name })
  if (error) throw error
  revalidatePath('/plantpro/config')
}

export async function updateSupervisor(id: number, patch: { name?: string; status?: 'Active' | 'Inactive' }) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_supervisors').update(patch).eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/config')
}

export async function deleteSupervisor(id: number) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_supervisors').delete().eq('id', id)
  if (error) friendlyDeleteError(error, 'assigned workers or transfer history')
  revalidatePath('/plantpro/config')
}

// ---------------------------------------------------------------------------
// Pay columns — includes the MULTIPLIER compute-mode logic ported from
// PMS's src/lib/db-helpers.ts (prefillMultiplierColumnsForWorker /
// applyMultiplierColumnToAllWorkers): value = multiplierPercent/100 x
// sum(base column values).
// ---------------------------------------------------------------------------

export async function createPayColumn(input: {
  label: string
  type: 'ADD' | 'DEDUCT'
  computeMode: 'MANUAL' | 'MULTIPLIER'
  multiplierPercent?: number
  baseColumnIds?: number[]
}) {
  const { supabase } = await requirePlantproAccess()
  const key = slugify(input.label)

  const { data: existing } = await supabase.from('plantpro_pay_columns').select('id').eq('key', key).maybeSingle()
  if (existing) throw new Error('A column with this name/label already exists.')

  const { data: maxRow } = await supabase.from('plantpro_pay_columns').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const isMultiplier = input.computeMode === 'MULTIPLIER'

  const { data: created, error } = await supabase.from('plantpro_pay_columns').insert({
    key, label: input.label, type: input.type,
    sort_order: (maxRow?.sort_order ?? -1) + 1,
    compute_mode: isMultiplier ? 'MULTIPLIER' : 'MANUAL',
    multiplier_percent: isMultiplier ? (input.multiplierPercent || 0) : null,
  }).select('id').single()
  if (error) throw error

  if (isMultiplier && input.baseColumnIds?.length) {
    const { error: baseErr } = await supabase.from('plantpro_pay_column_bases').insert(
      input.baseColumnIds.map(baseId => ({ column_id: created.id, base_column_id: baseId }))
    )
    if (baseErr) throw baseErr
  }
  revalidatePath('/plantpro/config')
}

export async function updatePayColumn(id: number, patch: {
  label?: string; type?: 'ADD' | 'DEDUCT'
  include_in_gross?: boolean; include_in_net_deduct?: boolean
  compute_mode?: 'MANUAL' | 'MULTIPLIER'; multiplier_percent?: number
  base_column_ids?: number[]
}) {
  const { supabase } = await requirePlantproAccess()
  const { base_column_ids, ...columnPatch } = patch
  if (columnPatch.compute_mode === 'MANUAL') columnPatch.multiplier_percent = undefined

  if (Object.keys(columnPatch).length > 0) {
    const { error } = await supabase.from('plantpro_pay_columns').update(columnPatch).eq('id', id)
    if (error) throw error
  }
  if (base_column_ids) {
    await supabase.from('plantpro_pay_column_bases').delete().eq('column_id', id)
    if (base_column_ids.length > 0) {
      const { error } = await supabase.from('plantpro_pay_column_bases').insert(
        base_column_ids.map(baseId => ({ column_id: id, base_column_id: baseId }))
      )
      if (error) throw error
    }
  }
  revalidatePath('/plantpro/config')
}

export async function deletePayColumn(id: number, key: string) {
  if (key === 'payrate') throw new Error('Cannot delete the default Payrate column.')
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_pay_columns').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/config')
}

export async function reorderPayColumns(orderedIds: number[]) {
  const { supabase } = await requirePlantproAccess()
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('plantpro_pay_columns').update({ sort_order: i }).eq('id', orderedIds[i])
    if (error) throw error
  }
  revalidatePath('/plantpro/config')
}

// Recomputes this MULTIPLIER column's value for EVERY worker and overwrites
// their plantpro_worker_pay_values row — destructive, confirm-guarded
// client-side, exactly like PMS's own "Apply to all workers" button.
// ---------------------------------------------------------------------------
// OT & allocation grid (the core daily-use screen). Ported from PMS's
// api/ot/day, api/ot/meta, api/ot/bulk-fill, api/ot/copy-month,
// api/ot/clear-month, api/ot/approval, api/ot/transfer, and
// api/workers/[id]/allocations.
// ---------------------------------------------------------------------------

function isSundayStr(month: string, day: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, Number(day)).getDay() === 0
}
function daysInMonthStr(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
function defaultBasicFor(month: string, day: string) {
  return isSundayStr(month, day) ? 0 : 8
}

async function getOrCreateOtMonthId(supabase: any, workerId: number, month: string): Promise<number> {
  const { data: existing } = await supabase.from('plantpro_ot_months').select('id').eq('worker_id', workerId).eq('month', month).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await supabase.from('plantpro_ot_months').insert({ worker_id: workerId, month }).select('id').single()
  if (error) throw error
  return created.id
}

export async function updateOtDayHours(workerId: number, month: string, day: string, type: 'basic' | 'ot', value: string) {
  const { supabase } = await requirePlantproAccess()
  const otMonthId = await getOrCreateOtMonthId(supabase, workerId, month)
  const { data: existing } = await supabase.from('plantpro_ot_days').select('basic, ot').eq('ot_month_id', otMonthId).eq('day', day).maybeSingle()
  const basic = existing?.basic ?? defaultBasicFor(month, day)
  const ot = existing?.ot ?? 0
  const patch = type === 'basic' ? { basic: Number(value) || 0, ot } : { basic, ot: Number(value) || 0 }
  const { error } = await supabase.from('plantpro_ot_days').upsert({ ot_month_id: otMonthId, day, ...patch }, { onConflict: 'ot_month_id,day' })
  if (error) throw error
  revalidatePath('/plantpro/ot')
}

export async function updateOtMonthMeta(workerId: number, month: string, field: 'mode' | 'remark', value: string) {
  const { supabase } = await requirePlantproAccess()
  const otMonthId = await getOrCreateOtMonthId(supabase, workerId, month)
  const { error } = await supabase.from('plantpro_ot_months').update({ [field]: value }).eq('id', otMonthId)
  if (error) throw error
  revalidatePath('/plantpro/ot')
}

// Sets OT hours for every weekday of the month, preserving each day's
// existing basic hours. Sundays and public holidays are left untouched.
export async function bulkFillOt(workerId: number, month: string, value: string) {
  const { supabase } = await requirePlantproAccess()
  const numVal = Number(value) || 0
  const otMonthId = await getOrCreateOtMonthId(supabase, workerId, month)
  const n = daysInMonthStr(month)

  const { data: existingDays } = await supabase.from('plantpro_ot_days').select('day, basic').eq('ot_month_id', otMonthId)
  const basicByDay = new Map((existingDays || []).map((d: any) => [d.day, d.basic]))
  const monthEnd = String(n).padStart(2, '0')
  const { data: holidays } = await supabase.from('plantpro_holidays').select('date').gte('date', `${month}-01`).lte('date', `${month}-${monthEnd}`)
  const holidaySet = new Set((holidays || []).map((h: any) => h.date.slice(-2)))

  const rows = []
  for (let i = 1; i <= n; i++) {
    const day = String(i).padStart(2, '0')
    if (isSundayStr(month, day) || holidaySet.has(day)) continue
    rows.push({ ot_month_id: otMonthId, day, basic: basicByDay.get(day) ?? defaultBasicFor(month, day), ot: numVal })
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('plantpro_ot_days').upsert(rows, { onConflict: 'ot_month_id,day' })
    if (error) throw error
  }
  revalidatePath('/plantpro/ot')
}

export async function copyOtMonth(workerIds: number[], fromMonth: string, toMonth: string) {
  const { supabase } = await requirePlantproAccess()
  const targetDays = daysInMonthStr(toMonth)

  for (const workerId of workerIds) {
    const { data: source } = await supabase.from('plantpro_ot_months').select('id, mode, remark').eq('worker_id', workerId).eq('month', fromMonth).maybeSingle()
    if (!source) continue

    const targetId = await getOrCreateOtMonthId(supabase, workerId, toMonth)
    await supabase.from('plantpro_ot_months').update({ mode: source.mode, remark: source.remark }).eq('id', targetId)

    const { data: sourceDays } = await supabase.from('plantpro_ot_days').select('id, day, basic, ot').eq('ot_month_id', source.id)
    for (const d of sourceDays || []) {
      if (Number(d.day) > targetDays) continue
      const { data: targetDay, error } = await supabase.from('plantpro_ot_days')
        .upsert({ ot_month_id: targetId, day: d.day, basic: d.basic, ot: d.ot }, { onConflict: 'ot_month_id,day' })
        .select('id').single()
      if (error) throw error
      await supabase.from('plantpro_ot_day_allocations').delete().eq('ot_day_id', targetDay.id)
      const { data: sourceAllocs } = await supabase.from('plantpro_ot_day_allocations').select('project_id, percentage').eq('ot_day_id', d.id)
      if (sourceAllocs?.length) {
        await supabase.from('plantpro_ot_day_allocations').insert(sourceAllocs.map((a: any) => ({ ot_day_id: targetDay.id, project_id: a.project_id, percentage: a.percentage })))
      }
    }
  }
  revalidatePath('/plantpro/ot')
}

export async function clearOtMonth(workerIds: number[], month: string) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_ot_months').delete().eq('month', month).in('worker_id', workerIds)
  if (error) throw error
  revalidatePath('/plantpro/ot')
}

// Real per-user attribution (auth.uid()), replacing PMS's free-text actor —
// the deliberate improvement decision #2 called for. The caller never
// supplies "who did this"; it's always the authenticated caller.
const OT_APPROVAL_STATUS: Record<string, string> = {
  submit: 'Pending Approval', resubmit: 'Pending Approval', approve: 'Approved', reject: 'Rejected', unlock: 'Draft',
}
export async function otApprovalAction(month: string, supervisorId: number, action: 'submit' | 'resubmit' | 'approve' | 'reject' | 'unlock') {
  const { supabase, user } = await requirePlantproAccess()
  const status = OT_APPROVAL_STATUS[action]
  if (!status) throw new Error('Invalid action')

  const now = new Date().toISOString()
  const attribution: Record<string, any> = {}
  if (action === 'submit' || action === 'resubmit') {
    attribution.submitted_by = user.id; attribution.submitted_at = now
    attribution.approved_by = null; attribution.approved_at = null
    attribution.rejected_by = null; attribution.rejected_at = null
  } else if (action === 'approve') {
    attribution.approved_by = user.id; attribution.approved_at = now
  } else if (action === 'reject') {
    attribution.rejected_by = user.id; attribution.rejected_at = now
  }

  const { error } = await supabase.from('plantpro_ot_approvals')
    .upsert({ month, supervisor_id: supervisorId, status, ...attribution }, { onConflict: 'month,supervisor_id' })
  if (error) throw error
  revalidatePath('/plantpro/ot')
}

export async function updateWorkerAllocationPct(workerId: number, projectId: number, percentage: number) {
  const { supabase } = await requirePlantproAccess()
  if (!percentage || percentage <= 0) {
    const { error } = await supabase.from('plantpro_worker_allocations').delete().eq('worker_id', workerId).eq('project_id', projectId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('plantpro_worker_allocations')
      .upsert({ worker_id: workerId, project_id: projectId, percentage }, { onConflict: 'worker_id,project_id' })
    if (error) throw error
  }
  revalidatePath('/plantpro/ot')
}

// Logs the audit row AND immediately live-mutates Worker.supervisor_id —
// PMS's POST /api/ot/transfer does both; matched here deliberately (see
// plan §5's "preserved even where PMS's own design is a little unusual").
export async function transferWorker(workerId: number, month: string, day: string, toSupervisorId: number) {
  const { supabase } = await requirePlantproAccess()
  const { error: transferErr } = await supabase.from('plantpro_worker_transfers')
    .upsert({ worker_id: workerId, month, day, to_supervisor_id: toSupervisorId }, { onConflict: 'worker_id,month,day' })
  if (transferErr) throw transferErr
  const { error: workerErr } = await supabase.from('plantpro_workers').update({ supervisor_id: toSupervisorId }).eq('id', workerId)
  if (workerErr) throw workerErr
  revalidatePath('/plantpro/ot')
}

// ---------------------------------------------------------------------------
// Timesheet — HR's actual-hours ledger. Deliberately independent from
// plantpro_ot_days (the supervisor's planning ledger) — see plan §5.
// ---------------------------------------------------------------------------

export async function updateTimesheetDay(workerId: number, month: string, day: string, field: 'basic' | 'ot', value: string) {
  const { supabase } = await requirePlantproAccess()
  const { data: existing } = await supabase.from('plantpro_timesheet_days').select('basic, ot').eq('worker_id', workerId).eq('month', month).eq('day', day).maybeSingle()
  const basic = existing?.basic ?? defaultBasicFor(month, day)
  const ot = existing?.ot ?? 0
  const patch = field === 'basic' ? { basic: Number(value) || 0, ot } : { basic, ot: Number(value) || 0 }
  const { error } = await supabase.from('plantpro_timesheet_days').upsert({ worker_id: workerId, month, day, ...patch }, { onConflict: 'worker_id,month,day' })
  if (error) throw error
  revalidatePath('/plantpro/timesheet')
}

export async function updateTimesheetMultiplier(patch: Partial<{ normal_ot: number; sunday_basic: number; sunday_ot: number; holiday_basic: number; holiday_ot: number }>) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_timesheet_multiplier').update(patch).eq('id', 1)
  if (error) throw error
  revalidatePath('/plantpro/timesheet')
}

export async function addHoliday(date: string, label: string) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_holidays').upsert({ date, label: label || 'Public Holiday' }, { onConflict: 'date' })
  if (error) throw error
  revalidatePath('/plantpro/timesheet')
}

export async function removeHoliday(date: string) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_holidays').delete().eq('date', date)
  if (error) throw error
  revalidatePath('/plantpro/timesheet')
}

// ---------------------------------------------------------------------------
// HR worker roster & pay input.
// ---------------------------------------------------------------------------

export async function createWorker(input: { worker_no: string; name: string; line?: string; designation?: string; supervisor_id?: number | null }) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_workers').insert({
    worker_no: input.worker_no, name: input.name, line: input.line || null,
    designation: input.designation || null, supervisor_id: input.supervisor_id || null, status: 'Active',
  })
  if (error) throw error
  revalidatePath('/plantpro/hr')
}

export async function updateWorkerField(id: number, field: string, value: unknown) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_workers').update({ [field]: value }).eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/hr')
  revalidatePath('/plantpro/ot')
  revalidatePath('/plantpro/timesheet')
}

// Insert-or-update a worker's value for one pay column. Write access is
// uniform has_dept_access — only SELECT is wage-tier-gated (see v39's RLS
// design), matching the fact that a supervisor never has a UI path to this
// page at all (not in their nav permissions).
export async function updateWorkerPayValue(workerId: number, payColumnId: number, value: number) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_worker_pay_values')
    .upsert({ worker_id: workerId, pay_column_id: payColumnId, value }, { onConflict: 'worker_id,pay_column_id' })
  if (error) throw error
  revalidatePath('/plantpro/hr')
}

export async function deleteWorker(id: number) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_workers').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/hr')
}

// Duplicates a worker (new worker_no suffix) including current pay values
// and standing allocations — mirrors PMS's "Copy" button.
export async function copyWorker(id: number) {
  const { supabase } = await requirePlantproAccess()
  const { data: source, error: srcErr } = await supabase.from('plantpro_workers').select('*').eq('id', id).single()
  if (srcErr) throw srcErr

  const { data: created, error } = await supabase.from('plantpro_workers').insert({
    worker_no: `${source.worker_no}-copy`, name: `${source.name} (copy)`, line: source.line,
    designation: source.designation, supervisor_id: source.supervisor_id, status: source.status,
    remarks: source.remarks, nationality: source.nationality, date_of_birth: source.date_of_birth, date_joined: source.date_joined,
  }).select('id').single()
  if (error) throw error

  const { data: payValues } = await supabase.from('plantpro_worker_pay_values').select('pay_column_id, value').eq('worker_id', id)
  if (payValues?.length) {
    await supabase.from('plantpro_worker_pay_values').insert(payValues.map(v => ({ worker_id: created.id, pay_column_id: v.pay_column_id, value: v.value })))
  }
  const { data: allocs } = await supabase.from('plantpro_worker_allocations').select('project_id, percentage').eq('worker_id', id)
  if (allocs?.length) {
    await supabase.from('plantpro_worker_allocations').insert(allocs.map(a => ({ worker_id: created.id, project_id: a.project_id, percentage: a.percentage })))
  }
  revalidatePath('/plantpro/hr')
}

// Snapshots EVERY worker's current allocation + supervisor for the current
// calendar month — mirrors PMS's POST /api/workers/snapshot (no args,
// always "now").
export async function saveAllocationSnapshot() {
  const { supabase } = await requirePlantproAccess()
  const month = new Date().toISOString().slice(0, 7)
  const { data: workers, error: wErr } = await supabase.from('plantpro_workers').select('id, supervisor_id')
  if (wErr) throw wErr

  for (const w of workers) {
    const { data: snap, error } = await supabase.from('plantpro_allocation_snapshots')
      .upsert({ worker_id: w.id, month, supervisor_id: w.supervisor_id }, { onConflict: 'worker_id,month' })
      .select('id').single()
    if (error) throw error
    await supabase.from('plantpro_allocation_snapshot_items').delete().eq('snapshot_id', snap.id)
    const { data: allocs } = await supabase.from('plantpro_worker_allocations').select('project_id, percentage').eq('worker_id', w.id)
    if (allocs?.length) {
      await supabase.from('plantpro_allocation_snapshot_items').insert(allocs.map(a => ({ snapshot_id: snap.id, project_id: a.project_id, percentage: a.percentage })))
    }
  }
  revalidatePath('/plantpro/hr')
}

// ---------------------------------------------------------------------------
// Hostel management — stays, bill item types, monthly utility billing +
// proration/apply. Math ported to src/lib/plantpro-hostel.ts.
// ---------------------------------------------------------------------------

export async function createHostel(name: string) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_hostels').insert({ name })
  if (error) throw error
  revalidatePath('/plantpro/hostel')
}

export async function updateHostel(id: number, patch: Record<string, unknown>) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_hostels').update(patch).eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/hostel')
}

export async function deleteHostel(id: number) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_hostels').delete().eq('id', id)
  if (error) friendlyDeleteError(error, 'a current or past stay')
  revalidatePath('/plantpro/hostel')
}

// Assigns a worker to a hostel, auto-closing any open stay (move_out_date
// null) elsewhere with move_out_date = day before the new move-in date —
// same dual-purpose endpoint PMS uses for both first assignment and
// transfer (the client just calls this again with a new hostel_id).
export async function assignHostelStay(workerId: number, hostelId: number, moveInDate: string) {
  const { supabase } = await requirePlantproAccess()
  const { data: openStay } = await supabase.from('plantpro_hostel_stays').select('id, hostel_id, move_in_date').eq('worker_id', workerId).is('move_out_date', null).maybeSingle()

  if (openStay) {
    if (openStay.hostel_id === hostelId && openStay.move_in_date <= moveInDate) {
      return // already open at this hostel from on/before this date — no-op, matches PMS
    }
    const before = dayBefore(moveInDate)
    const moveOutDate = before < openStay.move_in_date ? openStay.move_in_date : before
    const { error: closeErr } = await supabase.from('plantpro_hostel_stays').update({ move_out_date: moveOutDate }).eq('id', openStay.id)
    if (closeErr) throw closeErr
  }
  const { error } = await supabase.from('plantpro_hostel_stays').insert({ worker_id: workerId, hostel_id: hostelId, move_in_date: moveInDate })
  if (error) throw error
  revalidatePath('/plantpro/hostel')
}

export async function moveOutStay(stayId: number, moveOutDate: string) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_hostel_stays').update({ move_out_date: moveOutDate }).eq('id', stayId)
  if (error) throw error
  revalidatePath('/plantpro/hostel')
}

export async function createBillItemType(name: string, chargeToWorkers: boolean) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_hostel_bill_item_types').insert({ name, charge_to_workers: chargeToWorkers })
  if (error) throw error
  revalidatePath('/plantpro/hostel')
}

export async function updateBillItemType(id: number, patch: { name?: string; charge_to_workers?: boolean }) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_hostel_bill_item_types').update(patch).eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/hostel')
}

export async function deleteBillItemType(id: number) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_hostel_bill_item_types').delete().eq('id', id)
  if (error) friendlyDeleteError(error, 'a saved bill line item')
  revalidatePath('/plantpro/hostel')
}

// Upserts the bill header and REPLACES all line items (delete-then-recreate)
// — does not write to workers; that's a separate explicit "apply" step.
export async function saveHostelBill(hostelId: number, month: string, items: { item_type_id: number; amount: number }[]) {
  const { supabase } = await requirePlantproAccess()
  const { data: bill, error: billErr } = await supabase.from('plantpro_hostel_utility_bills')
    .upsert({ hostel_id: hostelId, month }, { onConflict: 'hostel_id,month' }).select('id').single()
  if (billErr) throw billErr

  await supabase.from('plantpro_hostel_bill_line_items').delete().eq('bill_id', bill.id)
  if (items.length > 0) {
    const { error } = await supabase.from('plantpro_hostel_bill_line_items').insert(items.map(it => ({ bill_id: bill.id, item_type_id: it.item_type_id, amount: it.amount })))
    if (error) throw error
  }
  revalidatePath('/plantpro/hostel')
  return bill.id
}

// Read-only proration preview — writes nothing. `chargeableAmount` is the
// in-progress (possibly unsaved) total from the client's item list, mirroring
// PMS's GET .../bills preview.
export async function previewHostelBillProration(hostelId: number, month: string, chargeableAmount: number) {
  const { supabase } = await requirePlantproAccess()
  const { data: stays, error } = await supabase.from('plantpro_hostel_stays')
    .select('worker_id, move_in_date, move_out_date, worker:plantpro_workers(name)').eq('hostel_id', hostelId)
  if (error) throw error

  const withDays = (stays || [])
    .map((s: any) => ({ worker_id: s.worker_id, worker_name: s.worker?.name || `#${s.worker_id}`, days: daysStayedInMonth(s.move_in_date, s.move_out_date, month) }))
    .filter((s: any) => s.days > 0)
  const shares = computeProration(chargeableAmount, withDays.map((s: any) => ({ workerId: s.worker_id, days: s.days })))
  const totalPaxDays = withDays.reduce((s: number, o: any) => s + o.days, 0)

  return {
    occupants: withDays.map((s: any) => ({ worker_id: s.worker_id, worker_name: s.worker_name, days: s.days, share: shares[s.worker_id] || 0 })),
    totalPaxDays,
  }
}

// Recomputes the chargeable subtotal from SAVED line items, prorates, and
// writes each occupant's share into their `utility` pay column (falls back
// to the first DEDUCT column if none exists) — a real financial write,
// confirm-guarded client-side, matching PMS's apply endpoint.
export async function applyHostelBill(billId: number) {
  const { supabase } = await requirePlantproAccess()

  const { data: bill, error: billErr } = await supabase.from('plantpro_hostel_utility_bills').select('id, hostel_id, month').eq('id', billId).single()
  if (billErr) throw billErr

  const { data: lineItems, error: liErr } = await supabase.from('plantpro_hostel_bill_line_items')
    .select('amount, item_type:plantpro_hostel_bill_item_types(charge_to_workers)').eq('bill_id', billId)
  if (liErr) throw liErr
  const chargeableAmount = (lineItems || []).filter((li: any) => li.item_type?.charge_to_workers).reduce((s: number, li: any) => s + Number(li.amount), 0)

  let { data: targetColumn } = await supabase.from('plantpro_pay_columns').select('id, key').eq('key', 'utility').maybeSingle()
  if (!targetColumn) {
    const { data: fallback } = await supabase.from('plantpro_pay_columns').select('id, key').eq('type', 'DEDUCT').order('sort_order').limit(1).maybeSingle()
    targetColumn = fallback || null
  }
  if (!targetColumn) throw new Error('No Utility (or DEDUCT) pay column exists to apply into.')

  const { data: stays } = await supabase.from('plantpro_hostel_stays').select('worker_id, move_in_date, move_out_date').eq('hostel_id', bill.hostel_id)
  const withDays = (stays || [])
    .map((s: any) => ({ workerId: s.worker_id, days: daysStayedInMonth(s.move_in_date, s.move_out_date, bill.month) }))
    .filter((s: any) => s.days > 0)
  const shares = computeProration(chargeableAmount, withDays)

  for (const [workerIdStr, share] of Object.entries(shares)) {
    const { error } = await supabase.from('plantpro_worker_pay_values')
      .upsert({ worker_id: Number(workerIdStr), pay_column_id: targetColumn.id, value: share }, { onConflict: 'worker_id,pay_column_id' })
    if (error) throw error
  }
  await supabase.from('plantpro_hostel_utility_bills').update({ applied_at: new Date().toISOString() }).eq('id', billId)
  revalidatePath('/plantpro/hostel')
  revalidatePath('/plantpro/hr')
  return Object.keys(shares).length
}

export async function applyMultiplierPayColumnToAllWorkers(id: number) {
  const { supabase } = await requirePlantproAccess()

  const { data: col, error: colErr } = await supabase.from('plantpro_pay_columns').select('id, compute_mode, multiplier_percent').eq('id', id).single()
  if (colErr) throw colErr
  if (col.compute_mode !== 'MULTIPLIER') throw new Error('This column is not a multiplier column.')

  const { data: bases } = await supabase.from('plantpro_pay_column_bases').select('base_column_id').eq('column_id', id)
  const baseColumnIds = (bases || []).map(b => b.base_column_id)

  const { data: workers, error: workersErr } = await supabase.from('plantpro_workers').select('id')
  if (workersErr) throw workersErr

  let updated = 0
  for (const w of workers) {
    let sum = 0
    if (baseColumnIds.length > 0) {
      const { data: baseValues } = await supabase.from('plantpro_worker_pay_values')
        .select('value').eq('worker_id', w.id).in('pay_column_id', baseColumnIds)
      sum = (baseValues || []).reduce((s, v) => s + Number(v.value), 0)
    }
    const value = ((col.multiplier_percent || 0) / 100) * sum
    const { error } = await supabase.from('plantpro_worker_pay_values')
      .upsert({ worker_id: w.id, pay_column_id: id, value }, { onConflict: 'worker_id,pay_column_id' })
    if (error) throw error
    updated++
  }
  revalidatePath('/plantpro/config')
  revalidatePath('/plantpro/hr')
  return updated
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function createDocumentType(name: string, scope: 'WORKER' | 'HOSTEL' | 'BOTH') {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_document_types').insert({ name, scope })
  if (error) throw error
  revalidatePath('/plantpro/documents')
}

export async function updateDocumentType(id: number, patch: { name?: string; scope?: 'WORKER' | 'HOSTEL' | 'BOTH' }) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_document_types').update(patch).eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/documents')
}

export async function deleteDocumentType(id: number) {
  const { supabase } = await requirePlantproAccess()
  const { error } = await supabase.from('plantpro_document_types').delete().eq('id', id)
  if (error) friendlyDeleteError(error, 'existing documents')
  revalidatePath('/plantpro/documents')
}

// Uploads the file to the "hr" Drive subfolder (flat structure, filename
// encodes owner+type+timestamp), then inserts the metadata row pointing
// stored_name at the returned Drive file id.
export async function uploadPlantproDocument(formData: FormData) {
  const { supabase } = await requirePlantproAccess()

  const ownerType = formData.get('ownerType') as 'WORKER' | 'HOSTEL'
  const ownerId = Number(formData.get('ownerId'))
  const documentTypeId = Number(formData.get('documentTypeId'))
  const issueDate = (formData.get('issueDate') as string) || null
  const expiryDate = (formData.get('expiryDate') as string) || null
  const remarks = (formData.get('remarks') as string) || null
  const file = formData.get('file') as File
  if (!ownerType || !ownerId || !documentTypeId || !file) throw new Error('Missing required fields')

  const buffer = Buffer.from(await file.arrayBuffer())
  const timestamp = Date.now()
  const driveFilename = `${ownerType}${ownerId}_doctype${documentTypeId}_${timestamp}_${file.name}`
  const fileId = await uploadToDrive(buffer, 'hr', driveFilename, file.type || 'application/octet-stream')

  const { error } = await supabase.from('plantpro_documents').insert({
    owner_type: ownerType,
    worker_id: ownerType === 'WORKER' ? ownerId : null,
    hostel_id: ownerType === 'HOSTEL' ? ownerId : null,
    document_type_id: documentTypeId,
    file_name: file.name,
    stored_name: fileId,
    mime_type: file.type || 'application/octet-stream',
    issue_date: issueDate,
    expiry_date: expiryDate,
    remarks,
  })
  if (error) throw error
  revalidatePath('/plantpro/documents')
}

export async function deletePlantproDocument(id: number) {
  const { supabase } = await requirePlantproAccess()
  const { data: doc, error: fetchErr } = await supabase.from('plantpro_documents').select('stored_name').eq('id', id).single()
  if (fetchErr) throw fetchErr
  if (doc?.stored_name) await deleteFromDrive(doc.stored_name)
  const { error } = await supabase.from('plantpro_documents').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/plantpro/documents')
}

// ---------------------------------------------------------------------------
// Import Wizard (timecard PDF + worker-details Excel) — ported from PMS's
// /api/import/preview + /api/import/commit. Unlike PMS (which cached the
// preview to a local JSON file keyed by importId, since Prisma/SQLite ran on
// the same box as the upload), this passes the full preview payload back to
// the client and forward to commit directly — a disk cache doesn't fit a
// serverless deployment, and Server Actions can carry the JSON either way.
// ---------------------------------------------------------------------------

export type ImportPreviewWorker = {
  workerId: string
  name: string
  source: 'both' | 'pdf-only' | 'excel-only'
  isNewWorker: boolean
  checksumOk: boolean | null
  checksumDiff?: { basic: number; ot: number }
  nationality?: string
  line?: string
  days: { day: string; basic: number; ot: number }[]
  excel?: {
    nationality: string
    passportNo: string
    passportExpiry: string | null
    dateOfBirth: string | null
    permitExpiry: string | null
    salary: number | null
    hostelAddress: string
    dateJoined: string | null
  }
  hostelMatch?: { hostelId: number | null; hostelName: string; isNew: boolean }
}

export type ImportPreviewResult = {
  workers: ImportPreviewWorker[]
  period: { month: string; days: string[] } | null
  excelErrors: { rowNumber: number; message: string }[]
}

export async function previewPlantproImport(formData: FormData): Promise<ImportPreviewResult> {
  const { supabase } = await requirePlantproAccess()

  const pdfFile = formData.get('pdf') as File | null
  const excelFile = formData.get('excel') as File | null
  if ((!pdfFile || pdfFile.size === 0) && (!excelFile || excelFile.size === 0)) {
    throw new Error('At least one of pdf or excel is required.')
  }

  const timecard = pdfFile && pdfFile.size > 0 ? await parseTimecardPdf(Buffer.from(await pdfFile.arrayBuffer())) : null
  const excel = excelFile && excelFile.size > 0 ? await parseWorkerExcel(Buffer.from(await excelFile.arrayBuffer())) : null

  const { data: existingWorkers } = await supabase.from('plantpro_workers').select('id, worker_no, name')
  const existingByWorkerId = new Map((existingWorkers || []).map(w => [w.worker_no, w]))
  const existingByName = new Map((existingWorkers || []).map(w => [normalizeName(w.name), w]))

  const { data: existingHostels } = await supabase.from('plantpro_hostels').select('id, name, address')
  const hostelByAddress = new Map((existingHostels || []).map(h => [normalizeAddress(h.address || h.name), h]))

  function matchHostel(address: string): { hostelId: number | null; hostelName: string; isNew: boolean } {
    const norm = normalizeAddress(address)
    if (!norm) return { hostelId: null, hostelName: '', isNew: false }
    const found = hostelByAddress.get(norm)
    if (found) return { hostelId: found.id, hostelName: found.name, isNew: false }
    return { hostelId: null, hostelName: address.trim(), isNew: true }
  }

  function excelFieldsOf(row: ExcelWorkerRow) {
    return {
      nationality: row.nationality, passportNo: row.passportNo, passportExpiry: row.passportExpiry,
      dateOfBirth: row.dateOfBirth, permitExpiry: row.permitExpiry, salary: row.salary,
      hostelAddress: row.hostelAddress, dateJoined: row.dateJoined,
    }
  }

  const excelRows = excel?.rows || []
  const excelByNormName = new Map(excelRows.map(r => [normalizeName(r.name), r]))
  const matchedExcelNames = new Set<string>()

  const workers: ImportPreviewWorker[] = []

  if (timecard) {
    for (const w of timecard.workers) {
      const key = normalizeName(w.name)
      const excelRow = excelByNormName.get(key)
      if (excelRow) matchedExcelNames.add(key)
      const existing = existingByWorkerId.get(w.workerId)
      const sumBasic = w.days.reduce((s, d) => s + d.basic, 0)
      const sumOt = w.days.reduce((s, d) => s + d.ot, 0)
      workers.push({
        workerId: w.workerId, name: w.name, source: excelRow ? 'both' : 'pdf-only', isNewWorker: !existing,
        checksumOk: w.checksumOk,
        checksumDiff: w.checksumOk === false && w.summaryBasic !== null && w.summaryOt !== null
          ? { basic: sumBasic - w.summaryBasic, ot: sumOt - w.summaryOt } : undefined,
        nationality: excelRow?.nationality || w.nationality, line: w.line, days: w.days,
        excel: excelRow ? excelFieldsOf(excelRow) : undefined,
        hostelMatch: excelRow?.hostelAddress ? matchHostel(excelRow.hostelAddress) : undefined,
      })
    }
  }

  // Excel rows with no PDF counterpart: match an EXISTING DB worker by name
  // (so master-data-only updates still land on the right worker); else
  // synthesize a placeholder workerId for a brand-new worker record.
  for (const row of excelRows) {
    const key = normalizeName(row.name)
    if (matchedExcelNames.has(key)) continue
    const existing = existingByName.get(key)
    const workerId = existing ? existing.worker_no : `EXCEL-${row.rowNumber}`
    workers.push({
      workerId, name: row.name, source: 'excel-only', isNewWorker: !existing, checksumOk: null,
      nationality: row.nationality, days: [], excel: excelFieldsOf(row),
      hostelMatch: row.hostelAddress ? matchHostel(row.hostelAddress) : undefined,
    })
  }

  const period = timecard ? { month: timecard.month, days: timecard.period.days } : null
  return { workers, period, excelErrors: excel?.errors || [] }
}

export type ImportCommitSummary = {
  workersCreated: number; workersUpdated: number; timesheetDaysWritten: number
  hostelsCreated: number; hostelStaysCreated: number; documentsCreated: number
  salaryValuesSet: number; skipped: number
}

export async function commitPlantproImport(workers: ImportPreviewWorker[], month: string | null, excludeWorkerIds: string[]): Promise<ImportCommitSummary> {
  const { supabase } = await requirePlantproAccess()
  const exclude = new Set(excludeWorkerIds)

  const { data: payColumn } = await supabase.from('plantpro_pay_columns').select('id').eq('key', 'payrate').maybeSingle()

  const totals: ImportCommitSummary = {
    workersCreated: 0, workersUpdated: 0, timesheetDaysWritten: 0,
    hostelsCreated: 0, hostelStaysCreated: 0, documentsCreated: 0, salaryValuesSet: 0, skipped: 0,
  }

  for (const w of workers) {
    if (exclude.has(w.workerId)) { totals.skipped++; continue }

    const { data: existing } = await supabase.from('plantpro_workers').select('id').eq('worker_no', w.workerId).maybeSingle()
    const data: Record<string, unknown> = {
      name: w.name,
      line: w.line || undefined,
      nationality: w.nationality || w.excel?.nationality || undefined,
      date_of_birth: w.excel?.dateOfBirth || undefined,
      date_joined: w.excel?.dateJoined || undefined,
    }
    let workerId: number
    if (existing) {
      const { error } = await supabase.from('plantpro_workers').update(data).eq('id', existing.id)
      if (error) throw error
      workerId = existing.id
      totals.workersUpdated++
    } else {
      const { data: created, error } = await supabase.from('plantpro_workers').insert({ worker_no: w.workerId, status: 'Active', ...data }).select('id').single()
      if (error) throw error
      workerId = created.id
      totals.workersCreated++
    }

    if (month && w.days.length > 0) {
      for (const d of w.days) {
        const day = d.day.slice(8, 10)
        const { error } = await supabase.from('plantpro_timesheet_days')
          .upsert({ worker_id: workerId, month, day, basic: d.basic, ot: d.ot }, { onConflict: 'worker_id,month,day' })
        if (error) throw error
        totals.timesheetDaysWritten++
      }
    }

    if (w.excel) {
      if (payColumn && w.excel.salary != null) {
        const { error } = await supabase.from('plantpro_worker_pay_values')
          .upsert({ worker_id: workerId, pay_column_id: payColumn.id, value: w.excel.salary }, { onConflict: 'worker_id,pay_column_id' })
        if (error) throw error
        totals.salaryValuesSet++
      }

      if (w.excel.hostelAddress) {
        const norm = normalizeAddress(w.excel.hostelAddress)
        const { data: allHostels } = await supabase.from('plantpro_hostels').select('id, name, address')
        let hostel = (allHostels || []).find(h => normalizeAddress(h.address || h.name) === norm) || null
        if (!hostel) {
          const { data: created } = await supabase.from('plantpro_hostels')
            .insert({ name: w.excel.hostelAddress.trim(), address: w.excel.hostelAddress.trim(), status: 'Active' })
            .select('id, name, address').single()
          if (created) { hostel = created; totals.hostelsCreated++ }
        }
        if (hostel) {
          const moveInDate = w.excel.dateJoined || new Date().toISOString().slice(0, 10)
          await assignHostelStay(workerId, hostel.id, moveInDate)
          totals.hostelStaysCreated++
        }
      }

      const docSpecs: { typeName: string; expiryDate: string | null }[] = [
        { typeName: 'Passport', expiryDate: w.excel.passportExpiry },
        { typeName: 'Permit', expiryDate: w.excel.permitExpiry },
      ]
      for (const spec of docSpecs) {
        if (!spec.expiryDate) continue
        const { data: docType } = await supabase.from('plantpro_document_types').select('id').eq('name', spec.typeName).maybeSingle()
        if (!docType) continue
        const { data: dup } = await supabase.from('plantpro_documents').select('id').eq('worker_id', workerId).eq('document_type_id', docType.id).eq('expiry_date', spec.expiryDate).maybeSingle()
        if (dup) continue
        const { error } = await supabase.from('plantpro_documents').insert({
          owner_type: 'WORKER', worker_id: workerId, document_type_id: docType.id,
          expiry_date: spec.expiryDate, remarks: 'Imported from worker-details Excel',
        })
        if (error) throw error
        totals.documentsCreated++
      }
    }
  }

  revalidatePath('/plantpro/hr')
  revalidatePath('/plantpro/timesheet')
  revalidatePath('/plantpro/hostel')
  revalidatePath('/plantpro/documents')
  return totals
}
