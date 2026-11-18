import { guardDlerPage } from '../guard'
import { daysInMonth, type DlerAllocation, type DlerDailyOt, type DlerDepartment, type DlerMonthlyPay, type DlerPerson, type DlerProject, type DlerSettings } from '@/lib/dler-math'
import PayOtWorkspace from '../_components/PayOtWorkspace'

export const dynamic = 'force-dynamic'

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

export default async function DlerWorkersPage(props: {
  searchParams: Promise<{ month?: string }>
}) {
  const { supabase } = await guardDlerPage(['admin', 'hr_worker'])
  const sp = await props.searchParams
  const todayMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7)
  const month = typeof sp?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : todayMonth

  const monthStart = `${month}-01`
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`

  const [settingsRes, holidaysRes, deptsRes, projsRes, workersRes, staffRes, allocRes, payRes] = await Promise.all([
    supabase.from('dler_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('dler_holidays').select('date').gte('date', monthStart).lte('date', monthEnd),
    supabase.from('dler_departments').select('*').order('sort_order').order('name'),
    supabase.from('dler_projects').select('*').order('name'),
    supabase.from('dler_people').select('*').eq('person_type', 'WORKER').order('emp_no'),
    supabase.from('dler_people').select('id, name').eq('person_type', 'STAFF').order('name'),
    supabase.from('dler_project_allocations').select('person_id, project_id, percentage'),
    supabase.from('dler_monthly_pay').select('*').eq('month', month),
  ])

  const dailyOts: DlerDailyOt[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('dler_daily_ot')
      .select('*')
      .gte('work_date', monthStart)
      .lte('work_date', monthEnd)
      .range(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as DlerDailyOt[]
    dailyOts.push(...rows)
    if (rows.length < 1000) break
    from += 1000
  }

  return (
    <PayOtWorkspace
      personType="WORKER"
      month={month}
      settings={(settingsRes.data as DlerSettings | null) ?? DEFAULT_SETTINGS}
      holidays={(holidaysRes.data ?? []).map((h: { date: string }) => h.date)}
      departments={(deptsRes.data ?? []) as DlerDepartment[]}
      projects={(projsRes.data ?? []) as DlerProject[]}
      people={(workersRes.data ?? []) as DlerPerson[]}
      allStaff={(staffRes.data ?? []) as { id: number; name: string }[]}
      allocations={(allocRes.data ?? []) as DlerAllocation[]}
      monthlyPays={(payRes.data ?? []) as DlerMonthlyPay[]}
      dailyOts={dailyOts}
    />
  )
}
