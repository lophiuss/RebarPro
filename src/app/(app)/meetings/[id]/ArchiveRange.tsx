'use client'

import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import Avatar from '../Avatar'
import { richToText } from '@/lib/richtext'
import { card, input, labelCls, Empty, Pill, Segmented } from './shared'
import { ISSUE_STATUS_LABEL, TODO_COLUMNS, ymd, type IssueStatus, type Person, type TodoStatus } from '@/lib/meetings'

type H = { id: string; title: string; details: string | null; owner_id: string | null; created_at: string; archived_at: string | null }
type T = { id: string; title: string; details: string | null; owner_id: string | null; created_at: string; due_date: string | null; done_at: string | null; archived_at: string | null; status: TodoStatus }
type I = { id: string; title: string; details: string | null; owner_id: string | null; created_at: string; status: IssueStatus; solved_at: string | null }
type K = { id: string; name: string; details: string | null; owner_id: string | null; created_at: string; archived_at: string | null; cadence: string; unit_type: string; goal_rule: string; goal_value: number | null; goal_value_max: number | null }
export type History = { headlines: H[]; todos: T[]; issues: I[]; kpis?: K[] }

type Kind = 'all' | 'headlines' | 'todos' | 'issues' | 'kpis'
type Preset = '7' | '30' | '90' | 'year' | 'all' | 'custom'

const PRESETS: { key: Preset; label: string }[] = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
]

type Row = { kind: Exclude<Kind, 'all'>; id: string; title: string; details: string | null; owner_id: string | null; created: string; status: string; tone: string; extra: string }

const csv = (v: string) => `"${v.replace(/"/g, '""')}"`

export function ArchiveTab({ history, peopleById, meetingName }: { history: History | null; peopleById: Map<string, Person>; meetingName: string }) {
  const [preset, setPreset] = useState<Preset>('30')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [query, setQuery] = useState('')

  const rows = useMemo<Row[]>(() => {
    if (!history) return []
    const out: Row[] = []
    for (const h of history.headlines) {
      out.push({ kind: 'headlines', id: h.id, title: h.title, details: h.details, owner_id: h.owner_id, created: h.created_at, status: h.archived_at ? 'Archived' : 'Active', tone: h.archived_at ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700', extra: '' })
    }
    for (const t of history.todos) {
      const col = TODO_COLUMNS.find(c => c.key === (t.done_at ? 'done' : t.status)) ?? TODO_COLUMNS[0]
      out.push({ kind: 'todos', id: t.id, title: t.title, details: t.details, owner_id: t.owner_id, created: t.created_at, status: col.label, tone: col.tone, extra: t.due_date ? `Due ${t.due_date}` : '' })
    }
    for (const i of history.issues) {
      out.push({
        kind: 'issues', id: i.id, title: i.title, details: i.details, owner_id: i.owner_id, created: i.created_at,
        status: ISSUE_STATUS_LABEL[i.status],
        tone: i.status === 'solved' ? 'bg-green-100 text-green-700' : i.status === 'sent' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700',
        extra: i.solved_at ? `Solved ${i.solved_at.slice(0, 10)}` : '',
      })
    }
    for (const k of history.kpis ?? []) {
      const goalStr = k.goal_rule === 'between' ? `${k.goal_value ?? 0} - ${k.goal_value_max ?? 0}` : `${k.goal_rule} ${k.goal_value ?? 0}`
      out.push({
        kind: 'kpis',
        id: k.id,
        title: k.name,
        details: k.details,
        owner_id: k.owner_id,
        created: k.created_at,
        status: k.archived_at ? 'Achieved / Archived' : 'Active',
        tone: k.archived_at ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800',
        extra: `${k.cadence} • Goal: ${goalStr}`,
      })
    }
    return out.sort((a, b) => b.created.localeCompare(a.created))
  }, [history])

  // Resolve the range to [start, end] dates (inclusive), or null for "all".
  const range = useMemo(() => {
    const today = new Date()
    const end = ymd(today)
    if (preset === 'all') return null
    if (preset === 'custom') return { start: from || '0000-01-01', end: to || '9999-12-31' }
    if (preset === 'year') return { start: `${today.getFullYear()}-01-01`, end }
    const d = new Date(today)
    d.setDate(d.getDate() - Number(preset))
    return { start: ymd(d), end }
  }, [preset, from, to])

  const inRange = rows.filter(r => {
    const d = ymd(new Date(r.created))
    if (range && (d < range.start || d > range.end)) return false
    if (query.trim() && !`${r.title} ${richToText(r.details)}`.toLowerCase().includes(query.trim().toLowerCase())) return false
    return true
  })
  const count = (k: Exclude<Kind, 'all'>) => inRange.filter(r => r.kind === k).length
  const shown = inRange.filter(r => kind === 'all' || r.kind === kind)
  const KIND_LABEL: Record<Exclude<Kind, 'all'>, string> = { headlines: 'Headline', todos: 'To-do', issues: 'Issue', kpis: 'KPI' }

  function exportCsv() {
    const lines = [['Type', 'Title', 'Owner', 'Created', 'Status', 'Note', 'Details'].map(csv).join(',')]
    for (const r of shown) {
      lines.push([KIND_LABEL[r.kind], r.title, peopleById.get(r.owner_id ?? '')?.full_name ?? '', r.created.slice(0, 10), r.status, r.extra, richToText(r.details)].map(csv).join(','))
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${meetingName.replace(/[^\w-]+/g, '_')}_archive_${ymd(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-bold">Archive</h2>
        <button onClick={exportCsv} disabled={shown.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"><Download className="w-4 h-4" /> Export CSV</button>
      </div>

      <div className={`${card} p-4 mb-4 space-y-3`}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className={`${labelCls} mb-1`}>Date range (by created date)</div>
            <Segmented value={preset} onChange={setPreset} options={PRESETS} />
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={input} aria-label="From date" />
              <span className="text-gray-500">→</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={input} aria-label="To date" />
            </div>
          )}
          <div className="relative ml-auto">
            <Search className="w-4 h-4 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search text" aria-label="Search" className={`${input} pl-8 w-56`} />
          </div>
        </div>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { key: 'all', label: `All (${inRange.length})` },
            { key: 'headlines', label: `Headlines (${count('headlines')})` },
            { key: 'todos', label: `To-dos (${count('todos')})` },
            { key: 'issues', label: `Issues (${count('issues')})` },
            { key: 'kpis', label: `KPIs (${count('kpis')})` },
          ]}
        />
      </div>

      {!history ? null : shown.length === 0 ? (
        <Empty title="Nothing in this range" hint="Try a wider date range or clear the search." />
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-xs uppercase tracking-wide text-gray-500">
                <th className="text-left px-3 py-2.5 font-semibold">Type</th>
                <th className="text-left px-3 py-2.5 font-semibold">Item</th>
                <th className="text-left px-3 py-2.5 font-semibold">Owner</th>
                <th className="text-left px-3 py-2.5 font-semibold">Created</th>
                <th className="text-left px-3 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map(r => {
                const detail = richToText(r.details)
                return (
                  <tr key={`${r.kind}-${r.id}`} className="align-top">
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{KIND_LABEL[r.kind]}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.title}</div>
                      {detail && <div className="text-xs text-gray-500 line-clamp-2 max-w-xl">{detail}</div>}
                    </td>
                    <td className="px-3 py-2.5"><span className="inline-flex items-center gap-2"><Avatar person={peopleById.get(r.owner_id ?? '')} size="sm" />{peopleById.get(r.owner_id ?? '')?.full_name ?? '—'}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{r.created.slice(0, 10)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><Pill tone={r.tone}>{r.status}</Pill>{r.extra && <span className="ml-2 text-xs text-gray-500">{r.extra}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
