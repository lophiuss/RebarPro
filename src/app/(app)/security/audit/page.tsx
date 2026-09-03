'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, AlertOctagon, Download, ChevronLeft, ChevronRight, X } from 'lucide-react'
import PhotoLightbox from '@/components/PhotoLightbox'

// Local-date arithmetic only — .toISOString() converts to UTC, which silently
// shifts the date by a day for any timezone ahead of UTC (e.g. the "forward"
// button did nothing for a UTC+8 user: local tomorrow at local midnight is
// still "today" in UTC until 16:00 UTC).
function toLocalYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoToday() { return toLocalYMD(new Date()) }
function addDays(dateStr: string, n: number) {
  const [y, m, day] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  d.setDate(d.getDate() + n)
  return toLocalYMD(d)
}

type Section = { title: string; icon?: string; rows: any[]; columns: { key: string; label: string; fmt?: (v: any, row: any) => string }[] }
type Entry = { id: number; category: string; person_name: string; company: string | null; photo_drive_id: string | null; time_in: string; time_out: string | null; purpose: string | null; looking_for: string | null; vehicle_no: string | null; notes: string | null }
type PostLog = { guard_name: string; post_name: string; time_in: string; time_out: string | null }

// One row per guard/post, one cell per hour of the day — a cell is filled if
// that guard/post had an active shift covering that hour. Mirrors the
// legacy app's Guard Movements / Post Duty timelines.
function buildTimelineRows(logs: PostLog[], groupKey: 'guard_name' | 'post_name', dateStr: string) {
  const groups = Array.from(new Set(logs.map(l => l[groupKey]))).sort()
  const dayStart = new Date(dateStr + 'T00:00:00')
  return groups.map(name => {
    const groupLogs = logs.filter(l => l[groupKey] === name)
    const cells = Array.from({ length: 24 }, (_, h) => {
      const hourStart = new Date(dayStart); hourStart.setHours(h, 0, 0, 0)
      const hourEnd = new Date(dayStart); hourEnd.setHours(h, 59, 59, 999)
      const active = groupLogs.filter(l => {
        const tin = new Date(l.time_in)
        const tout = l.time_out ? new Date(l.time_out) : new Date()
        return tin <= hourEnd && tout >= hourStart
      })
      if (active.length === 0) return null
      return groupKey === 'guard_name'
        ? active[0].post_name.split(' ').filter(w => w !== '-' && w !== '&').map(w => w[0]).join('').slice(0, 3).toUpperCase() || active[0].post_name.slice(0, 3).toUpperCase()
        : active.map(l => l.guard_name.split(' ')[0]).join(', ')
    })
    return { name, cells }
  })
}

export default function AuditPage() {
  const supabase = createClient()
  const [date, setDate] = useState(isoToday())
  const [loading, setLoading] = useState(true)
  const [anomalySections, setAnomalySections] = useState<Section[]>([])
  const [historySections, setHistorySections] = useState<Section[]>([])
  const [photoEntries, setPhotoEntries] = useState<Entry[]>([])
  const [entryDetail, setEntryDetail] = useState<Entry | null>(null)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [guardTimeline, setGuardTimeline] = useState<{ name: string; cells: (string | null)[] }[]>([])
  const [postTimeline, setPostTimeline] = useState<{ name: string; cells: (string | null)[] }[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [date])

  async function load() {
    setLoading(true)
    const dayStart = new Date(date + 'T00:00:00')
    const dayEnd = new Date(date + 'T23:59:59.999')
    const now = new Date()
    const cutoff24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

    const [
      { data: abandonedKeys }, { data: shifts }, { data: dayEntries }, { data: overstayed },
      { data: todayIncidents }, { data: todayPanics }, { data: postLogs }, { data: keyLogs },
    ] = await Promise.all([
      supabase.from('security_key_logs').select('*').eq('status', 'out').lt('time_issued', cutoff24h).order('time_issued'),
      supabase.from('security_post_logs').select('*').gte('time_in', dayStart.toISOString()).lte('time_in', dayEnd.toISOString()),
      supabase.from('security_entries').select('*').gte('time_in', dayStart.toISOString()).lte('time_in', dayEnd.toISOString()).order('time_in', { ascending: false }),
      supabase.from('security_entries').select('*').eq('status', 'in').lt('time_in', cutoff24h).order('time_in'),
      supabase.from('security_incidents').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false }),
      supabase.from('security_panic_logs').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false }),
      supabase.from('security_post_logs').select('*').gte('time_in', dayStart.toISOString()).lte('time_in', dayEnd.toISOString()).order('time_in', { ascending: false }),
      supabase.from('security_key_logs').select('*').gte('time_issued', dayStart.toISOString()).lte('time_issued', dayEnd.toISOString()).order('time_issued', { ascending: false }),
    ])

    const suspiciousShifts = (shifts || []).filter(s => {
      const end = s.time_out ? new Date(s.time_out) : now
      const hours = (end.getTime() - new Date(s.time_in).getTime()) / 3600000
      return hours < 0.5 || hours > 14
    })
    const incompleteEntries = (dayEntries || []).filter(e => !e.company || !e.purpose)

    setAnomalySections([
      { title: 'Panic Alarms', rows: todayPanics || [], columns: [{ key: 'triggered_by', label: 'Triggered By' }, { key: 'remark', label: 'Remark' }, { key: 'created_at', label: 'Time', fmt: v => new Date(v).toLocaleString() }] },
      { title: 'Incident Reports', rows: todayIncidents || [], columns: [{ key: 'type', label: 'Type' }, { key: 'severity', label: 'Severity' }, { key: 'description', label: 'Description' }, { key: 'reported_by', label: 'Reporter' }, { key: 'created_at', label: 'Time', fmt: v => new Date(v).toLocaleString() }] },
      { title: 'Overstayed Visitors / Deliveries (>24h)', rows: overstayed || [], columns: [{ key: 'category', label: 'Type' }, { key: 'person_name', label: 'Name' }, { key: 'time_in', label: 'Time In', fmt: v => new Date(v).toLocaleString() }] },
      { title: 'Overdue Keys (out >24h)', rows: abandonedKeys || [], columns: [{ key: 'key_name', label: 'Key' }, { key: 'issued_to', label: 'Issued To' }, { key: 'issued_by', label: 'Issued By' }, { key: 'time_issued', label: 'Time Out', fmt: v => new Date(v).toLocaleString() }] },
      { title: 'Suspicious Shifts (<30min or >14h)', rows: suspiciousShifts, columns: [{ key: 'guard_name', label: 'Guard' }, { key: 'post_name', label: 'Post' }, { key: 'time_in', label: 'In', fmt: v => new Date(v).toLocaleString() }, { key: 'time_out', label: 'Out', fmt: v => v ? new Date(v).toLocaleString() : 'Still active' }] },
      { title: 'Incomplete Entries (missing company/purpose)', rows: incompleteEntries, columns: [{ key: 'category', label: 'Type' }, { key: 'person_name', label: 'Name' }, { key: 'created_by', label: 'Attended By' }] },
    ])

    setPhotoEntries((dayEntries || []).filter(e => e.photo_drive_id))

    setHistorySections([
      { title: `Visitor/Delivery Entries (${(dayEntries || []).length})`, rows: dayEntries || [], columns: [{ key: 'category', label: 'Type' }, { key: 'person_name', label: 'Name' }, { key: 'company', label: 'Company' }, { key: 'time_in', label: 'In', fmt: v => new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }, { key: 'time_out', label: 'Out', fmt: v => v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-' }] },
      { title: `Guard Post Logs (${(postLogs || []).length})`, rows: postLogs || [], columns: [{ key: 'post_name', label: 'Post' }, { key: 'guard_name', label: 'Guard' }, { key: 'time_in', label: 'In', fmt: v => new Date(v).toLocaleString() }, { key: 'time_out', label: 'Out', fmt: v => v ? new Date(v).toLocaleString() : '-' }] },
      { title: `Key Logs (${(keyLogs || []).length})`, rows: keyLogs || [], columns: [{ key: 'key_name', label: 'Key' }, { key: 'issued_to', label: 'Issued To' }, { key: 'time_issued', label: 'Out', fmt: v => new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }, { key: 'time_returned', label: 'In', fmt: v => v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-' }] },
    ])

    setGuardTimeline(buildTimelineRows(postLogs || [], 'guard_name', date))
    setPostTimeline(buildTimelineRows(postLogs || [], 'post_name', date))

    setLoading(false)
  }

  function exportCSV() {
    if (!containerRef.current) return
    let csv = `Report Date,${date}\n\n`
    containerRef.current.querySelectorAll('[data-audit-card]').forEach(card => {
      const title = card.querySelector('[data-audit-title]')?.textContent?.trim() || ''
      csv += `"${title.replace(/"/g, '""')}"\n`
      const table = card.querySelector('table')
      if (table) {
        table.querySelectorAll('tr').forEach(row => {
          const cells = Array.from(row.querySelectorAll('th, td')).map(c => `"${(c.textContent || '').trim().replace(/"/g, '""')}"`)
          csv += cells.join(',') + '\n'
        })
      }
      csv += '\n'
    })
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Security_Audit_${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalFlags = anomalySections.reduce((s, sec) => s + sec.rows.length, 0)
  const isToday = date === isoToday()

  function renderTable(section: Section) {
    return (
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>{section.columns.map(c => <th key={c.key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {section.rows.map((row, i) => (
            <tr key={i}>
              {section.columns.map(c => <td key={c.key} className="px-4 py-2">{c.fmt ? c.fmt(row[c.key], row) : (row[c.key] ?? '-')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  function renderTimeline(rows: { name: string; cells: (string | null)[] }[], rowLabel: string) {
    if (rows.length === 0) return null
    return (
      <div className="overflow-x-auto border rounded-lg">
        <table className="text-xs border-collapse w-full min-w-[800px] text-center">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-3 py-2 border-r sticky left-0 bg-gray-50 min-w-[110px]">{rowLabel}</th>
              {Array.from({ length: 24 }, (_, h) => <th key={h} className="px-1 py-2 border-r font-normal">{String(h).padStart(2, '0')}:00</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} className="border-b">
                <td className="text-left px-3 py-1.5 border-r font-semibold sticky left-0 bg-white whitespace-nowrap">{r.name}</td>
                {r.cells.map((c, h) => (
                  <td key={h} className={`border-r px-0.5 py-1.5 leading-tight ${c ? 'bg-indigo-100 text-indigo-800 font-bold' : ''}`} title={c || ''}>{c || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" ref={containerRef}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><ClipboardList className="w-7 h-7 text-blue-600" /> Audit &amp; History</h1>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-200"><Download className="w-4 h-4" /> Excel/CSV</button>
          <button onClick={() => setDate(d => addDays(d, -1))} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
          <button onClick={() => setDate(d => addDays(d, 1))} disabled={isToday} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-5 mb-6" data-audit-card>
        <h2 className="text-sm font-bold text-slate-700 mb-3" data-audit-title>🚨 {isToday ? "Today's Anomalies & Incidents" : `Anomalies & Incidents for ${date}`}</h2>
        {!loading && totalFlags === 0 ? (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 text-sm font-medium">✅ No Anomalies Detected — all systems operating within acceptable parameters.</div>
        ) : (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm font-bold flex items-center gap-2">⚠️ {totalFlags} Issues Detected</div>
        )}
      </div>

      <div className="space-y-6 mb-8">
        {anomalySections.filter(s => s.rows.length > 0).map(s => (
          <div key={s.title} className="bg-white border rounded-xl shadow-sm overflow-hidden" data-audit-card>
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-700" data-audit-title>{s.title}</h2>
              <span className="text-xs text-gray-400">({s.rows.length})</span>
            </div>
            {renderTable(s)}
          </div>
        ))}
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-5" data-audit-card>
        <h2 className="text-sm font-bold text-slate-700 mb-4" data-audit-title>📖 Full History for {date}</h2>

        {photoEntries.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-bold text-blue-600 uppercase mb-2">📸 Visitor / Delivery Photos</h3>
            <div className="flex flex-wrap gap-3">
              {photoEntries.map(e => (
                <button key={e.id} onClick={() => setEntryDetail(e)} title="View check-in / check-out details" className="w-28 border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition text-left flex-shrink-0">
                  <img src={`/api/security/photo/${e.photo_drive_id}`} className="w-full h-[85px] object-cover" />
                  <div className="px-2 py-1.5">
                    <div className="text-xs font-bold text-slate-800 truncate" title={e.person_name}>{e.person_name}</div>
                    <div className="text-[10px] text-gray-500">{new Date(e.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {guardTimeline.length > 0 && (
          <div className="mb-6" data-audit-card>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2" data-audit-title>⏱️ Guard Movements Timeline</h3>
            <p className="text-[11px] text-gray-400 mb-2">Which post each guard was on, by hour.</p>
            {renderTimeline(guardTimeline, 'Guard')}
          </div>
        )}

        {postTimeline.length > 0 && (
          <div className="mb-6" data-audit-card>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2" data-audit-title>⏱️ Post Duty Timeline</h3>
            <p className="text-[11px] text-gray-400 mb-2">Who was manning each post, by hour.</p>
            {renderTimeline(postTimeline, 'Post')}
          </div>
        )}

        {historySections.map(s => s.rows.length > 0 && (
          <div key={s.title} className="mb-6 last:mb-0" data-audit-card>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2" data-audit-title>{s.title}</h3>
            <div className="overflow-x-auto border rounded-lg">{renderTable(s)}</div>
          </div>
        ))}

        {!loading && historySections.every(s => s.rows.length === 0) && photoEntries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No records found for this date.</p>
        )}
      </div>

      {entryDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{entryDetail.person_name}</h2>
              <button onClick={() => setEntryDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-4 flex-wrap mb-4">
              {entryDetail.photo_drive_id && (
                <img
                  src={`/api/security/photo/${entryDetail.photo_drive_id}`}
                  className="w-28 h-28 rounded-xl object-cover border flex-shrink-0 cursor-zoom-in"
                  onClick={() => setZoomSrc(`/api/security/photo/${entryDetail.photo_drive_id}`)}
                />
              )}
              <div className="flex-1 min-w-[160px] text-sm">
                <span className="inline-block bg-blue-50 text-blue-700 text-xs font-bold uppercase rounded-full px-2.5 py-1 mb-2">{entryDetail.category}</span>
                <div className="space-y-1">
                  <div><strong>Company:</strong> {entryDetail.company || '-'}</div>
                  <div><strong>Vehicle:</strong> {entryDetail.vehicle_no || '-'}</div>
                  <div><strong>In:</strong> {new Date(entryDetail.time_in).toLocaleString()}</div>
                  <div><strong>Out:</strong> {entryDetail.time_out ? new Date(entryDetail.time_out).toLocaleString() : '-'}</div>
                </div>
              </div>
            </div>
            {entryDetail.purpose && <div className="text-sm mb-2"><strong>Purpose:</strong> {entryDetail.purpose}</div>}
            {entryDetail.looking_for && <div className="text-sm mb-2"><strong>Looking for:</strong> {entryDetail.looking_for}</div>}
            {entryDetail.notes && <div className="text-sm bg-gray-50 border rounded-lg px-3 py-2"><strong>Notes:</strong> {entryDetail.notes}</div>}
          </div>
        </div>
      )}

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
