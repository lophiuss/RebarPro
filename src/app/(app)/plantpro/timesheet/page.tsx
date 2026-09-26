export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { ClipboardCheck } from 'lucide-react'
import TimesheetClient from './TimesheetClient'

function currentMonthDefault() {
  return new Date().toISOString().slice(0, 7)
}

interface SearchParams { month?: string }

export default async function PlantproTimesheetPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { month: monthParam } = await searchParams
  const month = monthParam || currentMonthDefault()
  const supabase = await createClient()

  const [
    { data: workers }, { data: timesheetDays }, { data: holidays }, { data: allHolidays },
    { data: multiplier }, { data: payColumns }, { data: payValues }, { data: otMonths },
  ] = await Promise.all([
    supabase.from('plantpro_workers').select('id, worker_no, name, line, designation, supervisors:plantpro_supervisors(name)').neq('status', 'Inactive').order('name'),
    supabase.from('plantpro_timesheet_days').select('worker_id, day, basic, ot').eq('month', month),
    supabase.from('plantpro_holidays').select('date, label').gte('date', `${month}-01`).lte('date', `${month}-31`),
    supabase.from('plantpro_holidays').select('date, label').order('date'),
    supabase.from('plantpro_timesheet_multiplier').select('*').eq('id', 1).single(),
    supabase.from('plantpro_pay_columns').select('id, key, include_in_gross, include_in_net_deduct'),
    // RLS-gated: empty for a supervisor-tier viewer, by design.
    supabase.from('plantpro_worker_pay_values').select('worker_id, pay_column_id, value'),
    // Applied OT = what the supervisor planned/submitted on the OT & Allocation page.
    supabase.from('plantpro_ot_months').select('worker_id, days:plantpro_ot_days(ot)').eq('month', month),
  ])
  const appliedOtByWorker: Record<number, number> = {}
  for (const om of (otMonths as any[]) || []) appliedOtByWorker[om.worker_id] = (om.days || []).reduce((sum: number, d: { ot: number }) => sum + Number(d.ot || 0), 0)

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><ClipboardCheck className="w-7 h-7 text-indigo-600" /> HR Timesheet &amp; Payroll</h1>
      <p className="text-sm text-gray-500 mb-6">Key actual hours per worker per day. Basic × multiplier + OT × multiplier = gross pay estimate.</p>
      <TimesheetClient
        month={month}
        workers={(workers as any) || []}
        timesheetDays={timesheetDays || []}
        monthHolidays={holidays || []}
        allHolidays={allHolidays || []}
        multiplier={multiplier}
        payColumns={payColumns || []}
        payValues={payValues || []}
        appliedOtByWorker={appliedOtByWorker}
      />
    </div>
  )
}
