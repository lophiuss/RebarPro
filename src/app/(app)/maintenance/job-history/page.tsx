'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { History, ChevronLeft, ChevronRight, Image as ImageIcon, X, Pencil, Trash2 } from 'lucide-react'
import PhotoLightbox from '@/components/PhotoLightbox'

type DoneRequest = {
  id: number; requester_name: string; location: string | null; issue_description: string
  status: string; assigned_to: string | null; assigned_at: string | null; accepted_at: string | null
  completed_at: string | null; approved_at: string | null; approved_by: string | null
  resolution_photo_drive_id: string | null
  maintenance_equipment: { name: string; category: string | null } | null
}

type HeatRow = {
  equipment_id: number | null; assigned_at: string | null; accepted_at: string | null
  completed_at: string | null; created_at: string
  maintenance_equipment: { name: string; category: string | null } | null
}

const PAGE_SIZE = 100
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function hoursBetween(a: string, b: string) {
  return ((new Date(b).getTime() - new Date(a).getTime()) / 3600000).toFixed(1)
}

// Same repair-time definition as the Dashboard's breakdown KPIs — the gap
// between a request being picked up (accepted, or assigned/filed if never
// explicitly accepted) and completed.
function repairHours(r: { assigned_at: string | null; accepted_at: string | null; completed_at: string | null; created_at: string }) {
  if (!r.completed_at) return null
  const start = r.accepted_at || r.assigned_at || r.created_at
  return Math.max(0, (new Date(r.completed_at).getTime() - new Date(start).getTime()) / 3600000)
}

// assigned_to sometimes holds several names at once (e.g. imported
// historical rows like "Jumadi, Saiful" or "Aiman/Ujjal") — split on common
// separators so the per-technician summary and filter credit each person
// individually instead of treating the combined string as one technician.
function splitNames(assignedTo: string | null): string[] {
  if (!assignedTo) return []
  return assignedTo.split(/\s*(?:,|\/|&|;|\band\b)\s*/i).map(n => n.trim()).filter(Boolean)
}

// Supabase/PostgREST caps every response at its project "Max Rows" setting
// (1,000 by default) REGARDLESS of a larger .limit() in the client — a
// query for "up to 20000 rows" silently comes back with only the first
// 1,000 Postgres happens to return. Worse, without an explicit .order()
// that "first 1,000" isn't even a meaningful slice (e.g. oldest-inserted),
// so aggregates built from it can be badly skewed rather than just
// incomplete. This fetches everything by paging in Max-Rows-sized batches
// with a stable order, for anything on this page that needs the FULL
// history rather than one on-screen page of it (summary counts, the
// heatmap, CSV/PDF export).
async function fetchAllRows<T>(
  supabase: ReturnType<typeof createClient>,
  build: (query: ReturnType<ReturnType<typeof createClient>['from']>) => any,
  batchSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const query = build(supabase.from('maintenance_work_requests') as any).order('id', { ascending: true }).range(from, from + batchSize - 1)
    const { data, error } = await query
    if (error) throw error
    const rows = (data as T[]) || []
    all.push(...rows)
    if (rows.length < batchSize) break
    from += batchSize
  }
  return all
}

export default function JobHistoryPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<DoneRequest[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [pageInput, setPageInput] = useState('1')
  const [loading, setLoading] = useState(true)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [bigThumbs, setBigThumbs] = useState(false)
  const [detailRow, setDetailRow] = useState<DoneRequest | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [myIdentifier, setMyIdentifier] = useState('')
  const [editingDetail, setEditingDetail] = useState(false)
  const [editData, setEditData] = useState<Partial<DoneRequest>>({})
  const [savingDetail, setSavingDetail] = useState(false)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [showTechSummary, setShowTechSummary] = useState(false)

  // Heatmap — lazy-loaded only when opened (a heavier fetch than the thin
  // summaryRows above: needs equipment/category + all four timestamps to
  // compute per-cell downtime and breakdown counts).
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [heatmapLoading, setHeatmapLoading] = useState(false)
  const [heatmapLoaded, setHeatmapLoaded] = useState(false)
  const [heatRows, setHeatRows] = useState<HeatRow[]>([])
  const [heatGroupBy, setHeatGroupBy] = useState<'equipment' | 'category'>('equipment')
  const [heatMetric, setHeatMetric] = useState<'downtime' | 'frequency'>('downtime')
  const [heatYear, setHeatYear] = useState<number | 'all' | null>(null)

  // Lightweight, department-wide data (not just the current page) for the
  // technician/category picklists and the per-technician summary cards —
  // only 3 thin columns, so fetching it across all ~7,000+ historical rows
  // stays cheap even though the table below only ever renders one page.
  const [summaryRows, setSummaryRows] = useState<{ assigned_to: string | null; status: string; category: string | null }[]>([])

  const [technicianFilter, setTechnicianFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => { loadSummary(); loadMe() }, [])
  useEffect(() => { setEditingDetail(false) }, [detailRow?.id])
  useEffect(() => { setPage(0) }, [technicianFilter, categoryFilter, statusFilter, fromDate, toDate])
  useEffect(() => { setPageInput(String(page + 1)) }, [page])
  useEffect(() => { loadPage() }, [page, technicianFilter, categoryFilter, statusFilter, fromDate, toDate])

  async function loadSummary() {
    const data = await fetchAllRows<any>(supabase, q =>
      q.select('assigned_to, status, maintenance_equipment(category)').in('status', ['completed', 'approved'])
    ).catch(err => { alert('Error loading summary: ' + err.message); return [] })
    setSummaryRows((data || []).map((r: any) => ({ assigned_to: r.assigned_to, status: r.status, category: r.maintenance_equipment?.category ?? null })))
  }

  async function loadHeatmap() {
    if (heatmapLoaded || heatmapLoading) return
    setHeatmapLoading(true)
    try {
      const data = await fetchAllRows<any>(supabase, q =>
        q.select('equipment_id, assigned_at, accepted_at, completed_at, created_at, maintenance_equipment(name, category)')
          .in('status', ['completed', 'approved']).not('completed_at', 'is', null)
      )
      setHeatRows((data as any) || [])
      // Defaults to "All Years" — defaulting to just the current year was
      // confusing when most of the history is older (this dataset's ~7,400
      // records span 5 years; the current year alone can be under a fifth
      // of the total), making the heatmap look like it wasn't using most
      // of the data even though every record was actually fetched.
      setHeatYear('all')
      setHeatmapLoaded(true)
    } catch (err: any) {
      alert('Error loading heatmap: ' + err.message)
    } finally {
      setHeatmapLoading(false)
    }
  }

  // Only admin/manager can edit or delete a historical job — same role
  // gate used everywhere else in Maintenance (Work Requests delete,
  // Schedule's manage-only controls).
  async function loadMe() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: profile }, { data: access }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'maintenance').maybeSingle(),
    ])
    setMyIdentifier(profile?.full_name || user.email || '')
    setCanManage(access?.role === 'admin' || access?.role === 'manager')
  }

  function startEditDetail(r: DoneRequest) {
    setEditData({
      requester_name: r.requester_name, location: r.location, issue_description: r.issue_description,
      assigned_to: r.assigned_to, status: r.status, completed_at: r.completed_at, approved_by: r.approved_by,
    })
    setEditingDetail(true)
  }

  async function saveEditDetail() {
    if (!detailRow) return
    setSavingDetail(true)
    try {
      const { error } = await supabase.from('maintenance_work_requests').update({
        requester_name: editData.requester_name, location: editData.location, issue_description: editData.issue_description,
        assigned_to: editData.assigned_to, status: editData.status, completed_at: editData.completed_at, approved_by: editData.approved_by,
      }).eq('id', detailRow.id)
      if (error) throw error
      setEditingDetail(false)
      setDetailRow(null)
      await Promise.all([loadPage(), loadSummary()])
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSavingDetail(false)
    }
  }

  // Deletes must be logged — same maintenance_deletion_log convention as
  // the Work Requests page's delete action.
  async function deleteDetailRow(r: DoneRequest) {
    if (!confirm(`Delete this job history record — "${r.issue_description.slice(0, 60)}"? This is logged and cannot be undone.`)) return
    setSavingDetail(true)
    try {
      const { error: logErr } = await supabase.from('maintenance_deletion_log').insert([{
        table_name: 'maintenance_work_requests', record_id: r.id, record_snapshot: r, deleted_by: myIdentifier || null,
      }])
      if (logErr) throw logErr
      const { error } = await supabase.from('maintenance_work_requests').delete().eq('id', r.id)
      if (error) throw error
      setDetailRow(null)
      await Promise.all([loadPage(), loadSummary()])
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSavingDetail(false)
    }
  }

  async function loadPage() {
    setLoading(true)
    // "Done" = the work is actually finished — completed (awaiting approval)
    // or approved (fully signed off). Excludes pending/assigned/accepted,
    // which still belong in Work Requests, not history.
    // Plain (left) join, not !inner — an inner join would silently drop
    // every row with no linked equipment (equipment_id null — common for
    // the imported multi-machine sweep entries), even when no category
    // filter is active. PostgREST still supports filtering by the embedded
    // resource's column (.eq('maintenance_equipment.category', …) below)
    // on a left join; it just doesn't need to exclude rows outright unless
    // that filter is actually in play.
    let query = supabase
      .from('maintenance_work_requests')
      .select('id, requester_name, location, issue_description, status, assigned_to, assigned_at, accepted_at, completed_at, approved_at, approved_by, resolution_photo_drive_id, maintenance_equipment(name, category)', { count: 'exact' })
      .in('status', ['completed', 'approved'])
    if (technicianFilter) query = query.ilike('assigned_to', `%${technicianFilter}%`)
    if (categoryFilter) query = query.eq('maintenance_equipment.category', categoryFilter)
    if (statusFilter) query = query.eq('status', statusFilter)
    if (fromDate) query = query.gte('completed_at', fromDate)
    if (toDate) query = query.lte('completed_at', toDate + 'T23:59:59')

    const { data, count } = await query.order('completed_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    setRequests((data as any) || [])
    setTotalCount(count || 0)
    setLoading(false)
  }

  // Full filtered set (not just the current page) for exports — same
  // filters as loadPage(), paginated via fetchAllRows() since a plain
  // .limit() above 1,000 gets silently truncated by PostgREST's Max Rows.
  async function fetchAllFiltered() {
    return fetchAllRows<any>(supabase, q => {
      let query = q
        .select('requester_name, location, issue_description, status, assigned_to, accepted_at, completed_at, approved_at, approved_by, maintenance_equipment(name, category)')
        .in('status', ['completed', 'approved'])
      if (technicianFilter) query = query.ilike('assigned_to', `%${technicianFilter}%`)
      if (categoryFilter) query = query.eq('maintenance_equipment.category', categoryFilter)
      if (statusFilter) query = query.eq('status', statusFilter)
      if (fromDate) query = query.gte('completed_at', fromDate)
      if (toDate) query = query.lte('completed_at', toDate + 'T23:59:59')
      return query
    })
  }

  function exportRow(r: any) {
    return {
      completed: r.completed_at ? new Date(r.completed_at).toLocaleString() : '',
      doneBy: r.assigned_to || '', equipment: r.maintenance_equipment?.name || '', category: r.maintenance_equipment?.category || '',
      location: r.location || '', requestedBy: r.requester_name || '', issue: r.issue_description || '',
      timeTaken: r.completed_at && r.accepted_at ? `${hoursBetween(r.accepted_at, r.completed_at)} h` : '',
      status: r.status, approvedBy: r.approved_by || '',
    }
  }

  async function exportCsv() {
    setExporting('csv')
    try {
      const rows = (await fetchAllFiltered()).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')).map(exportRow)
      const header = ['Completed', 'Done By', 'Equipment', 'Category', 'Location', 'Requested By', 'Issue', 'Time Taken', 'Status', 'Approved By']
      const lines = [header.map(h => `"${h}"`).join(',')]
      for (const r of rows) {
        lines.push([r.completed, r.doneBy, r.equipment, r.category, r.location, r.requestedBy, r.issue, r.timeTaken, r.status, r.approvedBy]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      }
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Job_History_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setExporting(null)
    }
  }

  // No PDF library — opens a print-friendly table in a new tab and
  // triggers the browser's print dialog, where "Save as PDF" is a built-in
  // destination on every major browser. Same approach as the PM Schedule
  // page's Export to PDF.
  async function exportPdf() {
    setExporting('pdf')
    try {
      const rows = (await fetchAllFiltered()).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')).map(exportRow)
      const w = window.open('', '_blank', 'width=1100,height=800')
      if (!w) { alert('Please allow pop-ups for this site to export a PDF.'); return }
      const tableRows = rows.map(r => `<tr><td>${r.completed}</td><td>${r.doneBy}</td><td>${r.equipment}</td><td>${r.category}</td><td>${r.location}</td><td>${r.requestedBy}</td><td>${r.issue}</td><td>${r.timeTaken}</td><td>${r.status}</td><td>${r.approvedBy}</td></tr>`).join('')
      w.document.write(`<!doctype html><html><head><title>Job History</title><style>
        body{font-family:Arial,sans-serif;padding:16px;color:#111;}
        h1{font-size:16px;margin:0 0 12px;}
        table{border-collapse:collapse;width:100%;font-size:9px;}
        th,td{border:1px solid #ddd;padding:3px 5px;text-align:left;}
        th{background:#f3f4f6;}
      </style></head><body><h1>Job History (${rows.length} record${rows.length === 1 ? '' : 's'})</h1>
      <table><thead><tr><th>Completed</th><th>Done By</th><th>Equipment</th><th>Category</th><th>Location</th><th>Requested By</th><th>Issue</th><th>Time Taken</th><th>Status</th><th>Approved By</th></tr></thead>
      <tbody>${tableRows}</tbody></table></body></html>`)
      w.document.close()
      w.focus()
      setTimeout(() => w.print(), 400)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setExporting(null)
    }
  }

  const technicians = [...new Set(summaryRows.flatMap(r => splitNames(r.assigned_to)))].sort()
  const categories = [...new Set(summaryRows.map(r => r.category).filter(Boolean))].sort() as string[]

  // "Done by person" summary — a job with several names in assigned_to
  // credits each of them (so totals across technicians can add up to more
  // than the job count — that's expected for shared work, not a bug).
  const perTechnician = technicians.map(t => ({
    name: t,
    approved: summaryRows.filter(r => splitNames(r.assigned_to).includes(t) && r.status === 'approved').length,
    total: summaryRows.filter(r => splitNames(r.assigned_to).includes(t)).length,
  })).sort((a, b) => b.approved - a.approved)

  // Heatmap — which equipment/category has the longest cumulative downtime
  // and/or breaks down most often, per month of a selected year, or per
  // year across all of them. Grouped client-side from heatRows (fetched
  // once, lazily, when first opened) — every fetched record is used
  // either way, "All Years" just changes what the columns represent.
  const heatYears = [...new Set(heatRows.map(r => new Date(r.completed_at!).getFullYear()))].sort((a, b) => b - a)
  const heatColumns = heatYear === 'all' ? heatYears : MONTH_LABELS.map((_, i) => i)
  const heatColLabels = heatYear === 'all' ? heatYears.map(String) : MONTH_LABELS
  const heatGroups = new Map<string, { downtime: number[]; count: number[] }>()
  for (const r of heatRows) {
    const key = heatGroupBy === 'equipment' ? (r.maintenance_equipment?.name || 'Unlinked') : (r.maintenance_equipment?.category || 'Uncategorized')
    const completed = new Date(r.completed_at!)
    const colIndex = heatYear === 'all' ? heatYears.indexOf(completed.getFullYear()) : (completed.getFullYear() === heatYear ? completed.getMonth() : -1)
    if (colIndex < 0) continue
    const hrs = repairHours(r)
    if (hrs === null) continue
    if (!heatGroups.has(key)) heatGroups.set(key, { downtime: Array(heatColumns.length).fill(0), count: Array(heatColumns.length).fill(0) })
    const g = heatGroups.get(key)!
    g.downtime[colIndex] += hrs
    g.count[colIndex] += 1
  }
  const heatRowsSorted = [...heatGroups.entries()]
    .map(([name, g]) => ({
      name, downtime: g.downtime, count: g.count,
      totalDowntime: g.downtime.reduce((s, v) => s + v, 0), totalCount: g.count.reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => heatMetric === 'downtime' ? b.totalDowntime - a.totalDowntime : b.totalCount - a.totalCount)
    .slice(0, 20)
  const heatMax = Math.max(0.0001, ...heatRowsSorted.flatMap(r => heatMetric === 'downtime' ? r.downtime : r.count))
  function heatCellStyle(v: number) {
    if (v <= 0) return { backgroundColor: '#f9fafb' }
    const t = Math.min(1, v / heatMax)
    // Interpolates white -> red as intensity rises (0 stays a near-white
    // "nothing happened" cell, 1 is the worst cell in the current view).
    const r = 254, g = Math.round(242 - t * 200), b = Math.round(242 - t * 210)
    return { backgroundColor: `rgb(${r}, ${g}, ${b})` }
  }

  const hasFilters = !!(technicianFilter || categoryFilter || statusFilter || fromDate || toDate)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  function jumpToPageInput() {
    const n = Math.min(totalPages, Math.max(1, Math.round(Number(pageInput)) || 1))
    setPageInput(String(n))
    setPage(n - 1)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><History className="w-7 h-7 text-orange-600" /> Job History</h1>
        <div className="text-sm text-gray-500">
          <span className="text-2xl font-bold text-slate-800">{summaryRows.length.toLocaleString()}</span> completed/approved jobs on record
        </div>
      </div>

      {perTechnician.length > 0 && (
        <div className="mb-6">
          <button onClick={() => setShowTechSummary(v => !v)} className="text-sm font-semibold text-gray-600 hover:text-gray-800 mb-2 flex items-center gap-1">
            {showTechSummary ? '▾' : '▸'} Per-Technician Breakdown ({perTechnician.length} people — click a name below to filter)
          </button>
          {showTechSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {perTechnician.map(t => (
                <button key={t.name} onClick={() => setTechnicianFilter(technicianFilter === t.name ? '' : t.name)}
                  className={`border rounded-xl p-3 text-left shadow-sm transition ${technicianFilter === t.name ? 'bg-orange-50 border-orange-300' : 'bg-white hover:bg-gray-50'}`}>
                  <div className="text-xs font-semibold text-gray-500 truncate">{t.name}</div>
                  <div className="text-xl font-bold text-slate-800">{t.approved}</div>
                  <div className="text-[11px] text-gray-400">approved · {t.total} total</div>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-1.5">A job shared by multiple people is credited to each of them, so these numbers can add up to more than the total above — that's expected, not a miscount.</p>
        </div>
      )}

      <div className="mb-6">
        <button onClick={() => { const next = !showHeatmap; setShowHeatmap(next); if (next) loadHeatmap() }} className="text-sm font-semibold text-gray-600 hover:text-gray-800 mb-2 flex items-center gap-1">
          {showHeatmap ? '▾' : '▸'} Downtime &amp; Breakdown Heatmap — which equipment/category is worst, by month
        </button>
        {showHeatmap && (
          <div className="bg-white border rounded-xl shadow-sm p-4">
            {heatmapLoading && <p className="text-sm text-gray-400 py-6 text-center">Loading heatmap data…</p>}
            {!heatmapLoading && heatmapLoaded && (
              <>
                <div className="flex flex-wrap items-end gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Group By</label>
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                      {(['equipment', 'category'] as const).map(g => (
                        <button key={g} onClick={() => setHeatGroupBy(g)} className={`px-3 py-1.5 rounded-md text-sm font-semibold capitalize transition ${heatGroupBy === g ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>{g}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Metric</label>
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                      <button onClick={() => setHeatMetric('downtime')} className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${heatMetric === 'downtime' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>Downtime (h)</button>
                      <button onClick={() => setHeatMetric('frequency')} className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${heatMetric === 'frequency' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>Breakdown Frequency</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                    <select value={String(heatYear ?? 'all')} onChange={e => setHeatYear(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="border rounded-md px-3 py-2 text-sm bg-white">
                      <option value="all">All Years ({heatRows.length.toLocaleString()} records)</option>
                      {heatYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <span className="text-xs text-gray-400 ml-auto">Top {heatRowsSorted.length} by total {heatMetric === 'downtime' ? 'downtime' : 'breakdown count'} · darker = worse</span>
                </div>

                {heatRowsSorted.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No breakdown data{heatYear !== 'all' ? ` for ${heatYear}` : ''}.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border-separate" style={{ borderSpacing: 2 }}>
                      <thead>
                        <tr>
                          <th className="text-left text-[11px] font-medium text-gray-500 uppercase pr-3 pb-1 sticky left-0 bg-white">{heatGroupBy === 'equipment' ? 'Equipment' : 'Category'}</th>
                          {heatColLabels.map(l => <th key={l} className="text-center text-[11px] font-medium text-gray-500 uppercase px-1 pb-1 w-12">{l}</th>)}
                          <th className="text-center text-[11px] font-medium text-gray-500 uppercase px-1 pb-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {heatRowsSorted.map(row => {
                          const series = heatMetric === 'downtime' ? row.downtime : row.count
                          const total = heatMetric === 'downtime' ? row.totalDowntime : row.totalCount
                          return (
                            <tr key={row.name}>
                              <td className="pr-3 py-0.5 font-medium whitespace-nowrap sticky left-0 bg-white">{row.name}</td>
                              {series.map((v, i) => (
                                <td key={i} style={heatCellStyle(v)} title={`${heatColLabels[i]}: ${heatMetric === 'downtime' ? `${v.toFixed(1)}h downtime` : `${v} breakdown${v === 1 ? '' : 's'}`}`}
                                  className="text-center py-1.5 rounded text-gray-600 font-medium">
                                  {v > 0 ? (heatMetric === 'downtime' ? v.toFixed(0) : v) : ''}
                                </td>
                              ))}
                              <td className="text-center py-1.5 font-bold text-slate-800">{heatMetric === 'downtime' ? `${total.toFixed(0)}h` : total}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-3">Downtime = time between a breakdown being picked up and marked complete, same definition as the Dashboard's KPIs. Frequency = number of completed/approved breakdowns that month.</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Technician (Done By)</label>
          <select value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white w-44">
            <option value="">All</option>
            {technicians.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white w-36">
            <option value="">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white w-36">
            <option value="">All</option>
            <option value="completed">Completed (awaiting approval)</option>
            <option value="approved">Approved</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
        </div>
        {hasFilters && (
          <button onClick={() => { setTechnicianFilter(''); setCategoryFilter(''); setStatusFilter(''); setFromDate(''); setToDate('') }} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2">Clear</button>
        )}
        <button onClick={() => setBigThumbs(v => !v)} className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border ${bigThumbs ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          <ImageIcon className="w-4 h-4" /> {bigThumbs ? 'Large thumbnails' : 'Small thumbnails'}
        </button>
        <button onClick={exportCsv} disabled={exporting !== null} className="text-sm bg-gray-100 disabled:opacity-50 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-200">{exporting === 'csv' ? 'Exporting...' : 'Export to Excel'}</button>
        <button onClick={exportPdf} disabled={exporting !== null} className="text-sm bg-gray-100 disabled:opacity-50 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-200">{exporting === 'pdf' ? 'Exporting...' : 'Export to PDF'}</button>
        <span className="text-xs text-gray-400 ml-auto">{totalCount === 0 ? 0 : page * PAGE_SIZE + 1}-{Math.min(totalCount, page * PAGE_SIZE + requests.length)} of {totalCount}</span>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Done By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time Taken</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evidence</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {requests.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailRow(r)}>
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{r.completed_at ? new Date(r.completed_at).toLocaleString() : '-'}</td>
                <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{r.assigned_to || '-'}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">{r.maintenance_equipment?.name || r.location || '-'}</td>
                <td className="px-4 py-3 text-sm max-w-[260px] truncate">{r.issue_description}</td>
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{r.completed_at && r.accepted_at ? `${hoursBetween(r.accepted_at, r.completed_at)} h` : '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                  {r.status === 'approved' && r.approved_by && <span className="block text-[11px] text-gray-400 mt-0.5">by {r.approved_by}</span>}
                </td>
                <td className="px-4 py-3">
                  {r.resolution_photo_drive_id ? (
                    <img src={`/api/maintenance/file/${r.resolution_photo_drive_id}`} className={`rounded object-cover cursor-zoom-in ${bigThumbs ? 'w-24 h-24' : 'w-10 h-10'}`} onClick={e => { e.stopPropagation(); setZoomSrc(`/api/maintenance/file/${r.resolution_photo_drive_id}`) }} />
                  ) : '-'}
                </td>
              </tr>
            ))}
            {!loading && requests.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{totalCount === 0 ? 'No completed jobs yet.' : 'No jobs match these filters.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
        <button onClick={() => setPage(p => Math.max(0, p - 10))} disabled={page === 0} className="text-sm bg-white border disabled:opacity-40 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-50">-10</button>
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="flex items-center gap-1 text-sm bg-white border disabled:opacity-40 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-50">
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <span className="text-sm text-gray-500 flex items-center gap-1.5">
          Page
          <input
            type="number" min={1} max={totalPages} value={pageInput}
            onChange={e => setPageInput(e.target.value)}
            onBlur={jumpToPageInput}
            onKeyDown={e => e.key === 'Enter' && (e.currentTarget.blur())}
            className="w-14 border rounded-md px-2 py-1 text-center text-sm"
          />
          of {totalPages}
        </span>
        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="flex items-center gap-1 text-sm bg-white border disabled:opacity-40 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-50">
          Next <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 10))} disabled={page >= totalPages - 1} className="text-sm bg-white border disabled:opacity-40 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-50">+10</button>
      </div>

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />

      {detailRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailRow(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingDetail ? 'Edit Job' : 'Job Detail'}</h2>
              <div className="flex items-center gap-1">
                {canManage && !editingDetail && (
                  <>
                    <button onClick={() => startEditDetail(detailRow)} className="text-gray-400 hover:text-blue-600 p-1.5" title="Edit"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => deleteDetailRow(detailRow)} disabled={savingDetail} className="text-gray-400 hover:text-red-600 p-1.5 disabled:opacity-40" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
                <button onClick={() => setDetailRow(null)} className="text-gray-400 hover:text-gray-600 p-1.5"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {editingDetail ? (
              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Issue</label>
                  <textarea value={editData.issue_description || ''} onChange={e => setEditData({ ...editData, issue_description: e.target.value })} rows={3} className="w-full border rounded-md px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Requested By</label>
                    <input value={editData.requester_name || ''} onChange={e => setEditData({ ...editData, requester_name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                    <input value={editData.location || ''} onChange={e => setEditData({ ...editData, location: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Done By</label>
                    <input value={editData.assigned_to || ''} onChange={e => setEditData({ ...editData, assigned_to: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <select value={editData.status || ''} onChange={e => setEditData({ ...editData, status: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                      <option value="completed">Completed (awaiting approval)</option>
                      <option value="approved">Approved</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Completed At</label>
                    <input type="datetime-local" value={editData.completed_at ? editData.completed_at.slice(0, 16) : ''} onChange={e => setEditData({ ...editData, completed_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Approved By</label>
                    <input value={editData.approved_by || ''} onChange={e => setEditData({ ...editData, approved_by: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setEditingDetail(false)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
                  <button onClick={saveEditDetail} disabled={savingDetail} className="bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700">{savingDetail ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            ) : (
            <div className="space-y-3 text-sm">
              <div>
                <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${detailRow.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{detailRow.status}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-400 uppercase">Issue</div>
                <div className="mt-0.5">{detailRow.issue_description}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Equipment</div>
                  <div className="mt-0.5">{detailRow.maintenance_equipment?.name || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Category</div>
                  <div className="mt-0.5">{detailRow.maintenance_equipment?.category || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Location</div>
                  <div className="mt-0.5">{detailRow.location || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Requested By</div>
                  <div className="mt-0.5">{detailRow.requester_name || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Done By</div>
                  <div className="mt-0.5">{detailRow.assigned_to || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Time Taken</div>
                  <div className="mt-0.5">{detailRow.completed_at && detailRow.accepted_at ? `${hoursBetween(detailRow.accepted_at, detailRow.completed_at)} h` : '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Assigned</div>
                  <div className="mt-0.5">{detailRow.assigned_at ? new Date(detailRow.assigned_at).toLocaleString() : '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Accepted</div>
                  <div className="mt-0.5">{detailRow.accepted_at ? new Date(detailRow.accepted_at).toLocaleString() : '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Completed</div>
                  <div className="mt-0.5">{detailRow.completed_at ? new Date(detailRow.completed_at).toLocaleString() : '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Approved</div>
                  <div className="mt-0.5">{detailRow.approved_at ? new Date(detailRow.approved_at).toLocaleString() : '-'}{detailRow.approved_by ? ` — ${detailRow.approved_by}` : ''}</div>
                </div>
              </div>
              {detailRow.resolution_photo_drive_id && (
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase mb-1">Evidence Photo</div>
                  <img src={`/api/maintenance/file/${detailRow.resolution_photo_drive_id}`} className="rounded-lg max-h-72 cursor-zoom-in" onClick={() => setZoomSrc(`/api/maintenance/file/${detailRow.resolution_photo_drive_id}`)} />
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
