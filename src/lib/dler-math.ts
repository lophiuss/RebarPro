export type WorkingDaysMode = 'fixed_26' | 'weekdays_excl_holidays' | 'calendar_days'
export type DayType = 'normal' | 'sunday' | 'holiday'

export interface DlerSettings {
  id: number
  working_days_mode: WorkingDaysMode
  fixed_working_days: number
  standard_hours_per_day: number
  normal_ot_multiplier: number
  sunday_ot_multiplier: number
  holiday_ot_multiplier: number
  include_base_on_sunday_holiday: boolean
  erp_sync_url: string | null
  ot_sync_mode: 'manual' | 'hr_timesheet' | 'external_api'
}

export interface DlerFactory {
  id: number
  name: string
}

export interface DlerDepartment {
  id: number
  name: string
  factory_id: number
  kind: 'production' | 'support'
  sort_order: number
}

export interface DlerProject {
  id: number
  name: string
  factory_id: number
  department_id: number | null
  plantpro_project_id: number | null
  status: 'Active' | 'Inactive'
  erp_code: string | null
}

export interface DlerPerson {
  id: number
  person_type: 'STAFF' | 'WORKER'
  emp_no: string
  name: string
  designation: string | null
  department_id: number | null
  reports_to_id: number | null
  is_assistant?: boolean
  status: 'Active' | 'Inactive' | 'On Leave'
  plantpro_worker_id: number | null
  profile_id?: string | null
  remarks: string | null
}

export interface DlerAllocation {
  person_id: number
  project_id: number
  percentage: number
}

export interface DlerMonthlyPay {
  person_id: number
  month: string
  basic_pay: number
  allowance: number
  employer_statutory: number
  deductions: number
  gross_pay: number
  working_days_override: number | null
  hourly_rate_override: number | null
  remarks: string | null
}

export interface DlerDailyOt {
  person_id: number
  work_date: string
  basic_hours: number
  ot_hours: number
  day_type: DayType
  is_absent: boolean
  source: 'manual' | 'ot_app_sync'
}

export interface DlerDailyM3 {
  id: number
  entry_key: string
  entry_date: string
  target_type: 'project' | 'department'
  project_id: number | null
  department_id: number | null
  m3_volume: number
  remarks: string | null
  source: 'manual' | 'erp_sync'
}

export interface DlerGpEntry {
  id: number
  entry_key: string
  period_type: 'monthly' | 'daily'
  month: string
  entry_date: string | null
  target_type: 'project' | 'department' | 'factory'
  project_id: number | null
  department_id: number | null
  factory_id: number | null
  gross_profit: number
  remarks: string | null
  source: 'manual' | 'erp_sync'
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return 30
  return new Date(y, m, 0).getDate()
}

export function listMonthDates(month: string): string[] {
  const n = daysInMonth(month)
  const out: string[] = []
  for (let d = 1; d <= n; d++) {
    out.push(`${month}-${String(d).padStart(2, '0')}`)
  }
  return out
}

export function lastNMonthsList(n: number, endMonth: string): string[] {
  const [ey, em] = endMonth.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(ey, em - 1 - i, 1)
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function getDayType(dateStr: string, holidaySet: Set<string>): DayType {
  if (holidaySet.has(dateStr)) return 'holiday'
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay()
  if (dow === 0) return 'sunday'
  return 'normal'
}

export function getWorkingDaysInMonth(
  month: string,
  mode: WorkingDaysMode,
  fixedDays: number,
  holidaySet: Set<string>
): number {
  if (mode === 'fixed_26') {
    return fixedDays > 0 ? fixedDays : 26
  }
  const dates = listMonthDates(month)
  if (mode === 'calendar_days') {
    return dates.length
  }
  let count = 0
  for (const dt of dates) {
    if (getDayType(dt, holidaySet) === 'normal') count++
  }
  return count > 0 ? count : 26
}

export function calcPersonDayCost(params: {
  grossPay: number
  workingDays: number
  standardHours: number
  hourlyRateOverride?: number | null
  otHours: number
  dayType: DayType
  isAbsent: boolean
  multipliers: { normal: number; sunday: number; holiday: number }
  includeBaseOnSundayHoliday: boolean
}): { baseCost: number; otCost: number; totalCost: number; hourlyRate: number } {
  const workingDays = params.workingDays > 0 ? params.workingDays : 26
  const standardHours = params.standardHours > 0 ? params.standardHours : 8
  const gross = Math.max(0, Number(params.grossPay) || 0)
  const dailyRate = gross / workingDays
  const hourlyRate =
    params.hourlyRateOverride != null && params.hourlyRateOverride > 0
      ? Number(params.hourlyRateOverride)
      : dailyRate / standardHours

  let baseCost = 0
  if (!params.isAbsent) {
    if (params.dayType === 'normal' || params.includeBaseOnSundayHoliday) {
      baseCost = dailyRate
    }
  }

  const mult =
    params.dayType === 'holiday'
      ? params.multipliers.holiday
      : params.dayType === 'sunday'
      ? params.multipliers.sunday
      : params.multipliers.normal

  const otHours = Math.max(0, Number(params.otHours) || 0)
  const otCost = otHours * hourlyRate * mult

  return {
    baseCost,
    otCost,
    totalCost: baseCost + otCost,
    hourlyRate,
  }
}

export interface AggregatedMetricRow {
  id: number
  name: string
  kind?: 'production' | 'support'
  factoryId?: number
  departmentId?: number | null
  headcountStaff: number
  headcountWorker: number
  fteAllocated?: number
  staffCost: number
  workerBaseCost: number
  workerOtCost: number
  staffOtCost: number
  totalCost: number
  grossProfit: number
  gpSource: 'direct_daily' | 'prorated_m3' | 'prorated_days' | 'monthly' | 'none'
  m3Volume: number
  dler: number | null
  costPerM3: number | null
  m3Per1kCost: number | null
  benchmarkFactoryDler?: number | null
  benchmarkFactoryCostPerM3?: number | null
  own?: {
    totalCost: number
    grossProfit: number
    m3Volume: number
    dler: number | null
    costPerM3: number | null
  }
}

export interface DailySeriesPoint {
  date: string
  day: string
  dayType: DayType
  staffCost: number
  workerBaseCost: number
  workerOtCost: number
  totalCost: number
  grossProfit: number
  m3Volume: number
  dler: number | null
  costPerM3: number | null
  activeStaff?: number
  activeWorkers?: number
}

export interface MonthlySeriesPoint {
  month: string
  staffCost: number
  workerBaseCost: number
  workerOtCost: number
  totalCost: number
  grossProfit: number
  m3Volume: number
  dler: number | null
  costPerM3: number | null
}

export interface DlerDashboardResult {
  month: string
  selectedDate: string
  workingDaysInMonth: number
  settings: DlerSettings
  factories: DlerFactory[]
  departments: DlerDepartment[]
  projects: DlerProject[]
  daily: {
    summary: {
      totalCost: number
      staffCost: number
      workerBaseCost: number
      workerOtCost: number
      staffOtCost: number
      grossProfit: number
      m3Volume: number
      dler: number | null
      costPerM3: number | null
      m3Per1kCost: number | null
      activeStaff: number
      activeWorkers: number
    }
    byDepartment: AggregatedMetricRow[]
    byProject: AggregatedMetricRow[]
    byFactory: AggregatedMetricRow[]
    series: DailySeriesPoint[]
  }
  mtd: {
    totalCost: number
    staffCost: number
    workerBaseCost: number
    workerOtCost: number
    grossProfit: number
    m3Volume: number
    dler: number | null
    costPerM3: number | null
  }
  monthly: {
    summary: {
      totalCost: number
      staffCost: number
      workerBaseCost: number
      workerOtCost: number
      staffOtCost: number
      grossProfit: number
      m3Volume: number
      dler: number | null
      costPerM3: number | null
      m3Per1kCost: number | null
    }
    byDepartment: Record<string, AggregatedMetricRow[]>
    byProject: Record<string, AggregatedMetricRow[]>
    byFactory: Record<string, AggregatedMetricRow[]>
    trend: MonthlySeriesPoint[]
    months: string[]
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function calcDler(gp: number, cost: number): number | null {
  if (cost <= 0) return null
  return round2(gp / cost)
}

function calcCostPerM3(cost: number, m3: number): number | null {
  if (m3 <= 0) return null
  return round2(cost / m3)
}

function calcM3Per1k(m3: number, cost: number): number | null {
  if (cost <= 0) return null
  return round2((m3 / cost) * 1000)
}

export function aggregateDailyAndMonthlyDler(input: {
  selectedDate: string
  months: string[]
  settings: DlerSettings
  holidays: string[]
  factories: DlerFactory[]
  departments: DlerDepartment[]
  projects: DlerProject[]
  people: DlerPerson[]
  allocations: DlerAllocation[]
  monthlyPays: DlerMonthlyPay[]
  dailyOts: DlerDailyOt[]
  dailyM3s: DlerDailyM3[]
  gpEntries: DlerGpEntry[]
}): DlerDashboardResult {
  const {
    selectedDate,
    months,
    settings,
    holidays,
    factories,
    departments,
    projects,
    people,
    allocations,
    monthlyPays,
    dailyOts,
    dailyM3s,
    gpEntries,
  } = input

  const month = selectedDate.slice(0, 7)
  const holidaySet = new Set(holidays)
  const multipliers = {
    normal: Number(settings.normal_ot_multiplier) || 1.5,
    sunday: Number(settings.sunday_ot_multiplier) || 2.0,
    holiday: Number(settings.holiday_ot_multiplier) || 3.0,
  }

  // Index allocations by person_id
  const allocByPerson = new Map<number, DlerAllocation[]>()
  for (const a of allocations) {
    if (a.percentage <= 0) continue
    const arr = allocByPerson.get(a.person_id) ?? []
    arr.push(a)
    allocByPerson.set(a.person_id, arr)
  }

  // Index monthly pay by `${person_id}:${month}`
  const payByKey = new Map<string, DlerMonthlyPay>()
  for (const p of monthlyPays) {
    payByKey.set(`${p.person_id}:${p.month}`, p)
  }

  // Index daily OT by `${person_id}:${work_date}`
  const otByKey = new Map<string, DlerDailyOt>()
  for (const o of dailyOts) {
    otByKey.set(`${o.person_id}:${o.work_date}`, o)
  }

  // Index daily m3 by date -> project / dept
  const m3ProjByDate = new Map<string, Map<number, number>>()
  const m3DeptByDate = new Map<string, Map<number, number>>()
  const m3ProjByMonth = new Map<string, Map<number, number>>()
  const m3DeptByMonth = new Map<string, Map<number, number>>()

  for (const r of dailyM3s) {
    const dt = r.entry_date
    const mo = dt.slice(0, 7)
    const vol = Number(r.m3_volume) || 0
    if (r.target_type === 'project' && r.project_id != null) {
      if (!m3ProjByDate.has(dt)) m3ProjByDate.set(dt, new Map())
      m3ProjByDate.get(dt)!.set(r.project_id, (m3ProjByDate.get(dt)!.get(r.project_id) ?? 0) + vol)
      if (!m3ProjByMonth.has(mo)) m3ProjByMonth.set(mo, new Map())
      m3ProjByMonth.get(mo)!.set(r.project_id, (m3ProjByMonth.get(mo)!.get(r.project_id) ?? 0) + vol)
    } else if (r.target_type === 'department' && r.department_id != null) {
      if (!m3DeptByDate.has(dt)) m3DeptByDate.set(dt, new Map())
      m3DeptByDate.get(dt)!.set(r.department_id, (m3DeptByDate.get(dt)!.get(r.department_id) ?? 0) + vol)
      if (!m3DeptByMonth.has(mo)) m3DeptByMonth.set(mo, new Map())
      m3DeptByMonth.get(mo)!.set(r.department_id, (m3DeptByMonth.get(mo)!.get(r.department_id) ?? 0) + vol)
    }
  }

  // Index GP entries
  const gpMonthlyProj = new Map<string, Map<number, number>>()
  const gpMonthlyDept = new Map<string, Map<number, number>>()
  const gpMonthlyFac = new Map<string, Map<number, number>>()
  const gpDailyProj = new Map<string, Map<number, number>>()
  const gpDailyDept = new Map<string, Map<number, number>>()
  const gpDailyFac = new Map<string, Map<number, number>>()

  for (const g of gpEntries) {
    const val = Number(g.gross_profit) || 0
    if (g.period_type === 'monthly') {
      if (g.target_type === 'project' && g.project_id != null) {
        if (!gpMonthlyProj.has(g.month)) gpMonthlyProj.set(g.month, new Map())
        gpMonthlyProj.get(g.month)!.set(g.project_id, val)
      } else if (g.target_type === 'department' && g.department_id != null) {
        if (!gpMonthlyDept.has(g.month)) gpMonthlyDept.set(g.month, new Map())
        gpMonthlyDept.get(g.month)!.set(g.department_id, val)
      } else if (g.target_type === 'factory' && g.factory_id != null) {
        if (!gpMonthlyFac.has(g.month)) gpMonthlyFac.set(g.month, new Map())
        gpMonthlyFac.get(g.month)!.set(g.factory_id, val)
      }
    } else if (g.period_type === 'daily' && g.entry_date) {
      const dt = g.entry_date
      if (g.target_type === 'project' && g.project_id != null) {
        if (!gpDailyProj.has(dt)) gpDailyProj.set(dt, new Map())
        gpDailyProj.get(dt)!.set(g.project_id, val)
      } else if (g.target_type === 'department' && g.department_id != null) {
        if (!gpDailyDept.has(dt)) gpDailyDept.set(dt, new Map())
        gpDailyDept.get(dt)!.set(g.department_id, val)
      } else if (g.target_type === 'factory' && g.factory_id != null) {
        if (!gpDailyFac.has(dt)) gpDailyFac.set(dt, new Map())
        gpDailyFac.get(dt)!.set(g.factory_id, val)
      }
    }
  }

  type CostBucket = {
    staffCost: number
    staffOtCost: number
    workerBaseCost: number
    workerOtCost: number
    totalCost: number
    headcountStaff: number
    headcountWorker: number
    fteAllocated: number
  }
  const emptyBucket = (): CostBucket => ({
    staffCost: 0,
    staffOtCost: 0,
    workerBaseCost: 0,
    workerOtCost: 0,
    totalCost: 0,
    headcountStaff: 0,
    headcountWorker: 0,
    fteAllocated: 0,
  })

  const buildUnassignedDeptRow = (b: CostBucket): AggregatedMetricRow | null => {
    if (b.headcountStaff <= 0 && b.headcountWorker <= 0 && b.totalCost <= 0) return null
    return {
      id: 0,
      name: 'Unassigned (No Dept)',
      kind: 'support',
      headcountStaff: b.headcountStaff,
      headcountWorker: b.headcountWorker,
      staffCost: round2(b.staffCost),
      workerBaseCost: round2(b.workerBaseCost),
      workerOtCost: round2(b.workerOtCost),
      staffOtCost: round2(b.staffOtCost),
      totalCost: round2(b.totalCost),
      grossProfit: 0,
      gpSource: 'none',
      m3Volume: 0,
      dler: null,
      costPerM3: null,
      m3Per1kCost: null,
    }
  }

  // Helper to resolve daily GP for an entity on a given date
  function resolveDailyGp(
    dt: string,
    directMap: Map<string, Map<number, number>>,
    monthlyMap: Map<string, Map<number, number>>,
    dayM3Map: Map<string, Map<number, number>>,
    monthM3Map: Map<string, Map<number, number>>,
    id: number,
    moWorkingDays: number
  ): { gp: number; source: AggregatedMetricRow['gpSource'] } {
    const direct = directMap.get(dt)?.get(id)
    if (direct !== undefined) {
      return { gp: direct, source: 'direct_daily' }
    }
    const mo = dt.slice(0, 7)
    const monthlyVal = monthlyMap.get(mo)?.get(id)
    if (monthlyVal !== undefined && monthlyVal !== 0) {
      const mM3 = monthM3Map.get(mo)?.get(id) ?? 0
      const dM3 = dayM3Map.get(dt)?.get(id) ?? 0
      if (mM3 > 0) {
        return { gp: (monthlyVal * dM3) / mM3, source: 'prorated_m3' }
      }
      const dType = getDayType(dt, holidaySet)
      if (dType === 'normal' || settings.include_base_on_sunday_holiday) {
        return { gp: monthlyVal / (moWorkingDays > 0 ? moWorkingDays : 26), source: 'prorated_days' }
      }
      return { gp: 0, source: 'prorated_days' }
    }
    return { gp: 0, source: 'none' }
  }

  // --------------------------------------------------------------------------
  // 1. Compute Monthly Breakdown across all 6 months
  // --------------------------------------------------------------------------
  const byDepartmentMonthly: Record<string, AggregatedMetricRow[]> = {}
  const byProjectMonthly: Record<string, AggregatedMetricRow[]> = {}
  const byFactoryMonthly: Record<string, AggregatedMetricRow[]> = {}
  const trend: MonthlySeriesPoint[] = []

  for (const m of months) {
    const mDates = listMonthDates(m)
    const mWorkingDays = getWorkingDaysInMonth(
      m,
      settings.working_days_mode,
      Number(settings.fixed_working_days),
      holidaySet
    )
    const deptCost = new Map<number, CostBucket>()
    const projCost = new Map<number, CostBucket>()
    const unassignedDeptCost = emptyBucket()

    for (const d of departments) deptCost.set(d.id, emptyBucket())
    for (const p of projects) projCost.set(p.id, emptyBucket())

    let totalStaffCost = 0
    let totalStaffOtCost = 0
    let totalWorkerBaseCost = 0
    let totalWorkerOtCost = 0

    for (const person of people) {
      const pay = payByKey.get(`${person.id}:${m}`)
      const grossPay = Number(pay?.gross_pay ?? 0)
      const pWorkingDays = Number(pay?.working_days_override ?? mWorkingDays) || mWorkingDays

      // Skip inactive people who have no pay and no OT in this month
      const hasAnyOtInMonth = mDates.some(dt => (otByKey.get(`${person.id}:${dt}`)?.ot_hours ?? 0) > 0)
      if (person.status === 'Inactive' && grossPay === 0 && !hasAnyOtInMonth) continue

      let personBaseMonth = 0
      let personOtMonth = 0
      let normalAndHolidayBaseSum = 0
      let absentCount = 0

      for (const dt of mDates) {
        const otRow = otByKey.get(`${person.id}:${dt}`)
        const dType = otRow?.day_type ?? getDayType(dt, holidaySet)
        const isAbsent = otRow?.is_absent ?? false
        if (isAbsent) absentCount++
        const res = calcPersonDayCost({
          grossPay,
          workingDays: pWorkingDays,
          standardHours: Number(settings.standard_hours_per_day) || 8,
          hourlyRateOverride: pay?.hourly_rate_override,
          otHours: Number(otRow?.ot_hours ?? 0),
          dayType: dType,
          isAbsent,
          multipliers,
          includeBaseOnSundayHoliday: settings.include_base_on_sunday_holiday,
        })
        normalAndHolidayBaseSum += res.baseCost
        personOtMonth += res.otCost
      }

      // In fixed_26 mode, monthly base pay equals gross_pay minus absent days (if any),
      // so monthly totals match payroll payouts rather than fluctuating on 27-day months.
      if (settings.working_days_mode === 'fixed_26' && pay?.working_days_override == null) {
        const dailyRate = pWorkingDays > 0 ? grossPay / pWorkingDays : 0
        personBaseMonth = Math.max(0, grossPay - absentCount * dailyRate)
      } else {
        personBaseMonth = normalAndHolidayBaseSum
      }

      const personTotalMonth = personBaseMonth + personOtMonth

      if (person.person_type === 'STAFF') {
        totalStaffCost += personTotalMonth
        totalStaffOtCost += personOtMonth
      } else {
        totalWorkerBaseCost += personBaseMonth
        totalWorkerOtCost += personOtMonth
      }

      // Department bucket (100% home dept)
      const dBucket =
        person.department_id != null && deptCost.has(person.department_id)
          ? deptCost.get(person.department_id)!
          : unassignedDeptCost
      if (person.person_type === 'STAFF') {
        dBucket.headcountStaff += 1
        dBucket.staffCost += personTotalMonth
        dBucket.staffOtCost += personOtMonth
      } else {
        dBucket.headcountWorker += 1
        dBucket.workerBaseCost += personBaseMonth
        dBucket.workerOtCost += personOtMonth
      }
      dBucket.totalCost += personTotalMonth

      // Project % buckets
      const allocs = allocByPerson.get(person.id) ?? []
      for (const a of allocs) {
        const pBucket = projCost.get(a.project_id)
        if (!pBucket) continue
        const share = a.percentage / 100
        if (person.person_type === 'STAFF') {
          pBucket.headcountStaff += 1
          pBucket.staffCost += personTotalMonth * share
          pBucket.staffOtCost += personOtMonth * share
        } else {
          pBucket.headcountWorker += 1
          pBucket.workerBaseCost += personBaseMonth * share
          pBucket.workerOtCost += personOtMonth * share
        }
        pBucket.fteAllocated += share
        pBucket.totalCost += personTotalMonth * share
      }
    }

    // Resolve monthly GP (prefer monthly entry, fallback to sum of daily entries in that month)
    const sumDailyGpForMonth = (
      dailyMap: Map<string, Map<number, number>>,
      id: number
    ): number => {
      let s = 0
      for (const dt of mDates) s += dailyMap.get(dt)?.get(id) ?? 0
      return s
    }

    const projRows: AggregatedMetricRow[] = projects.map(p => {
      const b = projCost.get(p.id) ?? emptyBucket()
      const mGp = gpMonthlyProj.get(m)?.get(p.id)
      const dGpSum = sumDailyGpForMonth(gpDailyProj, p.id)
      const gp = mGp !== undefined ? mGp : dGpSum
      const m3 = m3ProjByMonth.get(m)?.get(p.id) ?? 0
      const cost = round2(b.totalCost)
      return {
        id: p.id,
        name: p.name,
        factoryId: p.factory_id,
        departmentId: p.department_id,
        headcountStaff: b.headcountStaff,
        headcountWorker: b.headcountWorker,
        fteAllocated: round2(b.fteAllocated),
        staffCost: round2(b.staffCost),
        workerBaseCost: round2(b.workerBaseCost),
        workerOtCost: round2(b.workerOtCost),
        staffOtCost: round2(b.staffOtCost),
        totalCost: cost,
        grossProfit: round2(gp),
        gpSource: mGp !== undefined ? 'monthly' : dGpSum !== 0 ? 'direct_daily' : 'none',
        m3Volume: round2(m3),
        dler: calcDler(gp, cost),
        costPerM3: calcCostPerM3(cost, m3),
        m3Per1kCost: calcM3Per1k(m3, cost),
      }
    })

    const projRowById = new Map(projRows.map(r => [r.id, r]))

    // First compute factory totals so support departments can display benchmark DLER against Factory Total
    const deptRowsRaw: AggregatedMetricRow[] = departments.map(d => {
      const b = deptCost.get(d.id) ?? emptyBucket()
      const kids = projects.filter(p => p.department_id === d.id)
      const kidsGp = kids.reduce((s, k) => s + (projRowById.get(k.id)?.grossProfit ?? 0), 0)
      const kidsM3 = kids.reduce((s, k) => s + (projRowById.get(k.id)?.m3Volume ?? 0), 0)

      const ownGpM = gpMonthlyDept.get(m)?.get(d.id)
      const ownGpD = sumDailyGpForMonth(gpDailyDept, d.id)
      const ownGp = ownGpM !== undefined ? ownGpM : ownGpD
      const ownM3 = m3DeptByMonth.get(m)?.get(d.id) ?? 0

      // Department Cost = sum of 100% of staff & workers whose Home Dept is this dept
      const cost = round2(b.totalCost)
      const gp = round2(ownGp + kidsGp)
      const m3 = round2(ownM3 + kidsM3)

      return {
        id: d.id,
        name: d.name,
        kind: d.kind,
        factoryId: d.factory_id,
        headcountStaff: b.headcountStaff,
        headcountWorker: b.headcountWorker,
        staffCost: round2(b.staffCost),
        workerBaseCost: round2(b.workerBaseCost),
        workerOtCost: round2(b.workerOtCost),
        staffOtCost: round2(b.staffOtCost),
        totalCost: cost,
        grossProfit: gp,
        gpSource: ownGpM !== undefined || kids.length > 0 ? 'monthly' : ownGpD !== 0 ? 'direct_daily' : 'none',
        m3Volume: m3,
        dler: calcDler(gp, cost),
        costPerM3: calcCostPerM3(cost, m3),
        m3Per1kCost: calcM3Per1k(m3, cost),
        own: {
          totalCost: cost,
          grossProfit: round2(ownGp),
          m3Volume: round2(ownM3),
          dler: calcDler(ownGp, cost),
          costPerM3: calcCostPerM3(cost, ownM3),
        },
      }
    })

    const facRows: AggregatedMetricRow[] = factories.map(f => {
      const fDepts = deptRowsRaw.filter(d => d.factoryId === f.id)
      const fUnassignedProj = projRows.filter(p => p.factoryId === f.id && p.departmentId == null)
      const ownGpM = gpMonthlyFac.get(m)?.get(f.id)
      const ownGpD = sumDailyGpForMonth(gpDailyFac, f.id)
      const ownGp = ownGpM !== undefined ? ownGpM : ownGpD

      const staffCost =
        fDepts.reduce((s, d) => s + d.staffCost, 0) + round2(unassignedDeptCost.staffCost)
      const workerBaseCost =
        fDepts.reduce((s, d) => s + d.workerBaseCost, 0) + round2(unassignedDeptCost.workerBaseCost)
      const workerOtCost =
        fDepts.reduce((s, d) => s + d.workerOtCost, 0) + round2(unassignedDeptCost.workerOtCost)
      const staffOtCost =
        fDepts.reduce((s, d) => s + d.staffOtCost, 0) + round2(unassignedDeptCost.staffOtCost)
      const totalCost = round2(staffCost + workerBaseCost + workerOtCost)

      const gp = round2(
        ownGp +
          fDepts.reduce((s, d) => s + d.grossProfit, 0) +
          fUnassignedProj.reduce((s, p) => s + p.grossProfit, 0)
      )
      const m3 = round2(
        fDepts.reduce((s, d) => s + d.m3Volume, 0) +
          fUnassignedProj.reduce((s, p) => s + p.m3Volume, 0)
      )

      return {
        id: f.id,
        name: f.name,
        headcountStaff: fDepts.reduce((s, d) => s + d.headcountStaff, 0) + unassignedDeptCost.headcountStaff,
        headcountWorker: fDepts.reduce((s, d) => s + d.headcountWorker, 0) + unassignedDeptCost.headcountWorker,
        staffCost: round2(staffCost),
        workerBaseCost: round2(workerBaseCost),
        workerOtCost: round2(workerOtCost),
        staffOtCost: round2(staffOtCost),
        totalCost,
        grossProfit: gp,
        gpSource: ownGpM !== undefined || fDepts.length > 0 ? 'monthly' : 'none',
        m3Volume: m3,
        dler: calcDler(gp, totalCost),
        costPerM3: calcCostPerM3(totalCost, m3),
        m3Per1kCost: calcM3Per1k(m3, totalCost),
        own: {
          totalCost: round2(unassignedDeptCost.totalCost),
          grossProfit: round2(ownGp),
          m3Volume: 0,
          dler: calcDler(ownGp, unassignedDeptCost.totalCost),
          costPerM3: null,
        },
      }
    })

    const facById = new Map(facRows.map(f => [f.id, f]))
    const deptRows = deptRowsRaw.map(d => {
      const f = d.factoryId != null ? facById.get(d.factoryId) : undefined
      return {
        ...d,
        benchmarkFactoryDler: f && d.totalCost > 0 ? calcDler(f.grossProfit, d.totalCost) : null,
        benchmarkFactoryCostPerM3: f && f.m3Volume > 0 ? calcCostPerM3(d.totalCost, f.m3Volume) : null,
      }
    })

    byDepartmentMonthly[m] = [
      ...deptRows,
      ...(buildUnassignedDeptRow(unassignedDeptCost) ? [buildUnassignedDeptRow(unassignedDeptCost)!] : []),
    ]
    byProjectMonthly[m] = projRows
    byFactoryMonthly[m] = facRows

    const totalCostAll = round2(totalStaffCost + totalWorkerBaseCost + totalWorkerOtCost)
    const totalGpAll = round2(facRows.reduce((s, f) => s + f.grossProfit, 0))
    const totalM3All = round2(facRows.reduce((s, f) => s + f.m3Volume, 0))

    trend.push({
      month: m,
      staffCost: round2(totalStaffCost),
      workerBaseCost: round2(totalWorkerBaseCost),
      workerOtCost: round2(totalWorkerOtCost),
      totalCost: totalCostAll,
      grossProfit: totalGpAll,
      m3Volume: totalM3All,
      dler: calcDler(totalGpAll, totalCostAll),
      costPerM3: calcCostPerM3(totalCostAll, totalM3All),
    })
  }

  // --------------------------------------------------------------------------
  // 2. Compute Daily Series across the selected month (`month`) + Selected Date + MTD
  // --------------------------------------------------------------------------
  const selectedMonthDates = listMonthDates(month)
  const workingDaysInMonth = getWorkingDaysInMonth(
    month,
    settings.working_days_mode,
    Number(settings.fixed_working_days),
    holidaySet
  )

  const dailySeries: DailySeriesPoint[] = []
  let selectedDayDeptRows: AggregatedMetricRow[] = []
  let selectedDayProjRows: AggregatedMetricRow[] = []
  let selectedDayFacRows: AggregatedMetricRow[] = []
  let selectedDaySummary = {
    totalCost: 0,
    staffCost: 0,
    workerBaseCost: 0,
    workerOtCost: 0,
    staffOtCost: 0,
    grossProfit: 0,
    m3Volume: 0,
    dler: null as number | null,
    costPerM3: null as number | null,
    m3Per1kCost: null as number | null,
    activeStaff: 0,
    activeWorkers: 0,
  }

  let mtdStaffCost = 0
  let mtdWorkerBaseCost = 0
  let mtdWorkerOtCost = 0
  let mtdGp = 0
  let mtdM3 = 0

  for (const dt of selectedMonthDates) {
    const dType = getDayType(dt, holidaySet)
    const deptCost = new Map<number, CostBucket>()
    const projCost = new Map<number, CostBucket>()
    const unassignedDeptCost = emptyBucket()

    for (const d of departments) deptCost.set(d.id, emptyBucket())
    for (const p of projects) projCost.set(p.id, emptyBucket())

    let dayStaffCost = 0
    let dayStaffOtCost = 0
    let dayWorkerBaseCost = 0
    let dayWorkerOtCost = 0
    let activeStaff = 0
    let activeWorkers = 0

    for (const person of people) {
      const pay = payByKey.get(`${person.id}:${month}`)
      const grossPay = Number(pay?.gross_pay ?? 0)
      const pWorkingDays = Number(pay?.working_days_override ?? workingDaysInMonth) || workingDaysInMonth
      const otRow = otByKey.get(`${person.id}:${dt}`)
      const pDayType = otRow?.day_type ?? dType
      const isAbsent = otRow?.is_absent ?? false
      const otHours = Number(otRow?.ot_hours ?? 0)

      if (person.status === 'Inactive' && grossPay === 0 && otHours === 0) continue

      const res = calcPersonDayCost({
        grossPay,
        workingDays: pWorkingDays,
        standardHours: Number(settings.standard_hours_per_day) || 8,
        hourlyRateOverride: pay?.hourly_rate_override,
        otHours,
        dayType: pDayType,
        isAbsent,
        multipliers,
        includeBaseOnSundayHoliday: settings.include_base_on_sunday_holiday,
      })

      const isPresent = person.status !== 'Inactive' && !isAbsent
      if (person.person_type === 'STAFF') {
        if (isPresent) activeStaff++
        dayStaffCost += res.totalCost
        dayStaffOtCost += res.otCost
      } else {
        if (isPresent) activeWorkers++
        dayWorkerBaseCost += res.baseCost
        dayWorkerOtCost += res.otCost
      }

      const dBucket =
        person.department_id != null && deptCost.has(person.department_id)
          ? deptCost.get(person.department_id)!
          : unassignedDeptCost
      if (person.person_type === 'STAFF') {
        if (isPresent) dBucket.headcountStaff += 1
        dBucket.staffCost += res.totalCost
        dBucket.staffOtCost += res.otCost
      } else {
        if (isPresent) dBucket.headcountWorker += 1
        dBucket.workerBaseCost += res.baseCost
        dBucket.workerOtCost += res.otCost
      }
      dBucket.totalCost += res.totalCost

      const allocs = allocByPerson.get(person.id) ?? []
      for (const a of allocs) {
        const pBucket = projCost.get(a.project_id)
        if (!pBucket) continue
        const share = a.percentage / 100
        if (person.person_type === 'STAFF') {
          if (isPresent) pBucket.headcountStaff += 1
          pBucket.staffCost += res.totalCost * share
          pBucket.staffOtCost += res.otCost * share
        } else {
          if (isPresent) pBucket.headcountWorker += 1
          pBucket.workerBaseCost += res.baseCost * share
          pBucket.workerOtCost += res.otCost * share
        }
        pBucket.fteAllocated += share
        pBucket.totalCost += res.totalCost * share
      }
    }

    const pRows: AggregatedMetricRow[] = projects.map(p => {
      const b = projCost.get(p.id) ?? emptyBucket()
      const { gp, source } = resolveDailyGp(
        dt,
        gpDailyProj,
        gpMonthlyProj,
        m3ProjByDate,
        m3ProjByMonth,
        p.id,
        workingDaysInMonth
      )
      const m3 = m3ProjByDate.get(dt)?.get(p.id) ?? 0
      const cost = round2(b.totalCost)
      return {
        id: p.id,
        name: p.name,
        factoryId: p.factory_id,
        departmentId: p.department_id,
        headcountStaff: b.headcountStaff,
        headcountWorker: b.headcountWorker,
        fteAllocated: round2(b.fteAllocated),
        staffCost: round2(b.staffCost),
        workerBaseCost: round2(b.workerBaseCost),
        workerOtCost: round2(b.workerOtCost),
        staffOtCost: round2(b.staffOtCost),
        totalCost: cost,
        grossProfit: round2(gp),
        gpSource: source,
        m3Volume: round2(m3),
        dler: calcDler(gp, cost),
        costPerM3: calcCostPerM3(cost, m3),
        m3Per1kCost: calcM3Per1k(m3, cost),
      }
    })

    const pRowById = new Map(pRows.map(r => [r.id, r]))

    const dRowsRaw: AggregatedMetricRow[] = departments.map(d => {
      const b = deptCost.get(d.id) ?? emptyBucket()
      const kids = projects.filter(p => p.department_id === d.id)
      const kidsGp = kids.reduce((s, k) => s + (pRowById.get(k.id)?.grossProfit ?? 0), 0)
      const kidsM3 = kids.reduce((s, k) => s + (pRowById.get(k.id)?.m3Volume ?? 0), 0)
      const { gp: ownGp, source: ownSrc } = resolveDailyGp(
        dt,
        gpDailyDept,
        gpMonthlyDept,
        m3DeptByDate,
        m3DeptByMonth,
        d.id,
        workingDaysInMonth
      )
      const ownM3 = m3DeptByDate.get(dt)?.get(d.id) ?? 0
      const cost = round2(b.totalCost)
      const gp = round2(ownGp + kidsGp)
      const m3 = round2(ownM3 + kidsM3)
      const firstKidSrc = kids.map(k => pRowById.get(k.id)?.gpSource).find(s => s && s !== 'none') ?? 'none'

      return {
        id: d.id,
        name: d.name,
        kind: d.kind,
        factoryId: d.factory_id,
        headcountStaff: b.headcountStaff,
        headcountWorker: b.headcountWorker,
        staffCost: round2(b.staffCost),
        workerBaseCost: round2(b.workerBaseCost),
        workerOtCost: round2(b.workerOtCost),
        staffOtCost: round2(b.staffOtCost),
        totalCost: cost,
        grossProfit: gp,
        gpSource: ownSrc !== 'none' ? ownSrc : firstKidSrc,
        m3Volume: m3,
        dler: calcDler(gp, cost),
        costPerM3: calcCostPerM3(cost, m3),
        m3Per1kCost: calcM3Per1k(m3, cost),
        own: {
          totalCost: cost,
          grossProfit: round2(ownGp),
          m3Volume: round2(ownM3),
          dler: calcDler(ownGp, cost),
          costPerM3: calcCostPerM3(cost, ownM3),
        },
      }
    })

    const fRows: AggregatedMetricRow[] = factories.map(f => {
      const fDepts = dRowsRaw.filter(d => d.factoryId === f.id)
      const fUnassignedProj = pRows.filter(p => p.factoryId === f.id && p.departmentId == null)
      const { gp: ownGp } = resolveDailyGp(
        dt,
        gpDailyFac,
        gpMonthlyFac,
        new Map(),
        new Map(),
        f.id,
        workingDaysInMonth
      )
      const staffCost = fDepts.reduce((s, d) => s + d.staffCost, 0) + round2(unassignedDeptCost.staffCost)
      const workerBaseCost =
        fDepts.reduce((s, d) => s + d.workerBaseCost, 0) + round2(unassignedDeptCost.workerBaseCost)
      const workerOtCost =
        fDepts.reduce((s, d) => s + d.workerOtCost, 0) + round2(unassignedDeptCost.workerOtCost)
      const staffOtCost =
        fDepts.reduce((s, d) => s + d.staffOtCost, 0) + round2(unassignedDeptCost.staffOtCost)
      const totalCost = round2(staffCost + workerBaseCost + workerOtCost)
      const gp = round2(
        ownGp + fDepts.reduce((s, d) => s + d.grossProfit, 0) + fUnassignedProj.reduce((s, p) => s + p.grossProfit, 0)
      )
      const m3 = round2(
        fDepts.reduce((s, d) => s + d.m3Volume, 0) + fUnassignedProj.reduce((s, p) => s + p.m3Volume, 0)
      )

      return {
        id: f.id,
        name: f.name,
        headcountStaff: fDepts.reduce((s, d) => s + d.headcountStaff, 0) + unassignedDeptCost.headcountStaff,
        headcountWorker: fDepts.reduce((s, d) => s + d.headcountWorker, 0) + unassignedDeptCost.headcountWorker,
        staffCost: round2(staffCost),
        workerBaseCost: round2(workerBaseCost),
        workerOtCost: round2(workerOtCost),
        staffOtCost: round2(staffOtCost),
        totalCost,
        grossProfit: gp,
        gpSource: 'prorated_days',
        m3Volume: m3,
        dler: calcDler(gp, totalCost),
        costPerM3: calcCostPerM3(totalCost, m3),
        m3Per1kCost: calcM3Per1k(m3, totalCost),
        own: {
          totalCost: round2(unassignedDeptCost.totalCost),
          grossProfit: round2(ownGp),
          m3Volume: 0,
          dler: calcDler(ownGp, unassignedDeptCost.totalCost),
          costPerM3: null,
        },
      }
    })

    const facById = new Map(fRows.map(f => [f.id, f]))
    const dRows: AggregatedMetricRow[] = dRowsRaw.map(d => {
      const f = d.factoryId != null ? facById.get(d.factoryId) : undefined
      return {
        ...d,
        benchmarkFactoryDler: f && d.totalCost > 0 ? calcDler(f.grossProfit, d.totalCost) : null,
        benchmarkFactoryCostPerM3: f && f.m3Volume > 0 ? calcCostPerM3(d.totalCost, f.m3Volume) : null,
      }
    })

    const uDailyDept = buildUnassignedDeptRow(unassignedDeptCost)
    if (uDailyDept) dRows.push(uDailyDept)

    const dayCost = round2(dayStaffCost + dayWorkerBaseCost + dayWorkerOtCost)
    const dayGp = round2(fRows.reduce((s, f) => s + f.grossProfit, 0))
    const dayM3 = round2(fRows.reduce((s, f) => s + f.m3Volume, 0))

    dailySeries.push({
      date: dt,
      day: dt.slice(8, 10),
      dayType: dType,
      staffCost: round2(dayStaffCost),
      workerBaseCost: round2(dayWorkerBaseCost),
      workerOtCost: round2(dayWorkerOtCost),
      totalCost: dayCost,
      grossProfit: dayGp,
      m3Volume: dayM3,
      dler: calcDler(dayGp, dayCost),
      costPerM3: calcCostPerM3(dayCost, dayM3),
      activeStaff,
      activeWorkers,
    })

    if (dt <= selectedDate) {
      mtdStaffCost += dayStaffCost
      mtdWorkerBaseCost += dayWorkerBaseCost
      mtdWorkerOtCost += dayWorkerOtCost
      mtdGp += dayGp
      mtdM3 += dayM3
    }

    if (dt === selectedDate) {
      selectedDayDeptRows = dRows
      selectedDayProjRows = pRows
      selectedDayFacRows = fRows
      selectedDaySummary = {
        totalCost: dayCost,
        staffCost: round2(dayStaffCost),
        workerBaseCost: round2(dayWorkerBaseCost),
        workerOtCost: round2(dayWorkerOtCost),
        staffOtCost: round2(dayStaffOtCost),
        grossProfit: dayGp,
        m3Volume: dayM3,
        dler: calcDler(dayGp, dayCost),
        costPerM3: calcCostPerM3(dayCost, dayM3),
        m3Per1kCost: calcM3Per1k(dayM3, dayCost),
        activeStaff,
        activeWorkers,
      }
    }
  }

  const mtdTotalCost = round2(mtdStaffCost + mtdWorkerBaseCost + mtdWorkerOtCost)
  const mtdRoundedGp = round2(mtdGp)
  const mtdRoundedM3 = round2(mtdM3)

  const curMonthTrend = trend[trend.length - 1] ?? {
    month,
    staffCost: 0,
    workerBaseCost: 0,
    workerOtCost: 0,
    totalCost: 0,
    grossProfit: 0,
    m3Volume: 0,
    dler: null,
    costPerM3: null,
  }

  return {
    month,
    selectedDate,
    workingDaysInMonth,
    settings,
    factories,
    departments,
    projects,
    daily: {
      summary: selectedDaySummary,
      byDepartment: selectedDayDeptRows,
      byProject: selectedDayProjRows,
      byFactory: selectedDayFacRows,
      series: dailySeries,
    },
    mtd: {
      totalCost: mtdTotalCost,
      staffCost: round2(mtdStaffCost),
      workerBaseCost: round2(mtdWorkerBaseCost),
      workerOtCost: round2(mtdWorkerOtCost),
      grossProfit: mtdRoundedGp,
      m3Volume: mtdRoundedM3,
      dler: calcDler(mtdRoundedGp, mtdTotalCost),
      costPerM3: calcCostPerM3(mtdTotalCost, mtdRoundedM3),
    },
    monthly: {
      summary: {
        totalCost: curMonthTrend.totalCost,
        staffCost: curMonthTrend.staffCost,
        workerBaseCost: curMonthTrend.workerBaseCost,
        workerOtCost: curMonthTrend.workerOtCost,
        staffOtCost: (byFactoryMonthly[month] ?? []).reduce((s, f) => s + f.staffOtCost, 0),
        grossProfit: curMonthTrend.grossProfit,
        m3Volume: curMonthTrend.m3Volume,
        dler: curMonthTrend.dler,
        costPerM3: curMonthTrend.costPerM3,
        m3Per1kCost: calcM3Per1k(curMonthTrend.m3Volume, curMonthTrend.totalCost),
      },
      byDepartment: byDepartmentMonthly,
      byProject: byProjectMonthly,
      byFactory: byFactoryMonthly,
      trend,
      months,
    },
  }
}
