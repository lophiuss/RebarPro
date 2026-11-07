'use server'

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { hourlyRateFromNetPay, multiplierFor, type DayType, type Multipliers } from '@/lib/plantpro-payroll'

async function requirePlantproAuth() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) throw new Error('Not signed in')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'plantpro' })
  if (!hasAccess) throw new Error('Not authorized')

  const { data: canSeeWages } = await supabase.rpc('plantpro_can_see_wages')
  return { supabase, user, canSeeWages: !!canSeeWages }
}

export type AnalyticsFilter = {
  month: string // YYYY-MM
  date?: string // YYYY-MM-DD (optional for single day intraday view)
  line?: string
  supervisorId?: number
  projectId?: number
}

export async function getWorkforceAnalytics(filter: AnalyticsFilter) {
  const { supabase, canSeeWages } = await requirePlantproAuth()
  const month = filter.month
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const monthStart = `${month}-01`
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`

  // 1. Fetch Workers
  let workerQuery = supabase.from('plantpro_workers').select('id, name, worker_no, line, supervisor_id, status').neq('status', 'Inactive')
  if (filter.line) workerQuery = workerQuery.eq('line', filter.line)
  if (filter.supervisorId) workerQuery = workerQuery.eq('supervisor_id', filter.supervisorId)
  const { data: workers } = await workerQuery
  const workerIds = (workers || []).map(w => w.id)

  // 2. Fetch Multipliers & Pay values (if wage authorized)
  const { data: multRow } = await supabase.from('plantpro_timesheet_multiplier').select('*').eq('id', 1).single()
  const multipliers: Multipliers = {
    normalOt: multRow?.normal_ot || 1.5,
    sundayBasic: multRow?.sunday_basic || 1.5,
    sundayOt: multRow?.sunday_ot || 2.0,
    holidayBasic: multRow?.holiday_basic || 2.0,
    holidayOt: multRow?.holiday_ot || 3.0,
  }

  const workerPayRates = new Map<number, number>()
  if (canSeeWages && workerIds.length > 0) {
    const { data: payCols } = await supabase.from('plantpro_pay_columns').select('id, key, include_in_gross, include_in_net_deduct')
    const { data: payVals } = await supabase.from('plantpro_worker_pay_values').select('worker_id, pay_column_id, value').in('worker_id', workerIds)

    const colFlags = (payCols || []).map(c => ({ key: String(c.id), includeInGross: c.include_in_gross, includeInNetDeduct: c.include_in_net_deduct }))
    const valByWorker = new Map<number, Record<string, number>>()
    for (const v of payVals || []) {
      if (!valByWorker.has(v.worker_id)) valByWorker.set(v.worker_id, {})
      valByWorker.get(v.worker_id)![String(v.pay_column_id)] = Number(v.value) || 0
    }

    for (const wid of workerIds) {
      const vals = valByWorker.get(wid) || {}
      let gross = 0, ded = 0
      for (const cf of colFlags) {
        const val = vals[cf.key] || 0
        if (cf.includeInGross) gross += val
        if (cf.includeInNetDeduct) ded += val
      }
      const netPay = gross - ded
      const hourly = hourlyRateFromNetPay(netPay, daysInMonth)
      workerPayRates.set(wid, hourly)
    }
  }

  // 3. Fetch Timesheet Days
  const { data: tsDays } = await supabase
    .from('plantpro_timesheet_days')
    .select('worker_id, day, basic, ot')
    .eq('month', month)
    .in('worker_id', workerIds)

  // 4. Fetch Holidays
  const { data: holidays } = await supabase
    .from('plantpro_holidays')
    .select('date')
    .gte('date', monthStart)
    .lte('date', monthEnd)
  const holidaySet = new Set((holidays || []).map(h => h.date.slice(-2)))

  function getDayType(dayStr: string): DayType {
    if (holidaySet.has(dayStr)) return 'holiday'
    const dow = new Date(y, m - 1, Number(dayStr)).getDay()
    if (dow === 0) return 'sunday'
    return 'normal'
  }

  // 5. Fetch Projects & OT Day Allocations & Splits
  const { data: projects } = await supabase.from('plantpro_projects').select('id, name')
  const projectNameMap = new Map((projects || []).map(p => [p.id, p.name]))

  const { data: attSessions } = await supabase
    .from('plantpro_attendance_sessions')
    .select('id, worker_id, work_date, clock_in_at, clock_out_at, basic_hours_credited, is_outstation')
    .gte('work_date', monthStart)
    .lte('work_date', monthEnd)
    .in('worker_id', workerIds)

  const { data: otSessions } = await supabase
    .from('plantpro_ot_sessions')
    .select('id, worker_id, work_date, check_in_at, check_out_at, approved_minutes, eligible_minutes, project_id, status')
    .gte('work_date', monthStart)
    .lte('work_date', monthEnd)
    .in('worker_id', workerIds)
    .eq('status', 'approved')

  // --- View 1: Intraday By Hour (00:00 to 23:00) ---
  const hourlyStats = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    activeWorkers: 0,
    basicHours: 0,
    otHours: 0,
    wageCost: canSeeWages ? 0 : null,
  }))

  const targetDate = filter.date || `${month}-01`
  for (const att of attSessions || []) {
    if (att.work_date !== targetDate || !att.clock_in_at) continue
    const inH = new Date(att.clock_in_at).getHours()
    const outH = att.clock_out_at ? new Date(att.clock_out_at).getHours() : 17
    for (let h = inH; h <= Math.min(outH, 23); h++) {
      hourlyStats[h].activeWorkers += 1
      hourlyStats[h].basicHours += 1
      if (canSeeWages) {
        const rate = workerPayRates.get(att.worker_id) || 0
        hourlyStats[h].wageCost = (hourlyStats[h].wageCost || 0) + rate
      }
    }
  }

  for (const ot of otSessions || []) {
    if (ot.work_date !== targetDate || !ot.check_in_at) continue
    const inH = new Date(ot.check_in_at).getHours()
    const outH = ot.check_out_at ? new Date(ot.check_out_at).getHours() : Math.min(inH + 2, 23)
    for (let h = inH; h <= Math.min(outH, 23); h++) {
      hourlyStats[h].otHours += 1
      if (canSeeWages) {
        const rate = workerPayRates.get(ot.worker_id) || 0
        hourlyStats[h].wageCost = (hourlyStats[h].wageCost || 0) + (rate * multipliers.normalOt)
      }
    }
  }

  // --- View 2: By Department (Line) ---
  const deptMap = new Map<string, { workers: number; basicHours: number; otHours: number; totalWages: number | null }>()
  for (const w of workers || []) {
    const line = w.line || 'Unassigned'
    if (!deptMap.has(line)) {
      deptMap.set(line, { workers: 0, basicHours: 0, otHours: 0, totalWages: canSeeWages ? 0 : null })
    }
    deptMap.get(line)!.workers += 1
  }

  for (const row of tsDays || []) {
    const w = (workers || []).find(x => x.id === row.worker_id)
    if (!w) continue
    const line = w.line || 'Unassigned'
    const entry = deptMap.get(line)
    if (!entry) continue

    const basic = Number(row.basic) || 0
    const ot = Number(row.ot) || 0
    entry.basicHours += basic
    entry.otHours += ot

    if (canSeeWages) {
      const rate = workerPayRates.get(row.worker_id) || 0
      const dType = getDayType(row.day)
      const mult = multiplierFor(dType, multipliers)
      const dayCost = basic * rate * mult.basic + ot * rate * mult.ot
      entry.totalWages = (entry.totalWages || 0) + dayCost
    }
  }

  const byDepartment = Array.from(deptMap.entries()).map(([department, data]) => ({
    department,
    workers: data.workers,
    basicHours: Math.round(data.basicHours * 10) / 10,
    otHours: Math.round(data.otHours * 10) / 10,
    totalHours: Math.round((data.basicHours + data.otHours) * 10) / 10,
    totalWages: data.totalWages !== null ? Math.round(data.totalWages) : null,
  })).sort((a, b) => b.totalHours - a.totalHours)

  // --- View 3: By Project ---
  const projectMap = new Map<number, { name: string; hours: number; wages: number | null }>()
  for (const ot of otSessions || []) {
    if (!ot.project_id) continue
    if (!projectMap.has(ot.project_id)) {
      projectMap.set(ot.project_id, {
        name: projectNameMap.get(ot.project_id) || `Project #${ot.project_id}`,
        hours: 0,
        wages: canSeeWages ? 0 : null,
      })
    }
    const mins = ot.approved_minutes || ot.eligible_minutes || 0
    const h = mins / 60
    const proj = projectMap.get(ot.project_id)!
    proj.hours += h
    if (canSeeWages) {
      const rate = workerPayRates.get(ot.worker_id) || 0
      proj.wages = (proj.wages || 0) + (h * rate * multipliers.normalOt)
    }
  }

  const byProject = Array.from(projectMap.entries()).map(([projectId, data]) => ({
    projectId,
    projectName: data.name,
    hours: Math.round(data.hours * 10) / 10,
    wages: data.wages !== null ? Math.round(data.wages) : null,
  })).sort((a, b) => b.hours - a.hours)

  return {
    canSeeWages,
    hourlyStats,
    byDepartment,
    byProject,
  }
}
