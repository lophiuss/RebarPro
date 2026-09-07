export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import ShoutoutBoard from '@/components/ShoutoutBoard'
import PublicJobRequestLink from './PublicJobRequestLink'
import { Wrench, AlertTriangle, Bell } from 'lucide-react'

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

interface SearchParams {
  period?: string
  from?: string
  to?: string
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

export default async function MaintenanceDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams
  const period = (['this_month', 'custom'].includes(rawPeriod || '') ? rawPeriod : 'this_week') as 'this_week' | 'this_month' | 'custom'

  const supabase = await createClient()
  const today = new Date()
  const todayStr = toStr(today)

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

  const [
    { data: equipment }, { data: jobReports }, { data: prevJobReports }, { data: pmRows }, { data: spareParts },
    { data: critical }, { data: settingsRow }, { count: pendingCount }, { data: { user } }, { data: weekSubs }, { count: awaitingApprovalCount },
  ] = await Promise.all([
    supabase.from('maintenance_equipment').select('id, name, category, target_repair_hours, pm_checklist_template_id').eq('is_active', true),
    supabase.from('maintenance_job_reports').select('id, equipment_id, category, report_date, downtime_hours, repair_time_hours, status').gte('report_date', periodStart).lte('report_date', periodEnd),
    supabase.from('maintenance_job_reports').select('id, equipment_id, downtime_hours, repair_time_hours').gte('report_date', prevPeriodStart).lte('report_date', prevPeriodEnd),
    supabase.from('maintenance_pm_schedule').select('id, equipment_id, planned, completed_at, assigned_to').eq('year', year).eq('week_number', weekNumber),
    supabase.from('maintenance_spare_parts_requests').select('quantity_requested, quantity_received').gte('request_date', periodStart).lte('request_date', periodEnd),
    supabase.from('maintenance_critical_issues').select('id, equipment_label, issue, lead_time_note, status, created_at, maintenance_equipment(name)').neq('status', 'completed').neq('status', 'cancelled').order('created_at', { ascending: false }),
    supabase.from('maintenance_settings').select('default_target_repair_hours').eq('id', 1).single(),
    supabase.from('maintenance_work_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.auth.getUser(),
    supabase.from('maintenance_checklist_submissions').select('equipment_id').gte('submission_date', toStr(weekMonday)).lte('submission_date', toStr(weekSunday)),
    supabase.from('maintenance_work_requests').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
  ])

  let myName = ''
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    myName = profile?.full_name || user.email || ''
  }
  const myPendingPm = (pmRows || []).filter(r => r.planned && !r.completed_at && r.assigned_to === myName)

  // Same "outstanding" definition as the Schedule page: has a checklist
  // template, planned this week, no submission filed yet — surfaced here
  // too so a technician sees it without navigating away from Dashboard.
  const submittedEquipIds = new Set((weekSubs || []).map(s => s.equipment_id).filter((id): id is number => id != null))
  const plannedThisWeekIds = new Set((pmRows || []).filter(r => r.planned).map(r => r.equipment_id))
  const outstandingChecklists = (equipment || []).filter(e => e.pm_checklist_template_id && plannedThisWeekIds.has(e.id) && !submittedEquipIds.has(e.id))

  const equipmentCount = (equipment || []).length
  const targetById = new Map((equipment || []).map(e => [e.id, Number(e.target_repair_hours) || Number(settingsRow?.default_target_repair_hours) || 4]))
  const defaultTarget = Number(settingsRow?.default_target_repair_hours) || 4

  const totalDowntime = (jobReports || []).reduce((s, r) => s + (Number(r.downtime_hours) || 0), 0)
  const totalPossibleHours = equipmentCount * periodHours
  const uptimePct = totalPossibleHours > 0 ? ((totalPossibleHours - totalDowntime) / totalPossibleHours) * 100 : 100

  // BRE % = (No. of responses within target time / No. of total breakdown) x 100
  // — target time defaults to 2.5h (maintenance_settings.default_target_repair_hours),
  // overridable per equipment via target_repair_hours. Confirmed formula.
  const breakdowns = (jobReports || []).filter(r => r.repair_time_hours !== null)
  const noOfBreakdown = breakdowns.length
  const withinTarget = breakdowns.filter(r => Number(r.repair_time_hours) <= (targetById.get(r.equipment_id) ?? defaultTarget)).length
  const brePct = noOfBreakdown > 0 ? (withinTarget / noOfBreakdown) * 100 : 100
  const avgRepairTime = noOfBreakdown > 0 ? breakdowns.reduce((s, r) => s + Number(r.repair_time_hours), 0) / noOfBreakdown : 0

  const plannedCount = (pmRows || []).filter(r => r.planned).length
  const completedCount = (pmRows || []).filter(r => r.planned && r.completed_at).length
  const schedulePct = plannedCount > 0 ? (completedCount / plannedCount) * 100 : 100

  // Availability % = MTBF / (MTBF + MTTR) x 100. Confirmed formula.
  // MTBF (mean time between failures) = uptime hours / no. of breakdowns
  // MTTR (mean time to repair) = total repair hours / no. of breakdowns
  // — both use the same breakdown count as the denominator, so it cancels
  // out of the ratio; kept explicit here (rather than simplified) so the
  // formula reads the same as the confirmed reference.
  const totalRepairHours = breakdowns.reduce((s, r) => s + Number(r.repair_time_hours || 0), 0)
  const uptimeHours = Math.max(0, totalPossibleHours - totalDowntime)
  const mtbf = noOfBreakdown > 0 ? uptimeHours / noOfBreakdown : uptimeHours
  const mttr = noOfBreakdown > 0 ? totalRepairHours / noOfBreakdown : 0
  const availabilityPct = (mtbf + mttr) > 0 ? (mtbf / (mtbf + mttr)) * 100 : 100

  const partsRequested = (spareParts || []).reduce((s, r) => s + (Number(r.quantity_requested) || 0), 0)
  const partsReceived = (spareParts || []).reduce((s, r) => s + (Number(r.quantity_received) || 0), 0)

  // Same formulas as above, over the immediately-preceding period, purely
  // for the trend bars — not shown as their own KPI cards.
  const prevTotalDowntime = (prevJobReports || []).reduce((s, r) => s + (Number(r.downtime_hours) || 0), 0)
  const prevUptimePct = totalPossibleHours > 0 ? ((totalPossibleHours - prevTotalDowntime) / totalPossibleHours) * 100 : 100
  const prevBreakdowns = (prevJobReports || []).filter(r => r.repair_time_hours !== null)
  const prevNoOfBreakdown = prevBreakdowns.length
  const prevWithinTarget = prevBreakdowns.filter(r => Number(r.repair_time_hours) <= (targetById.get(r.equipment_id) ?? defaultTarget)).length
  const prevBrePct = prevNoOfBreakdown > 0 ? (prevWithinTarget / prevNoOfBreakdown) * 100 : 100
  const prevAvgRepairTime = prevNoOfBreakdown > 0 ? prevBreakdowns.reduce((s, r) => s + Number(r.repair_time_hours), 0) / prevNoOfBreakdown : 0
  const prevTotalRepairHours = prevBreakdowns.reduce((s, r) => s + Number(r.repair_time_hours || 0), 0)
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
          ⚠️ {outstandingChecklists.length} checklist{outstandingChecklists.length === 1 ? '' : 's'} outstanding this week — {outstandingChecklists.map(e => e.name).join(', ')}
          <span className="block font-normal text-red-600 text-xs mt-0.5">Click to open the checklist for any of these on the Schedule page.</span>
        </a>
      )}

      <PublicJobRequestLink />

      <ShoutoutBoard department="maintenance" />

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-10">
        {cards.map(c => (
          <div key={c.label} className={`border rounded-xl p-4 shadow-sm overflow-hidden ${c.warn ? 'bg-red-50/70 border-red-200' : 'bg-white'}`}>
            <h3 className={`font-semibold text-xs uppercase truncate ${c.warn ? 'text-red-700' : 'text-gray-500'}`}>{c.label}</h3>
            <p className={`text-xl sm:text-2xl font-bold mt-1 truncate ${c.warn ? 'text-red-800' : 'text-slate-800'}`}>{c.value}</p>
            <p className={`text-xs mt-1 truncate ${c.warn ? 'text-red-600' : 'text-gray-400'}`}>{c.sub}</p>
            {c.trend && <MiniTrend current={c.trend.current} previous={c.trend.previous} higherIsBetter={c.trend.higherIsBetter} format={c.trend.format} />}
          </div>
        ))}
        <div className="border rounded-xl p-4 bg-white shadow-sm overflow-hidden col-span-2">
          <h3 className="font-semibold text-xs text-gray-500 uppercase truncate">Spare Part Requested vs Received</h3>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-slate-800 truncate">{partsRequested} <span className="text-gray-300">/</span> <span className="text-green-600">{partsReceived}</span></p>
          <p className="text-xs text-gray-400 mt-1 truncate">Requested / Received, this period</p>
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /> Critical Issues</h2>
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
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
    </div>
  )
}
