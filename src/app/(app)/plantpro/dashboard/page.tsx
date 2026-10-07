export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { LayoutDashboard } from 'lucide-react'
import RestrictedNotice from '../RestrictedNotice'
import DashboardClient, { type MonthStat, type DeptStat } from './DashboardClient'
import { calcNetPay, type Multipliers } from '@/lib/plantpro-payroll'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function daysIn(month: string) { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate() }

type HourRow = {
  worker_id: number; line: string | null
  basic_normal: number; ot_normal: number; basic_sunday: number; ot_sunday: number
  basic_holiday: number; ot_holiday: number; planned_ot: number
}

export default async function PlantproDashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams
  const month = /^\d{4}-\d{2}$/.test(monthParam || '') ? monthParam! : currentMonth()
  const supabase = await createClient()

  // The whole dashboard is HR/admin only: it shows salary totals.
  const { data: canSeeWages } = await supabase.rpc('plantpro_can_see_wages')
  if (!canSeeWages) return <RestrictedNotice what="The HR dashboard" />

  // Six months ending at the selected one, oldest first.
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5))

  const [{ data: multiplier }, { data: payColumns }, { data: payValues }, ...monthRows] = await Promise.all([
    supabase.from('plantpro_timesheet_multiplier').select('*').eq('id', 1).single(),
    supabase.from('plantpro_pay_columns').select('id, key, include_in_gross, include_in_net_deduct'),
    supabase.from('plantpro_worker_pay_values').select('worker_id, pay_column_id, value'),
    ...months.map(m => supabase.rpc('plantpro_month_hours', { p_month: m })),
  ])

  const mult: Multipliers = {
    normalOt: multiplier?.normal_ot ?? 1.5, sundayBasic: multiplier?.sunday_basic ?? 2, sundayOt: multiplier?.sunday_ot ?? 2,
    holidayBasic: multiplier?.holiday_basic ?? 3, holidayOt: multiplier?.holiday_ot ?? 3,
  }
  const flags = (payColumns || []).map(c => ({ key: c.id as any, includeInGross: c.include_in_gross, includeInNetDeduct: c.include_in_net_deduct }))
  const valuesByWorker = new Map<number, Record<number, number>>()
  for (const v of payValues || []) {
    if (!valuesByWorker.has(v.worker_id)) valuesByWorker.set(v.worker_id, {})
    valuesByWorker.get(v.worker_id)![v.pay_column_id] = Number(v.value) || 0
  }
  const netPayOf = (workerId: number) => calcNetPay((valuesByWorker.get(workerId) || {}) as any, flags as any)

  // Same estimate the Timesheet page shows per worker (Est. Pay), summed:
  // hourly rate = net pay / days in month / 8, times each day-type's multiplier.
  function salaryOf(r: HourRow, dim: number) {
    const hourly = (() => { const net = netPayOf(r.worker_id); return net > 0 && dim > 0 ? net / dim / 8 : 0 })()
    return hourly * (
      Number(r.basic_normal) * 1 + Number(r.ot_normal) * mult.normalOt +
      Number(r.basic_sunday) * mult.sundayBasic + Number(r.ot_sunday) * mult.sundayOt +
      Number(r.basic_holiday) * mult.holidayBasic + Number(r.ot_holiday) * mult.holidayOt
    )
  }

  let depts: DeptStat[] = []
  const stats: MonthStat[] = months.map((m, i) => {
    const rows = ((monthRows[i].data as HourRow[]) || [])
    const dim = daysIn(m)
    let basic = 0, ot = 0, forecastOt = 0, salary = 0
    const byDept = new Map<string, DeptStat>()
    for (const r of rows) {
      const b = Number(r.basic_normal) + Number(r.basic_sunday) + Number(r.basic_holiday)
      const o = Number(r.ot_normal) + Number(r.ot_sunday) + Number(r.ot_holiday)
      const s = salaryOf(r, dim)
      basic += b; ot += o; forecastOt += Number(r.planned_ot); salary += s
      const name = (r.line || '').trim() || 'Unassigned'
      const d = byDept.get(name) || { name, workers: 0, salary: 0, ot: 0, forecastOt: 0, hours: 0 }
      d.workers += 1; d.salary += s; d.ot += o; d.forecastOt += Number(r.planned_ot); d.hours += b + o
      byDept.set(name, d)
    }
    if (i === months.length - 1) depts = [...byDept.values()].sort((a, b) => b.salary - a.salary)
    return { month: m, workers: rows.length, basic, ot, forecastOt, salary }
  })

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><LayoutDashboard className="w-7 h-7 text-indigo-600" /> HR Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Work hours, overtime and estimated salary payout — from the Timesheet and the supervisors&apos; OT plan.</p>
      <DashboardClient month={month} stats={stats} depts={depts} />
    </div>
  )
}
