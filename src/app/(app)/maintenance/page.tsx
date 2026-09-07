export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import ShoutoutBoard from '@/components/ShoutoutBoard'
import { Wrench, AlertTriangle, Bell } from 'lucide-react'

// KPI formula explanations, shown as a hover tooltip on each card.
const KPI_TOOLTIPS: Record<string, string> = {
  'Machine Uptime': 'Uptime % = (Total possible hours − Downtime hours) / Total possible hours × 100. Total possible hours = active equipment count × hours in the selected period.',
  'No. of Breakdown': 'Count of equipment-linked Work Requests that reached Completed/Approved status within the selected period.',
  'BRE % (Breakdown Response)': 'BRE % = (No. of breakdowns resolved within target repair time / Total no. of breakdowns) × 100. Target time defaults to the equipment’s configured target (or the department default) in Settings.',
  'Avg Repair Time': 'Average of (completion time − pickup time) across all breakdowns in the period. Pickup time = accepted time, or assigned/filed time if never explicitly accepted.',
  'Schedule (Plan vs Actual)': 'Schedule % = (No. of planned PM tasks completed this week / No. of planned PM tasks this week) × 100.',
  'Asset Availability': 'Availability % = MTBF / (MTBF + MTTR) × 100. MTBF (mean time between failures) = uptime hours / no. of breakdowns. MTTR (mean time to repair) = total repair hours / no. of breakdowns.',
}

// Small current-vs-previous-period bar pair, rendered as static SVG (no
// charting library — this is the only chart in the app, and a full library
// is overkill for two bars). higherIsBetter decides which direction is
// "good" for the delta arrow's color.
function MiniTrend({ current, previous, higherIsBetter, format }: { current: number; previous: number; higherIsBetter: boolean; format: (n: number) => string }) {
  const max = Math.max(current, previous, 0.0001)
  const curH = Math.max(2, Math.round((current / max) * 24))
  const prevH = Math.max(2, Math.round((previous / max) * 24))
  const delta = previous !== 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0)
  const favorable = higherIsBetter ? current >= previous : current <= previous
  const flat = Math.abs(delta) < 0.05
  return (
    <div className="flex items-center gap-2 mt-2">
      <svg width="28" height="28" viewBox="0 0 28 28" className="flex-shrink-0">
        <rect x="2" y={26 - prevH} width="9" height={prevH} rx="1.5" className="fill-gray-200" />
        <rect x="15" y={26 - curH} width="9" height={curH} rx="1.5" className={favorable ? 'fill-green-500' : 'fill-red-400'} />
      </svg>
      <span className={`text-[11px] font-semibold ${flat ? 'text-gray-400' : favorable ? 'text-green-600' : 'text-red-500'}`}>
        {flat ? '—' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}%`}
        <span className="text-gray-400 font-normal"> vs {format(previous)} prior</span>
      </span>
    </div>
  )
}

// N-bar historical trend, same "no charting library" SVG approach as
// MiniTrend, generalized to however many month buckets are being shown.
function TrendBarChart({ data, format }: { data: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(...data.map(d => d.value), 0.0001)
  const barW = Math.max(8, Math.min(28, Math.floor(280 / Math.max(data.length, 1)) - 4))
  const gap = 4
  const chartW = data.length * (barW + gap)
  const chartH = 70
  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(chartW, 100)} height={chartH + 28} viewBox={`0 0 ${Math.max(chartW, 100)} ${chartH + 28}`}>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.value / max) * chartH))
          const x = i * (barW + gap)
          return (
            <g key={i}>
              <title>{d.label}: {format(d.value)}</title>
              <rect x={x} y={chartH - h} width={barW} height={h} rx="2" className="fill-orange-500" />
              <text x={x + barW / 2} y={chartH + 11} textAnchor="middle" className="fill-gray-400" style={{ fontSize: 8 }}>{d.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

interface SearchParams {
  period?: string
  from?: string
  to?: string
  chartRange?: string
  chartFrom?: string
  chartTo?: string
}

function pad2(n: number) { return String(n).padStart(2, '0') }
function toStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
// Same as isoWeek() but also returns the ISO week-year, needed to match
// maintenance_pm_schedule rows (keyed by year + week_number) into a month
// bucket by that week's Monday date.
function isoWeekInfo(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { isoYear, week }
}
function mondayOfIsoWeek(isoYear: number, week: number) {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))
  const target = new Date(week1Monday)
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7)
  return target
}
// Splits [rangeStart, rangeEnd] into calendar-month buckets, clipped to the
// range at both ends (so a custom range's partial first/last month only
// counts the days actually inside it).
function monthBuckets(rangeStart: Date, rangeEnd: Date) {
  const buckets: { label: string; start: Date; end: Date }[] = []
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
  let guard = 0
  while (cursor <= rangeEnd && guard < 60) {
    guard++
    const monthEndFull = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const start = cursor > rangeStart ? cursor : rangeStart
    const end = monthEndFull < rangeEnd ? monthEndFull : rangeEnd
    buckets.push({ label: cursor.toLocaleString('default', { month: 'short', year: '2-digit' }), start, end })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return buckets
}

export default async function MaintenanceDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { period: rawPeriod, from: rawFrom, to: rawTo, chartRange: rawChartRange, chartFrom: rawChartFrom, chartTo: rawChartTo } = await searchParams
  const period = (['this_month', 'custom'].includes(rawPeriod || '') ? rawPeriod : 'this_week') as 'this_week' | 'this_month' | 'custom'
  const chartRange = (['6m', 'custom'].includes(rawChartRange || '') ? rawChartRange : '12m') as '12m' | '6m' | 'custom'

  const supabase = await createClient()
  const today = new Date()
  const todayStr = toStr(today)

  // Range of months the KPI trend charts cover.
  let chartRangeStart: Date
  let chartRangeEnd = today
  if (chartRange === '6m') {
    chartRangeStart = new Date(today.getFullYear(), today.getMonth() - 5, 1)
  } else if (chartRange === 'custom') {
    chartRangeStart = rawChartFrom ? new Date(rawChartFrom + 'T00:00:00') : new Date(today.getFullYear(), today.getMonth() - 11, 1)
    chartRangeEnd = rawChartTo ? new Date(rawChartTo + 'T00:00:00') : today
  } else {
    chartRangeStart = new Date(today.getFullYear(), today.getMonth() - 11, 1)
  }
  const chartBuckets = monthBuckets(chartRangeStart, chartRangeEnd)
  const chartYears = [...new Set(chartBuckets.flatMap(b => [b.start.getFullYear(), b.end.getFullYear()]))]

  function hrefWithChart(overrides: { chartRange?: string; chartFrom?: string; chartTo?: string }) {
    const merged = { period, from: rawFrom, to: rawTo, chartRange, chartFrom: rawChartFrom, chartTo: rawChartTo, ...overrides }
    const params = new URLSearchParams()
    if (merged.period && merged.period !== 'this_week') params.set('period', merged.period)
    if (merged.period === 'custom') {
      if (merged.from) params.set('from', merged.from)
      if (merged.to) params.set('to', merged.to)
    }
    if (merged.chartRange && merged.chartRange !== '12m') params.set('chartRange', merged.chartRange)
    if (merged.chartRange === 'custom') {
      if (merged.chartFrom) params.set('chartFrom', merged.chartFrom)
      if (merged.chartTo) params.set('chartTo', merged.chartTo)
    }
    const qs = params.toString()
    return qs ? `/maintenance?${qs}` : '/maintenance'
  }

  const firstOfWeek = new Date(today)
  firstOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7)) // Monday
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  let periodStart: string
  let periodEnd = todayStr
  let periodLabel = 'This Week'
  if (period === 'this_month') {
    periodStart = toStr(firstOfMonth)
    periodLabel = today.toLocaleString('default', { month: 'long', year: 'numeric' })
  } else if (period === 'custom') {
    periodStart = rawFrom || toStr(firstOfWeek)
    periodEnd = rawTo || todayStr
    periodLabel = `${periodStart} → ${periodEnd}`
  } else {
    periodStart = toStr(firstOfWeek)
  }

  function hrefWith(overrides: { period?: string; from?: string; to?: string }) {
    const merged = { period, from: rawFrom, to: rawTo, ...overrides }
    const params = new URLSearchParams()
    if (merged.period && merged.period !== 'this_week') params.set('period', merged.period)
    if (merged.period === 'custom') {
      if (merged.from) params.set('from', merged.from)
      if (merged.to) params.set('to', merged.to)
    }
    const qs = params.toString()
    return qs ? `/maintenance?${qs}` : '/maintenance'
  }

  const periodMs = new Date(periodEnd).getTime() - new Date(periodStart).getTime()
  const periodDays = Math.max(1, Math.round(periodMs / 86400000) + 1)
  const periodHours = periodDays * 24
  const year = today.getFullYear()
  const weekNumber = isoWeek(today)

  // Immediately-preceding period of the same length, for the trend bars —
  // e.g. "This Week" compares against the 7 days before this week started.
  const prevPeriodEndDate = new Date(new Date(periodStart).getTime() - 86400000)
  const prevPeriodStartDate = new Date(prevPeriodEndDate.getTime() - (periodDays - 1) * 86400000)
  const prevPeriodStart = toStr(prevPeriodStartDate)
  const prevPeriodEnd = toStr(prevPeriodEndDate)

  const weekMonday = new Date(today)
  weekMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weekSunday = new Date(weekMonday)
  weekSunday.setDate(weekMonday.getDate() + 6)

  // Breakdown/repair-time KPIs used to read maintenance_job_reports, but
  // that table is now frozen (Jobs was unified into the Work Request
  // pipeline — see the "Unify Jobs with the Work Request pipeline" change).
  // Re-pointed at maintenance_work_requests: any equipment-linked request
  // that reached completed/approved counts as a resolved breakdown, with
  // repair time = the gap between it being picked up (accepted, or
  // assigned/filed if never explicitly accepted — some historical/imported
  // rows skip straight to approved) and completed.
  function workRequestRepairHours(r: { assigned_at: string | null; accepted_at: string | null; completed_at: string | null; created_at: string }) {
    if (!r.completed_at) return null
    const start = r.accepted_at || r.assigned_at || r.created_at
    return Math.max(0, (new Date(r.completed_at).getTime() - new Date(start).getTime()) / 3600000)
  }

  const [
    { data: equipment }, { data: workRequests }, { data: prevWorkRequests }, { data: pmRows }, { data: spareParts },
    { data: critical }, { data: settingsRow }, { count: pendingCount }, { data: { user } }, { data: weekSubs }, { count: awaitingApprovalCount },
    { data: chartWorkRequests }, { data: chartPmRows },
  ] = await Promise.all([
    supabase.from('maintenance_equipment').select('id, name, category, target_repair_hours, pm_checklist_template_id').eq('is_active', true),
    supabase.from('maintenance_work_requests').select('id, equipment_id, assigned_at, accepted_at, completed_at, status, created_at').not('equipment_id', 'is', null).in('status', ['completed', 'approved']).gte('created_at', periodStart).lte('created_at', periodEnd + 'T23:59:59'),
    supabase.from('maintenance_work_requests').select('id, equipment_id, assigned_at, accepted_at, completed_at, status, created_at').not('equipment_id', 'is', null).in('status', ['completed', 'approved']).gte('created_at', prevPeriodStart).lte('created_at', prevPeriodEnd + 'T23:59:59'),
    supabase.from('maintenance_pm_schedule').select('id, equipment_id, planned, completed_at, assigned_to').eq('year', year).eq('week_number', weekNumber),
    supabase.from('maintenance_spare_parts_requests').select('quantity_requested, quantity_received').gte('request_date', periodStart).lte('request_date', periodEnd),
    supabase.from('maintenance_critical_issues').select('id, equipment_label, issue, lead_time_note, status, created_at, maintenance_equipment(name)').neq('status', 'completed').neq('status', 'cancelled').order('created_at', { ascending: false }),
    supabase.from('maintenance_settings').select('default_target_repair_hours').eq('id', 1).single(),
    supabase.from('maintenance_work_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.auth.getUser(),
    supabase.from('maintenance_checklist_submissions').select('equipment_id').gte('submission_date', toStr(weekMonday)).lte('submission_date', toStr(weekSunday)),
    supabase.from('maintenance_work_requests').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('maintenance_work_requests').select('id, equipment_id, assigned_at, accepted_at, completed_at, status, created_at').not('equipment_id', 'is', null).in('status', ['completed', 'approved']).gte('created_at', toStr(chartRangeStart)).lte('created_at', toStr(chartRangeEnd) + 'T23:59:59'),
    supabase.from('maintenance_pm_schedule').select('equipment_id, year, week_number, planned, completed_at').in('year', chartYears),
  ])

  let myName = ''
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    myName = profile?.full_name || user.email || ''
  }
  const myPendingPm = (pmRows || []).filter(r => r.planned && !r.completed_at && r.assigned_to === myName)

  // "Due this week" = planned this week and not yet marked complete —
  // regardless of whether the equipment has a checklist template attached.
  // Previously this only fired for equipment WITH a template (via a missing
  // checklist submission), so any equipment planned without one never
  // prompted at all even though it was genuinely due. completed_at (not the
  // checklist-submission table) is now the source of truth for "done".
  const plannedThisWeekIds = new Set((pmRows || []).filter(r => r.planned).map(r => r.equipment_id))
  const completedThisWeekIds = new Set((pmRows || []).filter(r => r.planned && r.completed_at).map(r => r.equipment_id))
  const outstandingChecklists = (equipment || []).filter(e => plannedThisWeekIds.has(e.id) && !completedThisWeekIds.has(e.id))

  const equipmentCount = (equipment || []).length
  const targetById = new Map((equipment || []).map(e => [e.id, Number(e.target_repair_hours) || Number(settingsRow?.default_target_repair_hours) || 4]))
  const defaultTarget = Number(settingsRow?.default_target_repair_hours) || 4

  const breakdownsWithHours = (workRequests || [])
    .map(r => ({ ...r, repair_time_hours: workRequestRepairHours(r) }))
    .filter((r): r is typeof r & { repair_time_hours: number } => r.repair_time_hours !== null)

  const totalDowntime = breakdownsWithHours.reduce((s, r) => s + r.repair_time_hours, 0)
  const totalPossibleHours = equipmentCount * periodHours
  const uptimePct = totalPossibleHours > 0 ? ((totalPossibleHours - totalDowntime) / totalPossibleHours) * 100 : 100

  // BRE % = (No. of responses within target time / No. of total breakdown) x 100
  // — target time defaults to 2.5h (maintenance_settings.default_target_repair_hours),
  // overridable per equipment via target_repair_hours. Confirmed formula.
  const breakdowns = breakdownsWithHours
  const noOfBreakdown = breakdowns.length
  const withinTarget = breakdowns.filter(r => r.repair_time_hours <= (targetById.get(r.equipment_id) ?? defaultTarget)).length
  const brePct = noOfBreakdown > 0 ? (withinTarget / noOfBreakdown) * 100 : 100
  const avgRepairTime = noOfBreakdown > 0 ? breakdowns.reduce((s, r) => s + r.repair_time_hours, 0) / noOfBreakdown : 0

  const plannedCount = (pmRows || []).filter(r => r.planned).length
  const completedCount = (pmRows || []).filter(r => r.planned && r.completed_at).length
  const schedulePct = plannedCount > 0 ? (completedCount / plannedCount) * 100 : 100

  // Availability % = MTBF / (MTBF + MTTR) x 100. Confirmed formula.
  // MTBF (mean time between failures) = uptime hours / no. of breakdowns
  // MTTR (mean time to repair) = total repair hours / no. of breakdowns
  // — both use the same breakdown count as the denominator, so it cancels
  // out of the ratio; kept explicit here (rather than simplified) so the
  // formula reads the same as the confirmed reference.
  const totalRepairHours = breakdowns.reduce((s, r) => s + r.repair_time_hours, 0)
  const uptimeHours = Math.max(0, totalPossibleHours - totalDowntime)
  const mtbf = noOfBreakdown > 0 ? uptimeHours / noOfBreakdown : uptimeHours
  const mttr = noOfBreakdown > 0 ? totalRepairHours / noOfBreakdown : 0
  const availabilityPct = (mtbf + mttr) > 0 ? (mtbf / (mtbf + mttr)) * 100 : 100

  const partsRequested = (spareParts || []).reduce((s, r) => s + (Number(r.quantity_requested) || 0), 0)
  const partsReceived = (spareParts || []).reduce((s, r) => s + (Number(r.quantity_received) || 0), 0)

  // Same formulas as above, over the immediately-preceding period, purely
  // for the trend bars — not shown as their own KPI cards.
  const prevBreakdownsWithHours = (prevWorkRequests || [])
    .map(r => ({ ...r, repair_time_hours: workRequestRepairHours(r) }))
    .filter((r): r is typeof r & { repair_time_hours: number } => r.repair_time_hours !== null)
  const prevTotalDowntime = prevBreakdownsWithHours.reduce((s, r) => s + r.repair_time_hours, 0)
  const prevUptimePct = totalPossibleHours > 0 ? ((totalPossibleHours - prevTotalDowntime) / totalPossibleHours) * 100 : 100
  const prevBreakdowns = prevBreakdownsWithHours
  const prevNoOfBreakdown = prevBreakdowns.length
  const prevWithinTarget = prevBreakdowns.filter(r => r.repair_time_hours <= (targetById.get(r.equipment_id) ?? defaultTarget)).length
  const prevBrePct = prevNoOfBreakdown > 0 ? (prevWithinTarget / prevNoOfBreakdown) * 100 : 100
  const prevAvgRepairTime = prevNoOfBreakdown > 0 ? prevBreakdowns.reduce((s, r) => s + r.repair_time_hours, 0) / prevNoOfBreakdown : 0
  const prevTotalRepairHours = prevBreakdowns.reduce((s, r) => s + r.repair_time_hours, 0)
  const prevUptimeHours = Math.max(0, totalPossibleHours - prevTotalDowntime)
  const prevMtbf = prevNoOfBreakdown > 0 ? prevUptimeHours / prevNoOfBreakdown : prevUptimeHours
  const prevMttr = prevNoOfBreakdown > 0 ? prevTotalRepairHours / prevNoOfBreakdown : 0
  const prevAvailabilityPct = (prevMtbf + prevMttr) > 0 ? (prevMtbf / (prevMtbf + prevMttr)) * 100 : 100

  const pctFmt = (n: number) => `${n.toFixed(1)}%`
  const hFmt = (n: number) => `${n.toFixed(1)}h`

  const cards = [
    { label: 'Machine Uptime', value: `${uptimePct.toFixed(1)}%`, sub: 'This period', warn: uptimePct < 90, trend: { current: uptimePct, previous: prevUptimePct, higherIsBetter: true, format: pctFmt } },
    { label: 'No. of Breakdown', value: String(noOfBreakdown), sub: `${withinTarget} within target repair time`, warn: noOfBreakdown > 5, trend: { current: noOfBreakdown, previous: prevNoOfBreakdown, higherIsBetter: false, format: (n: number) => String(n) } },
    { label: 'BRE % (Breakdown Response)', value: `${brePct.toFixed(1)}%`, sub: 'Resolved within target', warn: brePct < 80, trend: { current: brePct, previous: prevBrePct, higherIsBetter: true, format: pctFmt } },
    { label: 'Avg Repair Time', value: `${avgRepairTime.toFixed(1)} h`, sub: 'Per breakdown', warn: false, trend: { current: avgRepairTime, previous: prevAvgRepairTime, higherIsBetter: false, format: hFmt } },
    { label: 'Schedule (Plan vs Actual)', value: `${schedulePct.toFixed(1)}%`, sub: `Week ${weekNumber}, ${year}`, warn: schedulePct < 70, trend: null },
    { label: 'Asset Availability', value: `${availabilityPct.toFixed(1)}%`, sub: 'MTBF / (MTBF + MTTR), fleet-wide', warn: availabilityPct < 90, trend: { current: availabilityPct, previous: prevAvailabilityPct, higherIsBetter: true, format: pctFmt } },
  ]

  // Per-month KPI history for the trend bar charts below — same formulas as
  // the cards above, recomputed per bucket. equipmentCount is held constant
  // across history (today's active-equipment count) rather than
  // reconstructing historical fleet size, which the schema doesn't track.
  const chartSeries = chartBuckets.map(b => {
    const bucketDays = Math.max(1, Math.round((b.end.getTime() - b.start.getTime()) / 86400000) + 1)
    const bucketPossibleHours = equipmentCount * bucketDays * 24
    const bucketStartStr = toStr(b.start)
    const bucketEndStr = toStr(b.end)
    const bucketBreakdowns = (chartWorkRequests || [])
      .filter(r => r.created_at >= bucketStartStr && r.created_at <= bucketEndStr + 'T23:59:59')
      .map(r => ({ ...r, repair_time_hours: workRequestRepairHours(r) }))
      .filter((r): r is typeof r & { repair_time_hours: number } => r.repair_time_hours !== null)
    const bDowntime = bucketBreakdowns.reduce((s, r) => s + r.repair_time_hours, 0)
    const bUptimePct = bucketPossibleHours > 0 ? ((bucketPossibleHours - bDowntime) / bucketPossibleHours) * 100 : 100
    const bNoOfBreakdown = bucketBreakdowns.length
    const bWithinTarget = bucketBreakdowns.filter(r => r.repair_time_hours <= (targetById.get(r.equipment_id) ?? defaultTarget)).length
    const bBrePct = bNoOfBreakdown > 0 ? (bWithinTarget / bNoOfBreakdown) * 100 : 100
    const bAvgRepairTime = bNoOfBreakdown > 0 ? bDowntime / bNoOfBreakdown : 0
    const bUptimeHours = Math.max(0, bucketPossibleHours - bDowntime)
    const bMtbf = bNoOfBreakdown > 0 ? bUptimeHours / bNoOfBreakdown : bUptimeHours
    const bMttr = bNoOfBreakdown > 0 ? bDowntime / bNoOfBreakdown : 0
    const bAvailabilityPct = (bMtbf + bMttr) > 0 ? (bMtbf / (bMtbf + bMttr)) * 100 : 100

    // Schedule % for this bucket: weeks whose Monday falls inside it.
    const bucketPmRows = (chartPmRows || []).filter(r => {
      const monday = mondayOfIsoWeek(r.year, r.week_number)
      return monday >= b.start && monday <= b.end
    })
    const bPlanned = bucketPmRows.filter(r => r.planned).length
    const bCompleted = bucketPmRows.filter(r => r.planned && r.completed_at).length
    const bSchedulePct = bPlanned > 0 ? (bCompleted / bPlanned) * 100 : 100

    return {
      label: b.label,
      uptimePct: bUptimePct, noOfBreakdown: bNoOfBreakdown, brePct: bBrePct,
      avgRepairTime: bAvgRepairTime, schedulePct: bSchedulePct, availabilityPct: bAvailabilityPct,
    }
  })
  const chartMetrics: { key: keyof typeof chartSeries[number]; label: string; format: (n: number) => string }[] = [
    { key: 'uptimePct', label: 'Machine Uptime', format: pctFmt },
    { key: 'noOfBreakdown', label: 'No. of Breakdown', format: (n: number) => String(Math.round(n)) },
    { key: 'brePct', label: 'BRE %', format: pctFmt },
    { key: 'avgRepairTime', label: 'Avg Repair Time', format: hFmt },
    { key: 'schedulePct', label: 'Schedule %', format: pctFmt },
    { key: 'availabilityPct', label: 'Asset Availability', format: pctFmt },
  ]

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Wrench className="w-7 h-7 text-orange-600" /> Maintenance Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[{ key: 'this_week', label: 'This Week' }, { key: 'this_month', label: 'This Month' }].map(opt => (
              <a key={opt.key} href={hrefWith({ period: opt.key })}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${period === opt.key ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {opt.label}
              </a>
            ))}
          </div>
          <form method="GET" className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
            <input type="hidden" name="period" value="custom" />
            <input type="date" name="from" defaultValue={period === 'custom' ? periodStart : ''} className="border rounded-md px-2 py-1 text-sm bg-white" />
            <span className="text-gray-400 text-sm">→</span>
            <input type="date" name="to" defaultValue={period === 'custom' ? periodEnd : ''} className="border rounded-md px-2 py-1 text-sm bg-white" />
            <button type="submit" className={`px-3 py-1 rounded-md text-sm font-semibold transition ${period === 'custom' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>Go</button>
          </form>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-6">KPIs reflect <strong>{periodLabel}</strong> ({periodStart} → {periodEnd}), across {equipmentCount} active equipment.</p>

      {!!pendingCount && pendingCount > 0 && (
        <a href="/maintenance/work-requests" className="block bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-3 text-sm font-semibold text-amber-800 hover:bg-amber-100">
          🔔 {pendingCount} pending Work Request{pendingCount === 1 ? '' : 's'} awaiting assignment — click to review
        </a>
      )}

      {!!awaitingApprovalCount && awaitingApprovalCount > 0 && (
        <a href="/maintenance/work-requests" className="block bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 mb-3 text-sm font-semibold text-blue-800 hover:bg-blue-100">
          📋 {awaitingApprovalCount} completed Work Request{awaitingApprovalCount === 1 ? '' : 's'} awaiting your approval — click to review
        </a>
      )}

      {myPendingPm.length > 0 && (
        <a href="/maintenance/schedule" className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-3 text-sm font-semibold text-amber-800 hover:bg-amber-100">
          <Bell className="w-4 h-4 flex-shrink-0" /> You have {myPendingPm.length} PM task{myPendingPm.length === 1 ? '' : 's'} assigned to you this week — click to review
        </a>
      )}

      {outstandingChecklists.length > 0 && (
        <a href="/maintenance/schedule" className="block bg-red-50 border border-red-200 rounded-xl px-5 py-3 mb-6 text-sm font-semibold text-red-800 hover:bg-red-100">
          ⚠️ {outstandingChecklists.length} PM task{outstandingChecklists.length === 1 ? '' : 's'} due this week, not yet marked done — {outstandingChecklists.map(e => e.name).join(', ')}
          <span className="block font-normal text-red-600 text-xs mt-0.5">Click to review on the Schedule page.</span>
        </a>
      )}

      <ShoutoutBoard department="maintenance" />

      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /> Critical Issues</h2>
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-10">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(critical || []).map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{c.maintenance_equipment?.name || c.equipment_label || '-'}</td>
                <td className="px-4 py-3 text-sm">{c.issue}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.lead_time_note || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${c.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>
                </td>
              </tr>
            ))}
            {(!critical || critical.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No open critical issues.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-10">
        {cards.map(c => (
          <div key={c.label} title={KPI_TOOLTIPS[c.label] || ''} className={`border rounded-xl p-4 shadow-sm overflow-hidden cursor-help ${c.warn ? 'bg-red-50/70 border-red-200' : 'bg-white'}`}>
            <h3 className={`font-semibold text-xs uppercase truncate ${c.warn ? 'text-red-700' : 'text-gray-500'}`}>{c.label}</h3>
            <p className={`text-xl sm:text-2xl font-bold mt-1 truncate ${c.warn ? 'text-red-800' : 'text-slate-800'}`}>{c.value}</p>
            <p className={`text-xs mt-1 truncate ${c.warn ? 'text-red-600' : 'text-gray-400'}`}>{c.sub}</p>
            {c.trend && <MiniTrend current={c.trend.current} previous={c.trend.previous} higherIsBetter={c.trend.higherIsBetter} format={c.trend.format} />}
          </div>
        ))}
        <div title="Total quantity requested vs. total quantity received across all Spare Parts requests filed in this period." className="border rounded-xl p-4 bg-white shadow-sm overflow-hidden col-span-2 cursor-help">
          <h3 className="font-semibold text-xs text-gray-500 uppercase truncate">Spare Part Requested vs Received</h3>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-slate-800 truncate">{partsRequested} <span className="text-gray-300">/</span> <span className="text-green-600">{partsReceived}</span></p>
          <p className="text-xs text-gray-400 mt-1 truncate">Requested / Received, this period</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold">KPI History</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[{ key: '12m', label: 'Past 12 Months' }, { key: '6m', label: 'Past 6 Months' }].map(opt => (
              <a key={opt.key} href={hrefWithChart({ chartRange: opt.key })}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${chartRange === opt.key ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {opt.label}
              </a>
            ))}
          </div>
          <form method="GET" className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
            <input type="hidden" name="period" value={period} />
            {period === 'custom' && <input type="hidden" name="from" value={rawFrom || ''} />}
            {period === 'custom' && <input type="hidden" name="to" value={rawTo || ''} />}
            <input type="hidden" name="chartRange" value="custom" />
            <input type="date" name="chartFrom" defaultValue={chartRange === 'custom' ? toStr(chartRangeStart) : ''} className="border rounded-md px-2 py-1 text-sm bg-white" />
            <span className="text-gray-400 text-sm">→</span>
            <input type="date" name="chartTo" defaultValue={chartRange === 'custom' ? toStr(chartRangeEnd) : ''} className="border rounded-md px-2 py-1 text-sm bg-white" />
            <button type="submit" className={`px-3 py-1 rounded-md text-sm font-semibold transition ${chartRange === 'custom' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>Go</button>
          </form>
        </div>
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-10">
        {chartMetrics.map(m => (
          <div key={m.key} title={KPI_TOOLTIPS[m.label] || ''} className="border rounded-xl p-4 bg-white shadow-sm cursor-help">
            <h3 className="font-semibold text-xs text-gray-500 uppercase truncate mb-2">{m.label}</h3>
            <TrendBarChart data={chartSeries.map(s => ({ label: s.label, value: s[m.key] as number }))} format={m.format} />
          </div>
        ))}
      </div>
    </div>
  )
}
