'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarPlus, ArrowRight } from 'lucide-react'
import { createQuarterlyAlignment } from './actions'
import { act } from '../act'
import { initials, ymd } from '@/lib/meetings'

type Report = { id: string; name: string; seat: string; subtitle: string | null }
type Todo = { id: string; owner_id: string; title: string; due_date: string | null; done_at: string | null }
type Goal = { id: string; owner_id: string; title: string; status: string; completed_at: string | null; milestones: { title: string; done: boolean; done_at?: string | null }[] }

const RANGES = ['1W', '1M', '1Q', '6M', 'YTD', '1Y'] as const
type Range = typeof RANGES[number]

const SERIES = [
  { key: 'todos', label: 'To-dos', color: '#2f7d6d' },
  { key: 'goals', label: 'Quarterly Priorities', color: '#3b6fd4' },
  { key: 'milestones', label: 'Milestones', color: '#e8a21a' },
] as const

// A steady colour per person for the big initials tile.
const TILE_COLOURS = ['#e5a800', '#f29ca3', '#ef5350', '#86b3ab', '#7aa7e0', '#a98bd6', '#7fc08a', '#e58f5a']
function tileColour(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TILE_COLOURS[h % TILE_COLOURS.length]
}

function rangeStart(range: Range, now: Date) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case '1W': d.setDate(d.getDate() - 6); break
    case '1M': d.setDate(d.getDate() - 27); break
    case '1Q': d.setDate(d.getDate() - 90); break
    case '6M': d.setMonth(d.getMonth() - 6); break
    case 'YTD': return new Date(now.getFullYear(), 0, 1)
    case '1Y': d.setFullYear(d.getFullYear() - 1); break
  }
  return d
}

// Completed-per-bucket counts (daily buckets for 1W, weekly otherwise).
function buckets(range: Range, now: Date) {
  const start = rangeStart(range, now)
  const step = range === '1W' ? 1 : 7
  const out: { start: Date; end: Date; label: string }[] = []
  for (let d = new Date(start); d <= now; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)) {
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)
    out.push({ start: new Date(d), end, label: `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}` })
  }
  return out
}

function LineChart({ labels, series }: { labels: string[]; series: { key: string; color: string; values: number[] }[] }) {
  const W = 640, H = 220, padL = 28, padR = 8, padT = 10, padB = 42
  const max = Math.max(1, ...series.flatMap(s => s.values))
  const n = Math.max(1, labels.length - 1)
  const x = (i: number) => padL + (i / n) * (W - padL - padR)
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  // De-duplicated: with a max of 1 the middle tick would equal the top one.
  const ticks = Array.from(new Set([0, Math.ceil(max / 2), max]))
  const labelEvery = Math.max(1, Math.ceil(labels.length / 12))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Completed items over time">
      {ticks.map(t => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#9ca3af">{t}</text>
        </g>
      ))}
      {labels.map((l, i) => i % labelEvery === 0 && (
        <text key={i} x={x(i)} y={H - 22} textAnchor="end" fontSize="10" fill="#9ca3af" transform={`rotate(-40 ${x(i)} ${H - 22})`}>{l}</text>
      ))}
      {series.map(s => (
        <g key={s.key}>
          <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={s.color} />)}
        </g>
      ))}
    </svg>
  )
}

function ReportCard({ report, todos, goals, qaMeetingId }: { report: Report; todos: Todo[]; goals: Goal[]; qaMeetingId?: string }) {
  const router = useRouter()
  const [range, setRange] = useState<Range>('1Q')
  const [off, setOff] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const now = useMemo(() => new Date(), [])
  const data = useMemo(() => {
    const bs = buckets(range, now)
    const inBucket = (iso: string | null | undefined, b: { start: Date; end: Date }) => {
      if (!iso) return false
      const t = new Date(iso).getTime()
      return t >= b.start.getTime() && t < b.end.getTime()
    }
    const milestoneDates = goals.flatMap(g => g.milestones.map(m => m.done_at ?? null))
    return {
      labels: bs.map(b => b.label),
      series: [
        { key: 'todos', color: SERIES[0].color, values: bs.map(b => todos.filter(t => inBucket(t.done_at, b)).length) },
        { key: 'goals', color: SERIES[1].color, values: bs.map(b => goals.filter(g => inBucket(g.completed_at, b)).length) },
        { key: 'milestones', color: SERIES[2].color, values: bs.map(b => milestoneDates.filter(d => inBucket(d, b)).length) },
      ],
    }
  }, [range, now, todos, goals])

  const openTodos = todos.filter(t => !t.done_at)
  const openGoals = goals.filter(g => g.status !== 'done')
  const openMilestones = goals.flatMap(g => g.milestones.filter(m => !m.done).map(m => ({ goal: g.title, title: m.title })))
  const today = ymd(now)

  async function create() {
    setBusy(true)
    const id = await act(() => createQuarterlyAlignment(report.id))
    setBusy(false)
    if (id) router.push(`/meetings/${id}`)
  }

  return (
    <section className="border rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-xl font-bold text-slate-900 mb-4 truncate">{report.name}</h2>

      <div className="grid gap-5 sm:grid-cols-[11rem_1fr]">
        {/* Left: who they are, and the quarterly alignment meeting. */}
        <div className="flex flex-col">
          <div className="aspect-square rounded-lg flex items-center justify-center text-5xl font-bold text-slate-900/80 select-none" style={{ background: tileColour(report.id) }} aria-hidden>
            {initials(report.name)}
          </div>
          <div className="text-center text-sm text-gray-600 mt-2 truncate" title={report.seat}>{report.subtitle ?? report.seat}</div>
          {report.subtitle && <div className="text-center text-xs text-gray-400 truncate">{report.seat}</div>}
          <div className="flex-1" />
          {qaMeetingId ? (
            <Link href={`/meetings/${qaMeetingId}`} className="mt-4 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50">
              Open quarterly alignment <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <button onClick={create} disabled={busy} className="mt-4 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50 text-center">
              <CalendarPlus className="w-4 h-4 shrink-0" /> {busy ? 'Creating…' : 'Create a quarterly alignment meeting'}
            </button>
          )}
        </div>

        {/* Right: progress chart, with the range and which lines to show. */}
        <div className="min-w-0">
          <div className="flex items-center gap-1 mb-2">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)} className={`px-2.5 py-1 text-xs font-semibold rounded-full ${range === r ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{r}</button>
            ))}
          </div>
          <LineChart labels={data.labels} series={data.series.filter(s => !off.includes(s.key))} />
          <div className="flex flex-wrap gap-2 mt-2">
            {SERIES.map((s, i) => {
              const hidden = off.includes(s.key)
              return (
                <button
                  key={s.key}
                  onClick={() => setOff(hidden ? off.filter(k => k !== s.key) : [...off, s.key])}
                  aria-pressed={!hidden}
                  title={hidden ? 'Show this line' : 'Hide this line'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border ${hidden ? 'bg-white text-gray-400 border-gray-200' : 'text-slate-800'}`}
                  style={hidden ? undefined : { background: `${s.color}22`, borderColor: `${s.color}66` }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: hidden ? '#d1d5db' : s.color }} />
                  {s.label} <b className="tabular-nums">{data.series[i].values.reduce((a, b) => a + b, 0)}</b>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mt-5 text-sm">
        <details className="border rounded-lg px-3 py-2">
          <summary className="cursor-pointer font-semibold">To-dos <span className="text-gray-400 font-normal">({openTodos.length} open)</span></summary>
          <ul className="mt-2 space-y-1">
            {openTodos.length === 0 && <li className="text-gray-400">None open</li>}
            {openTodos.slice(0, 12).map(t => (
              <li key={t.id} className="flex gap-2"><span className="flex-1 min-w-0 truncate">{t.title}</span><span className={`text-xs whitespace-nowrap ${t.due_date && t.due_date < today ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date}</span></li>
            ))}
          </ul>
        </details>
        <details className="border rounded-lg px-3 py-2">
          <summary className="cursor-pointer font-semibold">Quarterly Priorities <span className="text-gray-400 font-normal">({openGoals.length} open)</span></summary>
          <ul className="mt-2 space-y-1">
            {openGoals.length === 0 && <li className="text-gray-400">None open</li>}
            {openGoals.map(g => <li key={g.id} className="flex gap-2"><span className="flex-1 min-w-0 truncate">{g.title}</span><span className={`text-xs ${g.status === 'off' ? 'text-red-600' : 'text-green-700'}`}>{g.status === 'off' ? 'Off track' : 'On track'}</span></li>)}
          </ul>
        </details>
        <details className="border rounded-lg px-3 py-2">
          <summary className="cursor-pointer font-semibold">Milestones <span className="text-gray-400 font-normal">({openMilestones.length} open)</span></summary>
          <ul className="mt-2 space-y-1">
            {openMilestones.length === 0 && <li className="text-gray-400">None open</li>}
            {openMilestones.slice(0, 12).map((m, i) => <li key={i} className="truncate" title={m.goal}>{m.title}</li>)}
          </ul>
        </details>
      </div>
    </section>
  )
}

export default function DirectReportsView({ reports, todos, goals, qaByReport }: { reports: Report[]; todos: Todo[]; goals: Goal[]; qaByReport: Record<string, string> }) {
  if (reports.length === 0) {
    return (
      <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">
        No direct reports yet. People appear here when they sit in a seat directly under yours on the Organizational Chart.
      </div>
    )
  }
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {reports.map(r => (
        <ReportCard key={r.id} report={r} todos={todos.filter(t => t.owner_id === r.id)} goals={goals.filter(g => g.owner_id === r.id)} qaMeetingId={qaByReport[r.id]} />
      ))}
    </div>
  )
}
