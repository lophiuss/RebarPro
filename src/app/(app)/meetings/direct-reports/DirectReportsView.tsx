'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarPlus,
  ArrowRight,
  ListTodo,
  Target,
  Flag,
  Clock,
  AlertCircle,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Columns,
  Layers,
} from 'lucide-react'
import { createQuarterlyAlignment } from './actions'
import { act } from '../act'
import { initials, ymd } from '@/lib/meetings'

type Report = { id: string; name: string; seat: string; subtitle: string | null }
type Todo = { id: string; owner_id: string; title: string; due_date: string | null; done_at: string | null }
type Goal = {
  id: string
  owner_id: string
  title: string
  status: string
  due_date?: string | null
  completed_at: string | null
  milestones: { title: string; done: boolean; done_at?: string | null }[]
}

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
  const [activeTab, setActiveTab] = useState<'todos' | 'goals' | 'milestones'>('todos')
  const [layoutMode, setLayoutMode] = useState<'tabs' | 'columns'>('tabs')
  const [statusFilter, setStatusFilter] = useState<'open' | 'done' | 'all'>('open')
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({})

  function toggleGoalExpand(id: string) {
    setExpandedGoals(prev => ({ ...prev, [id]: !prev[id] }))
  }

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

  const today = ymd(now)

  // Open and Completed collections
  const openTodos = useMemo(() => todos.filter(t => !t.done_at), [todos])
  const doneTodos = useMemo(() => {
    return todos.filter(t => !!t.done_at).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
  }, [todos])
  const overdueTodosCount = useMemo(() => openTodos.filter(t => t.due_date && t.due_date < today).length, [openTodos, today])

  const openGoals = useMemo(() => goals.filter(g => g.status !== 'done' && !g.completed_at), [goals])
  const doneGoals = useMemo(() => {
    return goals.filter(g => g.status === 'done' || !!g.completed_at).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  }, [goals])
  const offTrackGoalsCount = useMemo(() => openGoals.filter(g => g.status === 'off').length, [openGoals])

  const openMilestones = useMemo(() => {
    return goals.flatMap(g => (g.milestones || []).filter(m => !m.done).map(m => ({ goal: g.title, title: m.title, done: false, done_at: m.done_at })))
  }, [goals])
  const doneMilestones = useMemo(() => {
    return goals.flatMap(g => (g.milestones || []).filter(m => m.done).map(m => ({ goal: g.title, title: m.title, done: true, done_at: m.done_at }))).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
  }, [goals])

  const displayedTodos = useMemo(() => {
    if (statusFilter === 'open') return openTodos
    if (statusFilter === 'done') return doneTodos
    return [...openTodos, ...doneTodos]
  }, [statusFilter, openTodos, doneTodos])

  const displayedGoals = useMemo(() => {
    if (statusFilter === 'open') return openGoals
    if (statusFilter === 'done') return doneGoals
    return [...openGoals, ...doneGoals]
  }, [statusFilter, openGoals, doneGoals])

  const displayedMilestones = useMemo(() => {
    if (statusFilter === 'open') return openMilestones
    if (statusFilter === 'done') return doneMilestones
    return [...openMilestones, ...doneMilestones]
  }, [statusFilter, openMilestones, doneMilestones])

  const currentCounts = useMemo(() => {
    if (activeTab === 'todos') {
      return { open: openTodos.length, done: doneTodos.length, all: todos.length }
    } else if (activeTab === 'goals') {
      return { open: openGoals.length, done: doneGoals.length, all: goals.length }
    } else {
      return { open: openMilestones.length, done: doneMilestones.length, all: openMilestones.length + doneMilestones.length }
    }
  }, [activeTab, openTodos, doneTodos, todos, openGoals, doneGoals, goals, openMilestones, doneMilestones])

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
          {report.subtitle && <div className="text-center text-xs text-gray-500 truncate">{report.seat}</div>}
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
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border ${hidden ? 'bg-white text-gray-500 border-gray-200' : 'text-slate-800'}`}
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

      {/* Items Section: To-dos, Quarterly Priorities, Milestones */}
      <div className="mt-6 pt-5 border-t border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {/* Tab Switchers */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg text-xs font-semibold gap-1">
            <button
              type="button"
              onClick={() => { setActiveTab('todos'); setLayoutMode('tabs') }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                layoutMode === 'tabs' && activeTab === 'todos'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListTodo className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>To-dos</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                statusFilter === 'done'
                  ? 'bg-emerald-100 text-emerald-800'
                  : overdueTodosCount > 0
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-200/80 text-slate-700'
              }`}>
                {statusFilter === 'open' ? openTodos.length : statusFilter === 'done' ? doneTodos.length : todos.length}
              </span>
              {overdueTodosCount > 0 && statusFilter !== 'done' && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title={`${overdueTodosCount} overdue`} />
              )}
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('goals'); setLayoutMode('tabs') }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                layoutMode === 'tabs' && activeTab === 'goals'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Target className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Quarter Priorities</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                statusFilter === 'done'
                  ? 'bg-emerald-100 text-emerald-800'
                  : offTrackGoalsCount > 0
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-200/80 text-slate-700'
              }`}>
                {statusFilter === 'open' ? openGoals.length : statusFilter === 'done' ? doneGoals.length : goals.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('milestones'); setLayoutMode('tabs') }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                layoutMode === 'tabs' && activeTab === 'milestones'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Milestones</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                statusFilter === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200/80 text-slate-700'
              }`}>
                {statusFilter === 'open' ? openMilestones.length : statusFilter === 'done' ? doneMilestones.length : openMilestones.length + doneMilestones.length}
              </span>
            </button>
          </div>

          {/* Right Toolbar: Status Filter (Open / Completed / All) + Layout Toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter */}
            <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setStatusFilter('open')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  statusFilter === 'open'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Open ({currentCounts.open})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('done')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                  statusFilter === 'done'
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Completed ({currentCounts.done})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({currentCounts.all})
              </button>
            </div>

            {/* Layout Mode Toggle: Tabs vs 3 Columns */}
            <button
              type="button"
              onClick={() => setLayoutMode(layoutMode === 'tabs' ? 'columns' : 'tabs')}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                layoutMode === 'columns'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title={layoutMode === 'tabs' ? 'Switch to side-by-side 3 columns view' : 'Switch to full tabbed view'}
            >
              {layoutMode === 'tabs' ? (
                <>
                  <Columns className="w-3.5 h-3.5" />
                  <span>3 Columns</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5" />
                  <span>Tab View</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tabbed View: Generous spacing, full-width readability */}
        {layoutMode === 'tabs' ? (
          <div>
            {/* Tab: To-dos */}
            {activeTab === 'todos' && (
              displayedTodos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-7 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                  <CheckCircle2 className="w-7 h-7 text-slate-300 mb-1.5 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-700">
                    {statusFilter === 'done'
                      ? 'No completed to-dos yet'
                      : statusFilter === 'open'
                      ? 'No open to-dos'
                      : 'No to-dos recorded'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {statusFilter === 'done'
                      ? 'Tasks marked completed will appear here.'
                      : statusFilter === 'open'
                      ? 'All action items are caught up or none assigned.'
                      : 'No tasks found for this direct report.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {displayedTodos.map(t => {
                    const isDone = !!t.done_at
                    const isOverdue = !isDone && t.due_date && t.due_date < today
                    const isToday = !isDone && t.due_date && t.due_date === today
                    return (
                      <div
                        key={t.id}
                        className={`flex items-start justify-between gap-3 p-3 rounded-lg border transition-all ${
                          isDone
                            ? 'bg-emerald-50/20 border-emerald-100 hover:border-emerald-200'
                            : isOverdue
                            ? 'bg-rose-50/40 border-rose-200/90'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0 stroke-[2]" />
                          )}
                          <p className={`text-sm font-medium break-words leading-relaxed ${
                            isDone ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-800'
                          }`}>
                            {t.title}
                          </p>
                        </div>
                        <div className="shrink-0 pt-0.5 flex items-center gap-1.5 flex-wrap justify-end">
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100/70 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Done {t.done_at!.slice(0, 10)}</span>
                            </span>
                          ) : t.due_date ? (
                            isOverdue ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>Overdue: {t.due_date}</span>
                              </span>
                            ) : isToday ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>Due Today</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                <Clock className="w-3 h-3 shrink-0 text-slate-400" />
                                <span>{t.due_date}</span>
                              </span>
                            )
                          ) : null}
                          {isDone && t.due_date && (
                            <span className="text-[11px] text-slate-400 hidden sm:inline">
                              (due {t.due_date})
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {/* Tab: Quarter Priorities */}
            {activeTab === 'goals' && (
              displayedGoals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-7 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                  <Target className="w-7 h-7 text-slate-300 mb-1.5 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-700">
                    {statusFilter === 'done'
                      ? 'No completed priorities yet'
                      : statusFilter === 'open'
                      ? 'No open quarterly priorities'
                      : 'No quarterly priorities recorded'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {statusFilter === 'done'
                      ? 'Priorities marked completed will appear here.'
                      : 'No active priorities for this quarter.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {displayedGoals.map(g => {
                    const isDone = g.status === 'done' || !!g.completed_at
                    const msList = g.milestones || []
                    const totalMs = msList.length
                    const doneMs = msList.filter(m => m.done).length
                    const pct = totalMs > 0 ? Math.round((doneMs / totalMs) * 100) : (isDone ? 100 : 0)
                    const isExpanded = expandedGoals[g.id] ?? false
                    const isOffTrack = !isDone && g.status === 'off'

                    return (
                      <div
                        key={g.id}
                        className={`p-3.5 rounded-lg border transition-colors ${
                          isDone
                            ? 'bg-emerald-50/20 border-emerald-100 hover:border-emerald-200'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                            ) : (
                              <Target className={`w-4 h-4 mt-0.5 shrink-0 ${isOffTrack ? 'text-rose-500' : 'text-blue-600'}`} />
                            )}
                            <div className="min-w-0 flex-1">
                              <h4 className={`text-sm font-semibold break-words leading-relaxed ${
                                isDone ? 'text-slate-700 line-through decoration-slate-300' : 'text-slate-900'
                              }`}>
                                {g.title}
                              </h4>
                              {g.due_date && (
                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-medium">
                                  <Clock className="w-3 h-3 text-slate-400" /> Target date: {g.due_date}
                                </p>
                              )}
                            </div>
                          </div>
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Completed{g.completed_at ? ` on ${g.completed_at.slice(0, 10)}` : ''}</span>
                            </span>
                          ) : (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                              isOffTrack ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {isOffTrack ? 'Off track' : 'On track'}
                            </span>
                          )}
                        </div>

                        {totalMs > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100">
                            <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5 font-medium">
                              <span>Milestones: <b className="text-slate-900">{doneMs}/{totalMs}</b> completed ({pct}%)</span>
                              <button
                                type="button"
                                onClick={() => toggleGoalExpand(g.id)}
                                className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 text-xs font-semibold"
                              >
                                {isExpanded ? (
                                  <>Hide checklist <ChevronDown className="w-3.5 h-3.5" /></>
                                ) : (
                                  <>View checklist <ChevronRight className="w-3.5 h-3.5" /></>
                                )}
                              </button>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isDone ? 'bg-emerald-500' : isOffTrack ? 'bg-rose-500' : 'bg-blue-600'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>

                            {isExpanded && (
                              <ul className="mt-2.5 space-y-1.5 pl-2.5 border-l-2 border-slate-200">
                                {msList.map((m, idx) => (
                                  <li key={idx} className="flex items-start gap-2 text-xs">
                                    {m.done ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                                    ) : (
                                      <Circle className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                                    )}
                                    <span className={`break-words ${m.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                                      {m.title}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {/* Tab: Milestones */}
            {activeTab === 'milestones' && (
              displayedMilestones.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-7 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                  <Flag className="w-7 h-7 text-slate-300 mb-1.5 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-700">
                    {statusFilter === 'done'
                      ? 'No completed milestones yet'
                      : statusFilter === 'open'
                      ? 'No open milestones'
                      : 'No milestones recorded'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {statusFilter === 'done'
                      ? 'Milestones marked completed will appear here.'
                      : 'All priority milestones are achieved.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {displayedMilestones.map((m, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border transition-colors flex items-start gap-2.5 ${
                        m.done
                          ? 'bg-emerald-50/20 border-emerald-100 hover:border-emerald-200'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {m.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      ) : (
                        <Flag className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium break-words leading-relaxed ${
                          m.done ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-800'
                        }`}>
                          {m.title}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            <Target className="w-3 h-3 text-blue-500 shrink-0" />
                            <span className="truncate max-w-[280px]">Priority: {m.goal}</span>
                          </span>
                          {m.done && m.done_at && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Done {m.done_at.slice(0, 10)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        ) : (
          /* 3-Columns View with non-truncated word-wrapping cards and full open/completed support */
          <div className="grid sm:grid-cols-3 gap-3">
            {/* Column 1: To-dos */}
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 flex flex-col min-h-[220px]">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 text-xs font-semibold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <ListTodo className="w-3.5 h-3.5 text-emerald-600" />
                  To-dos
                </span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  statusFilter === 'done'
                    ? 'bg-emerald-100 text-emerald-800'
                    : overdueTodosCount > 0
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {displayedTodos.length}
                </span>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5 flex-1 text-xs">
                {displayedTodos.length === 0 ? (
                  <p className="text-slate-400 italic text-center py-4">
                    {statusFilter === 'done' ? 'No completed' : 'None open'}
                  </p>
                ) : (
                  displayedTodos.map(t => {
                    const isDone = !!t.done_at
                    const isOverdue = !isDone && t.due_date && t.due_date < today
                    return (
                      <div
                        key={t.id}
                        className={`p-2 rounded border shadow-2xs ${
                          isDone ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-200'
                        }`}
                      >
                        <p className={`font-medium break-words leading-snug ${
                          isDone ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-800'
                        }`}>
                          {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-600 inline mr-1 -mt-0.5" />}
                          {t.title}
                        </p>
                        {isDone ? (
                          <div className="mt-1">
                            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-800">
                              Done {t.done_at!.slice(0, 10)}
                            </span>
                          </div>
                        ) : t.due_date ? (
                          <div className="mt-1">
                            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {isOverdue ? `⚠️ ${t.due_date}` : t.due_date}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Column 2: Quarter Priorities */}
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 flex flex-col min-h-[220px]">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 text-xs font-semibold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-blue-600" />
                  Quarter Priorities
                </span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  statusFilter === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                }`}>
                  {displayedGoals.length}
                </span>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5 flex-1 text-xs">
                {displayedGoals.length === 0 ? (
                  <p className="text-slate-400 italic text-center py-4">
                    {statusFilter === 'done' ? 'No completed' : 'None open'}
                  </p>
                ) : (
                  displayedGoals.map(g => {
                    const isDone = g.status === 'done' || !!g.completed_at
                    const isOffTrack = !isDone && g.status === 'off'
                    const totalMs = g.milestones?.length || 0
                    const doneMs = g.milestones?.filter(m => m.done).length || 0
                    return (
                      <div
                        key={g.id}
                        className={`p-2 rounded border shadow-2xs ${
                          isDone ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-200'
                        }`}
                      >
                        <p className={`font-semibold break-words leading-snug ${
                          isDone ? 'text-slate-700 line-through decoration-slate-300' : 'text-slate-900'
                        }`}>
                          {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-600 inline mr-1 -mt-0.5" />}
                          {g.title}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-1 flex-wrap">
                          {isDone ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Completed ✓
                            </span>
                          ) : (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              isOffTrack ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isOffTrack ? 'Off track' : 'On track'}
                            </span>
                          )}
                          {totalMs > 0 && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              {doneMs}/{totalMs} ms
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Column 3: Milestones */}
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 flex flex-col min-h-[220px]">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 text-xs font-semibold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <Flag className="w-3.5 h-3.5 text-amber-500" />
                  Milestones
                </span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  statusFilter === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                }`}>
                  {displayedMilestones.length}
                </span>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5 flex-1 text-xs">
                {displayedMilestones.length === 0 ? (
                  <p className="text-slate-400 italic text-center py-4">
                    {statusFilter === 'done' ? 'No completed' : 'None open'}
                  </p>
                ) : (
                  displayedMilestones.map((m, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded border shadow-2xs ${
                        m.done ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-200'
                      }`}
                    >
                      <p className={`font-medium break-words leading-snug ${
                        m.done ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-800'
                      }`}>
                        {m.done && <CheckCircle2 className="w-3 h-3 text-emerald-600 inline mr-1 -mt-0.5" />}
                        {m.title}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1 truncate" title={m.goal}>
                        🎯 {m.goal}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
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
