'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, AlertOctagon } from 'lucide-react'

function isoToday() { return new Date().toISOString().split('T')[0] }

type Section = { title: string; rows: any[]; columns: { key: string; label: string; fmt?: (v: any, row: any) => string }[] }

export default function AuditPage() {
  const supabase = createClient()
  const [date, setDate] = useState(isoToday())
  const [loading, setLoading] = useState(true)
  const [sections, setSections] = useState<Section[]>([])

  useEffect(() => { load() }, [date])

  async function load() {
    setLoading(true)
    const dayStart = new Date(date + 'T00:00:00')
    const dayEnd = new Date(date + 'T23:59:59.999')
    const now = new Date()
    const cutoff24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

    const [{ data: abandonedKeys }, { data: shifts }, { data: dayEntries }, { data: overstayed }, { data: incidents }, { data: panics }] = await Promise.all([
      supabase.from('security_key_logs').select('*').eq('status', 'out').lt('time_issued', cutoff24h).order('time_issued'),
      supabase.from('security_post_logs').select('*').gte('time_in', dayStart.toISOString()).lte('time_in', dayEnd.toISOString()),
      supabase.from('security_entries').select('*').gte('time_in', dayStart.toISOString()).lte('time_in', dayEnd.toISOString()),
      supabase.from('security_entries').select('*').eq('status', 'in').lt('time_in', cutoff24h).order('time_in'),
      supabase.from('security_incidents').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false }),
      supabase.from('security_panic_logs').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false }),
    ])

    // Shifts under 30 minutes (likely accidental double-tap) or over 14 hours (forgot to clock out).
    const suspiciousShifts = (shifts || []).filter(s => {
      const end = s.time_out ? new Date(s.time_out) : now
      const hours = (end.getTime() - new Date(s.time_in).getTime()) / 3600000
      return hours < 0.5 || hours > 14
    })

    const incompleteEntries = (dayEntries || []).filter(e => !e.company || !e.purpose)

    setSections([
      {
        title: 'Abandoned Keys (out > 24h)', rows: abandonedKeys || [],
        columns: [
          { key: 'key_name', label: 'Key' }, { key: 'issued_to', label: 'Issued To' },
          { key: 'time_issued', label: 'Issued', fmt: v => new Date(v).toLocaleString() },
        ],
      },
      {
        title: 'Suspicious Shifts (<30min or >14h)', rows: suspiciousShifts,
        columns: [
          { key: 'post_name', label: 'Post' }, { key: 'guard_name', label: 'Guard' },
          { key: 'time_in', label: 'In', fmt: v => new Date(v).toLocaleString() },
          { key: 'time_out', label: 'Out', fmt: v => v ? new Date(v).toLocaleString() : 'Still active' },
        ],
      },
      {
        title: 'Incomplete Entries (missing company/purpose)', rows: incompleteEntries,
        columns: [
          { key: 'person_name', label: 'Name' }, { key: 'category', label: 'Category' },
          { key: 'time_in', label: 'Time', fmt: v => new Date(v).toLocaleString() },
        ],
      },
      {
        title: 'Overstayed (checked in > 24h ago)', rows: overstayed || [],
        columns: [
          { key: 'person_name', label: 'Name' }, { key: 'category', label: 'Category' },
          { key: 'time_in', label: 'Checked In', fmt: v => new Date(v).toLocaleString() },
        ],
      },
      {
        title: "Today's Incidents", rows: incidents || [],
        columns: [
          { key: 'type', label: 'Type' }, { key: 'severity', label: 'Severity' },
          { key: 'reported_by', label: 'Reported By' }, { key: 'created_at', label: 'Time', fmt: v => new Date(v).toLocaleString() },
        ],
      },
      {
        title: "Today's Panic Alerts", rows: panics || [],
        columns: [
          { key: 'triggered_by', label: 'Triggered By' }, { key: 'remark', label: 'Remark' },
          { key: 'created_at', label: 'Time', fmt: v => new Date(v).toLocaleString() },
        ],
      },
    ])
    setLoading(false)
  }

  const totalFlags = sections.reduce((s, sec) => s + sec.rows.length, 0)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><ClipboardList className="w-7 h-7 text-blue-600" /> Audit</h1>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
      </div>

      {!loading && totalFlags === 0 && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 mb-6 text-sm font-medium">
          Nothing flagged for this date.
        </div>
      )}

      <div className="space-y-6">
        {sections.filter(s => s.rows.length > 0).map(s => (
          <div key={s.title} className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-700">{s.title}</h2>
              <span className="text-xs text-gray-400">({s.rows.length})</span>
            </div>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>{s.columns.map(c => <th key={c.key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {s.rows.map((row, i) => (
                  <tr key={i}>
                    {s.columns.map(c => <td key={c.key} className="px-4 py-2">{c.fmt ? c.fmt(row[c.key], row) : (row[c.key] ?? '-')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
