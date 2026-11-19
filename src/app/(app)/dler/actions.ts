'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireDlerRole } from './guard'
import {
  aggregateDailyAndMonthlyDler,
  daysInMonth,
  getDayType,
  lastNMonthsList,
  type DlerAllocation,
  type DlerDailyM3,
  type DlerDailyOt,
  type DlerDashboardResult,
  type DlerDepartment,
  type DlerFactory,
  type DlerGpEntry,
  type DlerMonthlyPay,
  type DlerPerson,
  type DlerProject,
  type DlerSettings,
} from '@/lib/dler-math'

const DEFAULT_SETTINGS: DlerSettings = {
  id: 1,
  working_days_mode: 'fixed_26',
  fixed_working_days: 26,
  standard_hours_per_day: 8,
  normal_ot_multiplier: 1.5,
  sunday_ot_multiplier: 2.0,
  holiday_ot_multiplier: 3.0,
  include_base_on_sunday_holiday: false,
  erp_sync_url: null,
  ot_sync_mode: 'manual',
}

async function fetchAll<T>(buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await buildPage(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

function revalidateDlerAll() {
  revalidatePath('/dler')
  revalidatePath('/dler/dashboard')
  revalidatePath('/dler/org-chart')
  revalidatePath('/dler/workers')
  revalidatePath('/dler/staff')
  revalidatePath('/dler/m3')
  revalidatePath('/dler/gp')
  revalidatePath('/dler/config')
}

function prevMonthStr(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const dt = new Date(y, m - 2, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

// ============================================================================
// Dashboard Aggregation (Admin & Viewer only — returns aggregated costs only)
// ============================================================================

export async function getDlerDashboardData(monthInput: string, dateInput: string): Promise<DlerDashboardResult> {
  await requireDlerRole(['admin', 'viewer'])
  const admin = createAdminClient()

  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput)
    ? monthInput
    : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7)

  const selectedDate =
    /^\d{4}-\d{2}-\d{2}$/.test(dateInput) && dateInput.startsWith(month)
      ? dateInput
      : `${month}-01`

  const months = lastNMonthsList(6, month)
  const firstMonth = months[0]
  const lastMonth = months[months.length - 1]
  const rangeStart = `${firstMonth}-01`
  const rangeEnd = `${lastMonth}-${String(daysInMonth(lastMonth)).padStart(2, '0')}`

  const [
    settingsRes,
    holidaysRes,
    factoriesRes,
    departmentsRes,
    projectsRes,
    people,
    allocations,
    monthlyPays,
    dailyOts,
    dailyM3s,
    gpEntries,
  ] = await Promise.all([
    admin.from('dler_settings').select('*').eq('id', 1).maybeSingle(),
    admin.from('dler_holidays').select('date').gte('date', rangeStart).lte('date', rangeEnd),
    admin.from('dler_factories').select('*').order('name'),
    admin.from('dler_departments').select('*').order('sort_order').order('name'),
    admin.from('dler_projects').select('*').order('name'),
    fetchAll<DlerPerson>((from, to) =>
      admin.from('dler_people').select('*').order('person_type').order('emp_no').range(from, to)
    ),
    fetchAll<DlerAllocation>((from, to) =>
      admin.from('dler_project_allocations').select('person_id, project_id, percentage').range(from, to)
    ),
    fetchAll<DlerMonthlyPay>((from, to) =>
      admin.from('dler_monthly_pay').select('*').in('month', months).range(from, to)
    ),
    fetchAll<DlerDailyOt>((from, to) =>
      admin.from('dler_daily_ot').select('*').gte('work_date', rangeStart).lte('work_date', rangeEnd).range(from, to)
    ),
    fetchAll<DlerDailyM3>((from, to) =>
      admin.from('dler_daily_m3').select('*').gte('entry_date', rangeStart).lte('entry_date', rangeEnd).range(from, to)
    ),
    fetchAll<DlerGpEntry>((from, to) =>
      admin.from('dler_gp_entries').select('*').in('month', months).range(from, to)
    ),
  ])

  if (factoriesRes.error) throw factoriesRes.error
  if (departmentsRes.error) throw departmentsRes.error
  if (projectsRes.error) throw projectsRes.error

  const settings: DlerSettings = (settingsRes.data as DlerSettings | null) ?? DEFAULT_SETTINGS
  const holidays = (holidaysRes.data ?? []).map((h: { date: string }) => h.date)

  return aggregateDailyAndMonthlyDler({
    selectedDate,
    months,
    settings,
    holidays,
    factories: (factoriesRes.data ?? []) as DlerFactory[],
    departments: (departmentsRes.data ?? []) as DlerDepartment[],
    projects: (projectsRes.data ?? []) as DlerProject[],
    people,
    allocations,
    monthlyPays,
    dailyOts,
    dailyM3s,
    gpEntries,
  })
}

// ============================================================================
// Org Chart & Project % Allocations (Admin, HR Worker -> WORKER, HR Staff -> STAFF)
// ============================================================================

export async function saveDlerPerson(input: {
  id?: number | null
  person_type: 'STAFF' | 'WORKER'
  emp_no: string
  name: string
  designation?: string | null
  department_id?: number | null
  reports_to_id?: number | null
  status?: 'Active' | 'Inactive' | 'On Leave'
  remarks?: string | null
  profile_id?: string | null
}) {
  const { supabase, role } = await requireDlerRole(['admin', 'hr_worker', 'hr_staff'])
  if (role === 'hr_worker' && input.person_type !== 'WORKER') {
    throw new Error('HR Worker role can only manage Workers')
  }
  if (role === 'hr_staff' && input.person_type !== 'STAFF') {
    throw new Error('HR Staff role can only manage Staff')
  }

  const empNo = input.emp_no.trim()
  const name = input.name.trim()
  if (!empNo || !name) throw new Error('ID and Name are required')

  if (input.id && input.reports_to_id === input.id) {
    throw new Error('A person cannot report to themselves')
  }

  const payload = {
    person_type: input.person_type,
    emp_no: empNo,
    name,
    designation: input.designation?.trim() || null,
    department_id: input.department_id ?? null,
    reports_to_id: input.reports_to_id ?? null,
    status: input.status ?? 'Active',
    remarks: input.remarks?.trim() || null,
    profile_id: input.profile_id || null,
  }

  let savedId: number
  if (input.id) {
    const { data: existing } = await supabase
      .from('dler_people')
      .select('person_type')
      .eq('id', input.id)
      .single()
    if (!existing) throw new Error('Person not found')
    if (role === 'hr_worker' && existing.person_type !== 'WORKER') throw new Error('Forbidden')
    if (role === 'hr_staff' && existing.person_type !== 'STAFF') throw new Error('Forbidden')

    const { error } = await supabase.from('dler_people').update(payload).eq('id', input.id)
    if (error) throw error
    savedId = input.id
  } else {
    const { data: inserted, error } = await supabase.from('dler_people').insert(payload).select('id').single()
    if (error) throw error
    savedId = inserted.id
  }
  revalidateDlerAll()
  return savedId
}

export async function deleteDlerPerson(id: number) {
  const { supabase, role } = await requireDlerRole(['admin', 'hr_worker', 'hr_staff'])
  const { data: existing } = await supabase.from('dler_people').select('person_type').eq('id', id).single()
  if (!existing) throw new Error('Person not found')
  if (role === 'hr_worker' && existing.person_type !== 'WORKER') throw new Error('Forbidden')
  if (role === 'hr_staff' && existing.person_type !== 'STAFF') throw new Error('Forbidden')

  const { error } = await supabase.from('dler_people').delete().eq('id', id)
  if (error) throw error
  revalidateDlerAll()
}

export async function updatePersonParentAndDept(
  personId: number,
  patch: { department_id?: number | null; reports_to_id?: number | null; status?: 'Active' | 'Inactive' | 'On Leave' }
) {
  const { supabase, role } = await requireDlerRole(['admin', 'hr_worker', 'hr_staff'])
  const { data: existing } = await supabase.from('dler_people').select('person_type').eq('id', personId).single()
  if (!existing) throw new Error('Person not found')
  if (role === 'hr_worker' && existing.person_type !== 'WORKER') throw new Error('Forbidden')
  if (role === 'hr_staff' && existing.person_type !== 'STAFF') throw new Error('Forbidden')
  if (patch.reports_to_id === personId) throw new Error('Cannot report to self')

  const { error } = await supabase.from('dler_people').update(patch).eq('id', personId)
  if (error) throw error
  revalidateDlerAll()
}

export async function savePersonProjectAllocations(
  personId: number,
  rows: { project_id: number; percentage: number }[]
) {
  const { supabase, role } = await requireDlerRole(['admin', 'hr_worker', 'hr_staff'])
  const { data: existing } = await supabase.from('dler_people').select('person_type').eq('id', personId).single()
  if (!existing) throw new Error('Person not found')
  if (role === 'hr_worker' && existing.person_type !== 'WORKER') throw new Error('Forbidden')
  if (role === 'hr_staff' && existing.person_type !== 'STAFF') throw new Error('Forbidden')

  const clean = rows.filter(r => r.percentage > 0)
  let total = 0
  for (const r of clean) {
    if (Number.isNaN(r.percentage) || r.percentage < 0 || r.percentage > 100) {
      throw new Error('Project % must be between 0 and 100')
    }
    total += r.percentage
  }
  if (total > 100.01) {
    throw new Error(`Total project allocation (${total.toFixed(1)}%) cannot exceed 100%`)
  }

  const { error: delErr } = await supabase.from('dler_project_allocations').delete().eq('person_id', personId)
  if (delErr) throw delErr

  if (clean.length > 0) {
    const { error: insErr } = await supabase
      .from('dler_project_allocations')
      .insert(clean.map(r => ({ person_id: personId, project_id: r.project_id, percentage: r.percentage })))
    if (insErr) throw insErr
  }
  revalidateDlerAll()
}

/** Adds a STAFF row for every login (profile) that is not yet in the DLER Org Chart. */
export async function syncStaffFromLogins(): Promise<{ inserted: number }> {
  await requireDlerRole(['admin', 'hr_staff'])
  const admin = createAdminClient()

  const [{ data: profiles, error: pErr }, { data: linked, error: lErr }, usersRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, is_active'),
    admin.from('dler_people').select('profile_id').not('profile_id', 'is', null),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (pErr) throw pErr
  if (lErr) throw lErr

  const emailById = new Map((usersRes.data?.users ?? []).map(u => [u.id, (u.email ?? '').trim()]))
  const linkedSet = new Set((linked ?? []).map(l => l.profile_id as string))
  const rows = (profiles ?? [])
    .filter(p => !linkedSet.has(p.id))
    .map(p => {
      const empNo = `USR-${String(p.id).slice(0, 8)}`
      return {
        person_type: 'STAFF' as const,
        emp_no: empNo,
        name: (p.full_name ?? '').trim() || emailById.get(p.id) || empNo,
        status: p.is_active ? ('Active' as const) : ('Inactive' as const),
        profile_id: p.id,
      }
    })

  if (rows.length > 0) {
    const { error } = await admin.from('dler_people').upsert(rows, { onConflict: 'person_type,emp_no' })
    if (error) throw error
  }
  revalidateDlerAll()
  return { inserted: rows.length }
}

export async function syncWorkersFromPlantpro(): Promise<{ inserted: number; updated: number }> {
  await requireDlerRole(['admin', 'hr_worker'])
  const admin = createAdminClient()

  const [{ data: hrWorkers, error: wErr }, { data: hrSups }, { data: existingPeople }] = await Promise.all([
    admin.from('plantpro_workers').select('id, worker_no, name, line, designation, supervisor_id, status').order('id'),
    admin.from('plantpro_supervisors').select('id, name, status'),
    admin.from('dler_people').select('id, person_type, emp_no, plantpro_worker_id'),
  ])
  if (wErr) throw wErr

  const supEmpMap = new Map<number, number>()
  for (const p of existingPeople ?? []) {
    if (p.person_type === 'STAFF' && p.emp_no.startsWith('SUP-')) {
      const sid = Number(p.emp_no.slice(4))
      if (!Number.isNaN(sid)) supEmpMap.set(sid, p.id)
    }
  }

  // Ensure any new plantpro supervisors exist as STAFF seats
  for (const s of hrSups ?? []) {
    if (!supEmpMap.has(s.id)) {
      const { data: created } = await admin
        .from('dler_people')
        .upsert(
          { person_type: 'STAFF', emp_no: `SUP-${s.id}`, name: s.name, designation: 'Supervisor', status: s.status },
          { onConflict: 'person_type,emp_no' }
        )
        .select('id')
        .single()
      if (created) supEmpMap.set(s.id, created.id)
    }
  }

  const byPlantproId = new Map<number, number>()
  const byEmpNo = new Map<string, number>()
  for (const p of existingPeople ?? []) {
    if (p.plantpro_worker_id != null) byPlantproId.set(p.plantpro_worker_id, p.id)
    if (p.person_type === 'WORKER') byEmpNo.set(p.emp_no, p.id)
  }

  let inserted = 0
  let updated = 0

  for (const w of hrWorkers ?? []) {
    const existingId = byPlantproId.get(w.id) ?? byEmpNo.get(w.worker_no)
    const reportsTo = w.supervisor_id ? supEmpMap.get(w.supervisor_id) ?? null : null
    if (existingId) {
      const { error } = await admin
        .from('dler_people')
        .update({
          emp_no: w.worker_no,
          name: w.name,
          status: w.status,
          plantpro_worker_id: w.id,
        })
        .eq('id', existingId)
      if (error) throw error
      updated++
    } else {
      const { error } = await admin.from('dler_people').insert({
        person_type: 'WORKER',
        emp_no: w.worker_no,
        name: w.name,
        designation: w.designation || (w.line ? w.line.trim() : null),
        reports_to_id: reportsTo,
        status: w.status,
        plantpro_worker_id: w.id,
        remarks: w.line ? `HR Line: ${w.line.trim()}` : null,
      })
      if (error) throw error
      inserted++
    }
  }

  revalidateDlerAll()
  return { inserted, updated }
}

// ============================================================================
// Worker & Staff Pay + Daily OT (Strict role isolation)
// ============================================================================

async function assertPeopleType(
  supabase: Awaited<ReturnType<typeof requireDlerRole>>['supabase'],
  personIds: number[],
  expectedType: 'WORKER' | 'STAFF'
) {
  if (personIds.length === 0) return
  const { data, error } = await supabase
    .from('dler_people')
    .select('id, person_type')
    .in('id', personIds)
  if (error) throw error
  if (!data || data.length !== new Set(personIds).size) {
    throw new Error('Some person records were not found')
  }
  for (const row of data) {
    if (row.person_type !== expectedType) {
      throw new Error(`Role mismatch: expected ${expectedType} records only`)
    }
  }
}

export async function saveMonthlyPayBatch(
  month: string,
  personType: 'WORKER' | 'STAFF',
  rows: {
    person_id: number
    basic_pay: number
    allowance: number
    employer_statutory: number
    deductions: number
    working_days_override?: number | null
    hourly_rate_override?: number | null
    remarks?: string | null
  }[]
) {
  const allowedRole = personType === 'WORKER' ? 'hr_worker' : 'hr_staff'
  const { supabase, user } = await requireDlerRole(['admin', allowedRole])

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month')
  if (rows.length === 0) return

  await assertPeopleType(
    supabase,
    rows.map(r => r.person_id),
    personType
  )

  const now = new Date().toISOString()
  const payload = rows.map(r => {
    const basic = Number(r.basic_pay) || 0
    const allowance = Number(r.allowance) || 0
    const stat = Number(r.employer_statutory) || 0
    const ded = Number(r.deductions) || 0
    const gross = Math.max(0, Math.round((basic + allowance + stat - ded) * 100) / 100)
    return {
      person_id: r.person_id,
      month,
      basic_pay: basic,
      allowance,
      employer_statutory: stat,
      deductions: ded,
      gross_pay: gross,
      working_days_override: r.working_days_override && r.working_days_override > 0 ? r.working_days_override : null,
      hourly_rate_override: r.hourly_rate_override && r.hourly_rate_override > 0 ? r.hourly_rate_override : null,
      remarks: r.remarks?.trim() || null,
      updated_by: user.id,
      updated_at: now,
    }
  })

  const { error } = await supabase
    .from('dler_monthly_pay')
    .upsert(payload, { onConflict: 'person_id,month' })
  if (error) throw error
  revalidateDlerAll()
}

export async function copyPreviousMonthPay(month: string, personType: 'WORKER' | 'STAFF'): Promise<number> {
  const allowedRole = personType === 'WORKER' ? 'hr_worker' : 'hr_staff'
  const { supabase, user } = await requireDlerRole(['admin', allowedRole])

  const prev = prevMonthStr(month)
  const { data: people, error: pErr } = await supabase
    .from('dler_people')
    .select('id')
    .eq('person_type', personType)
  if (pErr) throw pErr

  const personIds = (people ?? []).map(p => p.id)
  if (personIds.length === 0) return 0

  const { data: prevRows, error: prErr } = await supabase
    .from('dler_monthly_pay')
    .select('*')
    .eq('month', prev)
    .in('person_id', personIds)
  if (prErr) throw prErr

  if (!prevRows || prevRows.length === 0) return 0

  const now = new Date().toISOString()
  const payload = prevRows.map(r => ({
    person_id: r.person_id,
    month,
    basic_pay: r.basic_pay,
    allowance: r.allowance,
    employer_statutory: r.employer_statutory,
    deductions: r.deductions,
    gross_pay: r.gross_pay,
    working_days_override: r.working_days_override,
    hourly_rate_override: r.hourly_rate_override,
    remarks: r.remarks,
    updated_by: user.id,
    updated_at: now,
  }))

  const { error } = await supabase.from('dler_monthly_pay').upsert(payload, { onConflict: 'person_id,month' })
  if (error) throw error
  revalidateDlerAll()
  return payload.length
}

export async function saveDailyOtCell(
  personType: 'WORKER' | 'STAFF',
  personId: number,
  workDate: string,
  patch: { ot_hours?: number; is_absent?: boolean; basic_hours?: number }
) {
  const allowedRole = personType === 'WORKER' ? 'hr_worker' : 'hr_staff'
  const { supabase, user } = await requireDlerRole(['admin', allowedRole])

  await assertPeopleType(supabase, [personId], personType)

  const [{ data: holiday }, { data: existing }] = await Promise.all([
    supabase.from('dler_holidays').select('date').eq('date', workDate).maybeSingle(),
    supabase
      .from('dler_daily_ot')
      .select('*')
      .eq('person_id', personId)
      .eq('work_date', workDate)
      .maybeSingle(),
  ])

  const dayType = getDayType(workDate, new Set(holiday ? [holiday.date] : []))
  const otHours = Math.max(0, Number(patch.ot_hours ?? existing?.ot_hours ?? 0) || 0)
  const isAbsent = patch.is_absent ?? existing?.is_absent ?? false
  const basicHours =
    patch.basic_hours !== undefined
      ? Number(patch.basic_hours) || 0
      : existing?.basic_hours ?? (dayType === 'normal' ? 8 : 0)

  const { error } = await supabase.from('dler_daily_ot').upsert(
    {
      person_id: personId,
      work_date: workDate,
      basic_hours: isAbsent ? 0 : basicHours,
      ot_hours: otHours,
      day_type: dayType,
      is_absent: isAbsent,
      source: 'manual',
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'person_id,work_date' }
  )
  if (error) throw error
  revalidateDlerAll()
}

export async function bulkFillDailyOt(
  personType: 'WORKER' | 'STAFF',
  personId: number,
  month: string,
  otHours: number
) {
  const allowedRole = personType === 'WORKER' ? 'hr_worker' : 'hr_staff'
  const { supabase, user } = await requireDlerRole(['admin', allowedRole])

  await assertPeopleType(supabase, [personId], personType)

  const n = daysInMonth(month)
  const monthStart = `${month}-01`
  const monthEnd = `${month}-${String(n).padStart(2, '0')}`

  const { data: holidays } = await supabase
    .from('dler_holidays')
    .select('date')
    .gte('date', monthStart)
    .lte('date', monthEnd)
  const holidaySet = new Set((holidays ?? []).map(h => h.date))

  const rows = []
  const now = new Date().toISOString()
  for (let d = 1; d <= n; d++) {
    const dt = `${month}-${String(d).padStart(2, '0')}`
    const dayType = getDayType(dt, holidaySet)
    if (dayType !== 'normal') continue
    rows.push({
      person_id: personId,
      work_date: dt,
      basic_hours: 8,
      ot_hours: Math.max(0, Number(otHours) || 0),
      day_type: dayType,
      is_absent: false,
      source: 'manual' as const,
      updated_by: user.id,
      updated_at: now,
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('dler_daily_ot').upsert(rows, { onConflict: 'person_id,work_date' })
    if (error) throw error
  }
  revalidateDlerAll()
}

export async function syncWorkerOtFromPlantpro(
  month: string,
  sourceChoice: 'timesheet' | 'ot_sessions' = 'timesheet'
): Promise<{ syncedCells: number }> {
  const { user } = await requireDlerRole(['admin', 'hr_worker'])
  const admin = createAdminClient()

  const n = daysInMonth(month)
  const monthStart = `${month}-01`
  const monthEnd = `${month}-${String(n).padStart(2, '0')}`

  const [{ data: workers }, { data: holidays }] = await Promise.all([
    admin
      .from('dler_people')
      .select('id, plantpro_worker_id')
      .eq('person_type', 'WORKER')
      .not('plantpro_worker_id', 'is', null),
    admin.from('dler_holidays').select('date').gte('date', monthStart).lte('date', monthEnd),
  ])

  const dlerIdByPlantpro = new Map<number, number>()
  for (const w of workers ?? []) {
    if (w.plantpro_worker_id != null) dlerIdByPlantpro.set(w.plantpro_worker_id, w.id)
  }
  if (dlerIdByPlantpro.size === 0) return { syncedCells: 0 }

  const holidaySet = new Set((holidays ?? []).map(h => h.date))
  const now = new Date().toISOString()
  const upserts: any[] = []

  if (sourceChoice === 'timesheet') {
    const tsRows = await fetchAll<{ worker_id: number; day: string; basic: number; ot: number }>((from, to) =>
      admin.from('plantpro_timesheet_days').select('worker_id, day, basic, ot').eq('month', month).range(from, to)
    )
    for (const ts of tsRows) {
      const personId = dlerIdByPlantpro.get(ts.worker_id)
      if (!personId) continue
      const dt = `${month}-${String(ts.day).padStart(2, '0')}`
      const dayType = getDayType(dt, holidaySet)
      upserts.push({
        person_id: personId,
        work_date: dt,
        basic_hours: Number(ts.basic) || 0,
        ot_hours: Number(ts.ot) || 0,
        day_type: dayType,
        is_absent: dayType === 'normal' && Number(ts.basic) === 0 && Number(ts.ot) === 0,
        source: 'ot_app_sync',
        external_ref: `plantpro_timesheet:${month}:${ts.day}`,
        updated_by: user.id,
        updated_at: now,
      })
    }
  } else {
    const otRows = await fetchAll<{
      id: number
      worker_id: number
      work_date: string
      approved_minutes: number | null
      eligible_minutes: number
    }>((from, to) =>
      admin
        .from('plantpro_ot_sessions')
        .select('id, worker_id, work_date, approved_minutes, eligible_minutes')
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd)
        .eq('status', 'approved')
        .range(from, to)
    )
    const grouped = new Map<string, { personId: number; date: string; mins: number; refIds: number[] }>()
    for (const s of otRows) {
      const personId = dlerIdByPlantpro.get(s.worker_id)
      if (!personId) continue
      const key = `${personId}:${s.work_date}`
      const cur = grouped.get(key) ?? { personId, date: s.work_date, mins: 0, refIds: [] }
      cur.mins += Number(s.approved_minutes ?? s.eligible_minutes) || 0
      cur.refIds.push(s.id)
      grouped.set(key, cur)
    }
    for (const g of grouped.values()) {
      const dayType = getDayType(g.date, holidaySet)
      upserts.push({
        person_id: g.personId,
        work_date: g.date,
        basic_hours: dayType === 'normal' ? 8 : 0,
        ot_hours: Math.round((g.mins / 60) * 100) / 100,
        day_type: dayType,
        is_absent: false,
        source: 'ot_app_sync',
        external_ref: `plantpro_ot:${g.refIds.join(',')}`,
        updated_by: user.id,
        updated_at: now,
      })
    }
  }

  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500)
    const { error } = await admin.from('dler_daily_ot').upsert(chunk, { onConflict: 'person_id,work_date' })
    if (error) throw error
  }

  revalidateDlerAll()
  return { syncedCells: upserts.length }
}

// ============================================================================
// Daily m3 Input (David + Admin)
// ============================================================================

export async function saveDailyM3Batch(
  entries: {
    entry_date: string
    target_type: 'project' | 'department'
    project_id?: number | null
    department_id?: number | null
    m3_volume: number
    remarks?: string | null
  }[]
) {
  const { supabase, user } = await requireDlerRole(['admin', 'm3_input'])
  if (entries.length === 0) return

  const now = new Date().toISOString()
  const payload = entries.map(e => {
    const targetId = e.target_type === 'project' ? e.project_id : e.department_id
    if (!targetId) throw new Error('Target ID missing for m3 entry')
    return {
      entry_key: `${e.target_type}:${e.entry_date}:${targetId}`,
      entry_date: e.entry_date,
      target_type: e.target_type,
      project_id: e.target_type === 'project' ? targetId : null,
      department_id: e.target_type === 'department' ? targetId : null,
      m3_volume: Number(e.m3_volume) || 0,
      remarks: e.remarks?.trim() || null,
      source: 'manual' as const,
      updated_by: user.id,
      updated_at: now,
    }
  })

  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500)
    const { error } = await supabase.from('dler_daily_m3').upsert(chunk, { onConflict: 'entry_key' })
    if (error) throw error
  }
  revalidateDlerAll()
}

// ============================================================================
// Gross Profit Input (Khai + Admin)
// ============================================================================

export async function saveGpBatch(
  periodType: 'monthly' | 'daily',
  month: string,
  entryDate: string | null,
  entries: {
    target_type: 'project' | 'department' | 'factory'
    target_id: number
    gross_profit: number
    remarks?: string | null
  }[]
) {
  const { supabase, user } = await requireDlerRole(['admin', 'gp_input'])
  if (entries.length === 0) return

  if (periodType === 'daily' && !entryDate) throw new Error('Date required for daily GP entry')

  const now = new Date().toISOString()
  const payload = entries.map(e => {
    const keyPeriod = periodType === 'monthly' ? month : entryDate!
    return {
      entry_key: `${periodType}:${e.target_type}:${keyPeriod}:${e.target_id}`,
      period_type: periodType,
      month: periodType === 'monthly' ? month : entryDate!.slice(0, 7),
      entry_date: periodType === 'daily' ? entryDate : null,
      target_type: e.target_type,
      project_id: e.target_type === 'project' ? e.target_id : null,
      department_id: e.target_type === 'department' ? e.target_id : null,
      factory_id: e.target_type === 'factory' ? e.target_id : null,
      gross_profit: Number(e.gross_profit) || 0,
      remarks: e.remarks?.trim() || null,
      source: 'manual' as const,
      updated_by: user.id,
      updated_at: now,
    }
  })

  const { error } = await supabase.from('dler_gp_entries').upsert(payload, { onConflict: 'entry_key' })
  if (error) throw error
  revalidateDlerAll()
}

// ============================================================================
// Admin Config & Settings (Admin only)
// ============================================================================

export async function saveDlerFactory(id: number | null, name: string) {
  const { supabase } = await requireDlerRole(['admin'])
  const n = name.trim()
  if (!n) throw new Error('Factory name required')
  if (id) {
    const { error } = await supabase.from('dler_factories').update({ name: n }).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('dler_factories').insert({ name: n })
    if (error) throw error
  }
  revalidateDlerAll()
}

export async function deleteDlerFactory(id: number) {
  const { supabase } = await requireDlerRole(['admin'])
  const { error } = await supabase.from('dler_factories').delete().eq('id', id)
  if (error) throw error
  revalidateDlerAll()
}

export async function saveDlerDepartment(
  id: number | null,
  input: { name: string; factory_id: number; kind: 'production' | 'support'; sort_order?: number }
) {
  const { supabase } = await requireDlerRole(['admin'])
  const n = input.name.trim()
  if (!n) throw new Error('Department name required')
  const payload = {
    name: n,
    factory_id: input.factory_id,
    kind: input.kind,
    sort_order: Number(input.sort_order) || 0,
  }
  if (id) {
    const { error } = await supabase.from('dler_departments').update(payload).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('dler_departments').insert(payload)
    if (error) throw error
  }
  revalidateDlerAll()
}

export async function deleteDlerDepartment(id: number) {
  const { supabase } = await requireDlerRole(['admin'])
  const { error } = await supabase.from('dler_departments').delete().eq('id', id)
  if (error) throw error
  revalidateDlerAll()
}

export async function saveDlerProject(
  id: number | null,
  input: {
    name: string
    factory_id: number
    department_id: number | null
    status: 'Active' | 'Inactive'
    erp_code?: string | null
  }
) {
  const { supabase } = await requireDlerRole(['admin'])
  const n = input.name.trim()
  if (!n) throw new Error('Project name required')
  const payload = {
    name: n,
    factory_id: input.factory_id,
    department_id: input.department_id,
    status: input.status,
    erp_code: input.erp_code?.trim() || null,
  }
  if (id) {
    const { error } = await supabase.from('dler_projects').update(payload).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('dler_projects').insert(payload)
    if (error) throw error
  }
  revalidateDlerAll()
}

export async function deleteDlerProject(id: number) {
  const { supabase } = await requireDlerRole(['admin'])
  const { error } = await supabase.from('dler_projects').delete().eq('id', id)
  if (error) throw error
  revalidateDlerAll()
}

export async function saveDlerSettings(patch: Partial<Omit<DlerSettings, 'id'>>) {
  const { supabase } = await requireDlerRole(['admin'])
  const { error } = await supabase
    .from('dler_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
  revalidateDlerAll()
}

export async function addDlerHoliday(date: string, label: string) {
  const { supabase } = await requireDlerRole(['admin'])
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date')
  const { error } = await supabase
    .from('dler_holidays')
    .upsert({ date, label: label.trim() || 'Public Holiday' }, { onConflict: 'date' })
  if (error) throw error
  revalidateDlerAll()
}

export async function removeDlerHoliday(id: number) {
  const { supabase } = await requireDlerRole(['admin'])
  const { error } = await supabase.from('dler_holidays').delete().eq('id', id)
  if (error) throw error
  revalidateDlerAll()
}
