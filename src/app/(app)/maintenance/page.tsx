export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import ShoutoutBoard from '@/components/ShoutoutBoard'
import { Wrench, AlertTriangle } from 'lucide-react'

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

  const [
    { data: equipment }, { data: jobReports }, { data: pmRows }, { data: spareParts },
    { data: critical }, { data: settingsRow }, { data: pendingWorkRequests },
  ] = await Promise.all([
    supabase.from('maintenance_equipment').select('id, name, target_repair_hours').eq('is_active', true),
    supabase.from('maintenance_job_reports').select('id, equipment_id, category, report_date, downtime_hours, repair_time_hours, status').gte('report_date', periodStart).lte('report_date', periodEnd),
    supabase.from('maintenance_pm_schedule').select('id, equipment_id, planned, completed_at').eq('year', year).eq('week_number', weekNumber),
    supabase.from('maintenance_spare_parts_requests').select('quantity_requested, quantity_received').gte('request_date', periodStart).lte('request_date', periodEnd),
    supabase.from('maintenance_critical_issues').select('id, equipment_label, issue, lead_time_note, status, created_at, maintenance_equipment(name)').neq('status', 'completed').neq('status', 'cancelled').order('created_at', { ascending: false }),
    supabase.from('maintenance_settings').select('default_target_repair_hours').eq('id', 1).single(),
    supabase.from('maintenance_work_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const equipmentCount = (equipment || []).length
  const targetById = new Map((equipment || []).map(e => [e.id, Number(e.target_repair_hours) || Number(settingsRow?.default_target_repair_hours) || 4]))
  const defaultTarget = Number(settingsRow?.default_target_repair_hours) || 4

  const totalDowntime = (jobReports || []).reduce((s, r) => s + (Number(r.downtime_hours) || 0), 0)
  const totalPossibleHours = equipmentCount * periodHours
  const uptimePct = totalPossibleHours > 0 ? ((totalPossibleHours - totalDowntime) / totalPossibleHours) * 100 : 100

  const breakdowns = (jobReports || []).filter(r => r.repair_time_hours !== null)
  const noOfBreakdown = breakdowns.length
  const withinTarget = breakdowns.filter(r => Number(r.repair_time_hours) <= (targetById.get(r.equipment_id) ?? defaultTarget)).length
  const brePct = noOfBreakdown > 0 ? (withinTarget / noOfBreakdown) * 100 : 100
  const avgRepairTime = noOfBreakdown > 0 ? breakdowns.reduce((s, r) => s + Number(r.repair_time_hours), 0) / noOfBreakdown : 0

  const plannedCount = (pmRows || []).filter(r => r.planned).length
  const completedCount = (pmRows || []).filter(r => r.planned && r.completed_at).length
  const schedulePct = plannedCount > 0 ? (completedCount / plannedCount) * 100 : 100

  const partsRequested = (spareParts || []).reduce((s, r) => s + (Number(r.quantity_requested) || 0), 0)
  const partsReceived = (spareParts || []).reduce((s, r) => s + (Number(r.quantity_received) || 0), 0)

  const pendingCount = pendingWorkRequests?.length ?? (pendingWorkRequests as any)?.count ?? 0

  const cards = [
    { label: 'Machine Uptime', value: `${uptimePct.toFixed(1)}%`, sub: 'This period', warn: uptimePct < 90 },
    { label: 'No. of Breakdown', value: String(noOfBreakdown), sub: `${withinTarget} within target repair time`, warn: noOfBreakdown > 5 },
    { label: 'BRE % (Breakdown Response)', value: `${brePct.toFixed(1)}%`, sub: 'Resolved within target', warn: brePct < 80 },
    { label: 'Avg Repair Time', value: `${avgRepairTime.toFixed(1)} h`, sub: 'Per breakdown', warn: false },
    { label: 'Schedule (Plan vs Actual)', value: `${schedulePct.toFixed(1)}%`, sub: `Week ${weekNumber}, ${year}`, warn: schedulePct < 70 },
    { label: 'Asset Availability', value: `${uptimePct.toFixed(1)}%`, sub: 'Fleet-wide', warn: uptimePct < 90 },
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

      {pendingCount > 0 && (
        <a href="/maintenance/work-requests" className="block bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-6 text-sm font-semibold text-amber-800 hover:bg-amber-100">
          🔔 {pendingCount} pending Work Request{pendingCount === 1 ? '' : 's'} awaiting assignment — click to review
        </a>
      )}

      <ShoutoutBoard department="maintenance" />

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-10">
        {cards.map(c => (
          <div key={c.label} className={`border rounded-xl p-4 shadow-sm overflow-hidden ${c.warn ? 'bg-red-50/70 border-red-200' : 'bg-white'}`}>
            <h3 className={`font-semibold text-xs uppercase truncate ${c.warn ? 'text-red-700' : 'text-gray-500'}`}>{c.label}</h3>
            <p className={`text-xl sm:text-2xl font-bold mt-1 truncate ${c.warn ? 'text-red-800' : 'text-slate-800'}`}>{c.value}</p>
            <p className={`text-xs mt-1 truncate ${c.warn ? 'text-red-600' : 'text-gray-400'}`}>{c.sub}</p>
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
