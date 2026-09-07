'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { History, ChevronLeft, ChevronRight } from 'lucide-react'
import PhotoLightbox from '@/components/PhotoLightbox'

type DoneRequest = {
  id: number; requester_name: string; location: string | null; issue_description: string
  status: string; assigned_to: string | null; assigned_at: string | null; accepted_at: string | null
  completed_at: string | null; approved_at: string | null; approved_by: string | null
  resolution_photo_drive_id: string | null
  maintenance_equipment: { name: string; category: string | null } | null
}

const PAGE_SIZE = 100

function hoursBetween(a: string, b: string) {
  return ((new Date(b).getTime() - new Date(a).getTime()) / 3600000).toFixed(1)
}

// assigned_to sometimes holds several names at once (e.g. imported
// historical rows like "Jumadi, Saiful" or "Aiman/Ujjal") — split on common
// separators so the per-technician summary and filter credit each person
// individually instead of treating the combined string as one technician.
function splitNames(assignedTo: string | null): string[] {
  if (!assignedTo) return []
  return assignedTo.split(/\s*(?:,|\/|&|;|\band\b)\s*/i).map(n => n.trim()).filter(Boolean)
}

export default function JobHistoryPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<DoneRequest[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

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

  useEffect(() => { loadSummary() }, [])
  useEffect(() => { setPage(0) }, [technicianFilter, categoryFilter, statusFilter, fromDate, toDate])
  useEffect(() => { loadPage() }, [page, technicianFilter, categoryFilter, statusFilter, fromDate, toDate])

  async function loadSummary() {
    const { data } = await supabase
      .from('maintenance_work_requests')
      .select('assigned_to, status, maintenance_equipment(category)')
      .in('status', ['completed', 'approved'])
      .limit(20000)
    setSummaryRows((data || []).map((r: any) => ({ assigned_to: r.assigned_to, status: r.status, category: r.maintenance_equipment?.category ?? null })))
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

  const hasFilters = !!(technicianFilter || categoryFilter || statusFilter || fromDate || toDate)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><History className="w-7 h-7 text-orange-600" /> Job History</h1>

      {perTechnician.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
              <tr key={r.id} className="hover:bg-gray-50">
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
                    <img src={`/api/maintenance/file/${r.resolution_photo_drive_id}`} className="w-10 h-10 rounded object-cover cursor-zoom-in" onClick={() => setZoomSrc(`/api/maintenance/file/${r.resolution_photo_drive_id}`)} />
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

      <div className="flex items-center justify-between mt-4">
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="flex items-center gap-1 text-sm bg-white border disabled:opacity-40 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-50">
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <span className="text-sm text-gray-500">Page {page + 1} of {totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="flex items-center gap-1 text-sm bg-white border disabled:opacity-40 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-50">
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
