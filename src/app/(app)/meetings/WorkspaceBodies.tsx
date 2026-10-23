'use client'

import { confirmDialog } from './ui/feedback'
import { useMemo, useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Plus, Trash2, StickyNote, FileText, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { addTodo, setTodoDone, setKpiValue, addPrivateNote, updatePrivateNote, deletePrivateNote, addPersonalTodo, setPersonalTodoDone, deletePersonalTodo } from './actions'
import { act } from './act'
import Avatar from './Avatar'
import { NewBadge, GoalMark, goalWord, NO_SPIN, effectiveGoal, type Kpi, type KpiCustomGoal, type KpiValue } from './[id]/shared'
import { periodsFor } from './[id]/kpiRange'
import { evaluateGoal, formatGoal, formatKpiValue, ymd, type Cadence, type IssueStatus, type Person, type TodoStatus } from '@/lib/meetings'

// Panel bodies shared by My Workspace and a meeting's Workspace tab.

export type WTodo = { id: string; title: string; details: string | null; due_date: string | null; done_at: string | null; status: TodoStatus; meeting_id: string; owner_id: string | null; created_at: string }
export type WGoal = { id: string; title: string; details: string | null; status: 'on' | 'off' | 'done'; due_date: string | null; milestones: { title: string; done: boolean }[]; meeting_id: string; owner_id: string | null; created_at: string; meeting: { name: string } | null }
export type WKpi = Omit<Kpi, 'meeting_ids'> & { meeting_id: string; meeting: { name: string } | null }
export type WPersonalTodo = { id: string; title: string; due_date: string | null; done_at: string | null; status: TodoStatus }
export type WNote = { id: string; body: string; updated_at: string }
export type WMeeting = { id: string; name: string }
export type WHeadline = { id: string; title: string; details: string | null; owner_id: string | null; created_at: string }
export type WIssue = { id: string; title: string; details: string | null; owner_id: string | null; status: IssueStatus; created_at: string; due_date?: string | null; meeting_id: string }

const input = 'border rounded-lg px-3 py-2 text-sm bg-white'
const primary = 'inline-flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700'
export const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-gray-500 text-center py-4">{children}</p>

// ------------------------------------------------------------------ to-dos

export function TodosBody({ todos, meetings, onOpen }: { todos: WTodo[]; meetings: WMeeting[]; onOpen: (t: WTodo) => void }) {
  const [showDone, setShowDone] = useState(false)
  const [form, setForm] = useState({ title: '', meeting_id: meetings[0]?.id ?? '', due_date: '' })
  const meetingName = useMemo(() => new Map(meetings.map(m => [m.id, m.name])), [meetings])
  const today = ymd(new Date())
  // Ticks and new to-dos show at once; the saved version takes over when the page refreshes.
  const [, startTransition] = useTransition()
  const [list, change] = useOptimistic(todos, (cur: WTodo[], c: { add?: WTodo; toggle?: string }) =>
    c.add ? [...cur, c.add] : cur.map(t => (t.id === c.toggle ? { ...t, done_at: t.done_at ? null : new Date().toISOString() } : t)))
  const active = list.filter(t => !t.done_at)
  const shown = showDone ? list : active

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.meeting_id) return
    const draft = { ...form }
    setForm({ ...form, title: '', due_date: '' })
    const now = new Date().toISOString()
    startTransition(async () => {
      change({ add: { id: `pending-${now}`, title: draft.title.trim(), details: null, due_date: draft.due_date || null, done_at: null, status: 'todo', meeting_id: draft.meeting_id, owner_id: null, created_at: now } })
      await act(() => addTodo(draft.meeting_id, { title: draft.title, owner_id: null, due_date: draft.due_date || null }))
    })
  }
  function toggle(t: WTodo) {
    if (t.id.startsWith('pending-')) return
    startTransition(async () => {
      change({ toggle: t.id })
      await act(() => setTodoDone(t.meeting_id, t.id, !t.done_at))
    })
  }

  return (
    <>
      <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-2 cursor-pointer w-fit">
        <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show completed
      </label>
      {shown.length === 0 ? <Empty>No to-dos. Nice and clear.</Empty> : (
        <ul className="divide-y -mx-1">
          {shown.map(t => {
            const overdue = !t.done_at && t.due_date && t.due_date < today
            return (
              <li key={t.id} className="flex items-center gap-2.5 px-1 py-1.5">
                <button
                  onClick={() => toggle(t)}
                  aria-label={t.done_at ? 'Mark not done' : 'Mark done'}
                  className={`w-7 h-7 rounded-full border-2 shrink-0 inline-flex items-center justify-center ${t.done_at ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 hover:border-blue-500'}`}
                >{t.done_at && <Check className="w-4 h-4" />}</button>
                <button onClick={() => { if (!t.id.startsWith('pending-')) onOpen(t) }} className={`flex-1 min-w-0 text-left ${t.id.startsWith('pending-') ? 'opacity-60' : ''}`} title="Open details">
                  <div className={`text-sm truncate ${t.done_at ? 'line-through text-gray-500' : ''}`}>{t.title}{t.details && <FileText className="inline-block w-3.5 h-3.5 ml-1.5 text-gray-500 align-[-2px]" />}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide truncate">{meetingName.get(t.meeting_id)}</div>
                </button>
                <NewBadge createdAt={t.created_at} />
                <span className={`text-xs whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date ?? ''}</span>
              </li>
            )
          })}
        </ul>
      )}
      {meetings.length > 0 && (
        <form onSubmit={add} className="mt-3 grid gap-1.5 grid-cols-[1fr_auto]">
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="New to-do" className={`${input} !py-1.5`} aria-label="New to-do" />
          <button className={`${primary} px-2.5`} aria-label="Add to-do"><Plus className="w-4 h-4" /></button>
          {meetings.length > 1 && (
            <select value={form.meeting_id} onChange={e => setForm({ ...form, meeting_id: e.target.value })} className={`${input} !py-1.5`} aria-label="Meeting">
              {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={`${input} !py-1.5`} aria-label="Due date" title="Defaults to 7 days from today" />
        </form>
      )}
    </>
  )
}

// -------------------------------------------------------------------- KPIs

function currentStart(cadence: Cadence) {
  const list = periodsFor(cadence, { preset: 'recent', from: '', to: '' })
  return list[list.length - 1].start
}

// Compact scorecard: this period's number plus the previous few, for every
// cadence the KPIs use. Editable in place.
export function KpisBody({ kpis, values, custom, emptyText = 'No KPIs assigned to you.' }: { kpis: WKpi[]; values: KpiValue[]; custom: KpiCustomGoal[]; emptyText?: string }) {
  const byKey = useMemo(() => new Map(values.map(v => [`${v.kpi_id}|${v.period_start}`, v.value])), [values])
  const cadences = (['daily', 'weekly', 'monthly', 'quarterly'] as Cadence[]).filter(c => kpis.some(k => k.cadence === c))
  if (kpis.length === 0) return <Empty>{emptyText}</Empty>

  return (
    <div className="space-y-4">
      {cadences.map(c => {
        const periods = periodsFor(c, { preset: 'recent', from: '', to: '' }).slice(-4)
        const now = currentStart(c)
        return (
          <div key={c}>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 capitalize">{c} KPIs</div>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500">
                    <th className="text-left font-semibold px-1 pb-1">KPI</th>
                    <th className="font-semibold px-1 pb-1">Goal</th>
                    {periods.map(p => <th key={p.start} className={`font-semibold px-0.5 pb-1 whitespace-nowrap ${p.start === now ? 'text-blue-600' : ''}`}>{p.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {kpis.filter(k => k.cadence === c).map(k => (
                    <tr key={k.id}>
                      <td className="px-1 py-1 min-w-[8rem]">
                        <div className="truncate max-w-[14rem]" title={k.name}>{k.name}</div>
                        {k.meeting?.name && <div className="text-xs text-gray-500 uppercase tracking-wide truncate max-w-[14rem]">{k.meeting.name}</div>}
                      </td>
                      <td className="px-1 py-1 text-center text-xs text-gray-600 whitespace-nowrap">{formatGoal(effectiveGoal({ ...k, meeting_ids: [] }, now, custom), k.unit_type)}</td>
                      {periods.map(p => {
                        const value = byKey.get(`${k.id}|${p.start}`)
                        const goal = effectiveGoal({ ...k, meeting_ids: [] }, p.start, custom)
                        const hit = evaluateGoal(goal, value)
                        const tone = hit === null ? 'bg-white' : hit ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'
                        const save = (next: number | null) => { if (next !== (value ?? null)) act(() => setKpiValue(k.meeting_id, k.id, p.start, next)) }
                        return (
                          <td key={`${p.start}-${value ?? ''}`} className="px-0.5 py-1 text-center">
                            <div className="relative">
                            {k.unit_type === 'yesno' ? (
                              <select defaultValue={value === null || value === undefined ? '' : String(value)} onChange={e => save(e.target.value === '' ? null : Number(e.target.value))} aria-label={`${k.name} ${p.label}${goalWord(hit)}`} className={`w-full min-w-[3.5rem] text-center border rounded pl-0.5 pr-5 py-1 text-sm ${tone}`}>
                                <option value="">—</option><option value="1">Yes</option><option value="0">No</option>
                              </select>
                            ) : (
                              <input
                                type="number" step="any" defaultValue={value ?? ''} placeholder="—" aria-label={`${k.name} ${p.label}${goalWord(hit)}`}
                                onBlur={e => { const raw = e.target.value.trim(); save(raw === '' ? null : Number(raw)) }}
                                className={`w-full min-w-[3.5rem] text-center border rounded pl-1 pr-5 py-1 text-sm ${NO_SPIN} ${tone}`}
                              />
                            )}
                            <GoalMark hit={hit} />
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <p className="text-xs text-gray-500">{formatKpiValue(null, 'number')} means no value yet. Blue heading = current period.</p>
    </div>
  )
}

// -------------------------------------------------------------- priorities

const GOAL_STYLE: Record<string, string> = { on: 'bg-green-100 text-green-700', off: 'bg-red-100 text-red-700', done: 'bg-blue-100 text-blue-700' }
const GOAL_LABEL: Record<string, string> = { on: 'On track', off: 'Off track', done: 'Done' }

export function GoalsBody({ goals, onOpen, emptyText = 'No priorities assigned to you.' }: { goals: WGoal[]; onOpen: (g: WGoal) => void; emptyText?: string }) {
  if (goals.length === 0) return <Empty>{emptyText}</Empty>
  return (
    <ul className="space-y-3">
      {goals.map(g => {
        const total = g.milestones.length
        const done = g.milestones.filter(m => m.done).length
        return (
          <li key={g.id}>
            <button onClick={() => onOpen(g)} className="flex items-center gap-2 w-full text-left" title="Open details">
              <span className="flex-1 min-w-0 text-sm font-medium truncate hover:text-blue-700">{g.title}{g.details && <FileText className="inline-block w-3.5 h-3.5 ml-1.5 text-gray-500 align-[-2px]" />}</span>
              <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${GOAL_STYLE[g.status]}`}>{GOAL_LABEL[g.status]}</span>
            </button>
            <div className="text-xs text-gray-500 uppercase tracking-wide truncate">{g.meeting?.name}{g.due_date ? ` · due ${g.due_date}` : ''}</div>
            {total > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
                <span className="text-xs text-gray-500 tabular-nums">{done}/{total}</span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function CoreValuesBody({ values }: { values: string[] }) {
  if (values.length === 0) return <Empty>No core values yet. A Meetings admin can add them in Settings.</Empty>
  return <ol className="space-y-2 list-decimal list-inside">{values.map((v, i) => <li key={i} className="text-sm text-slate-800">{v}</li>)}</ol>
}

export function PersonalTodosBody({ todos }: { todos: WPersonalTodo[] }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [showDone, setShowDone] = useState(false)
  const today = ymd(new Date())
  const [, startTransition] = useTransition()
  const [list, change] = useOptimistic(todos, (cur: WPersonalTodo[], c: { add?: WPersonalTodo; toggle?: string; remove?: string }) =>
    c.add ? [c.add, ...cur]
    : c.remove ? cur.filter(t => t.id !== c.remove)
    : cur.map(t => (t.id === c.toggle ? { ...t, done_at: t.done_at ? null : new Date().toISOString(), status: (t.done_at ? 'todo' : 'done') as TodoStatus } : t)))
  const active = list.filter(t => !t.done_at)
  const shown = showDone ? list : active

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const t = title.trim(), d = due
    setTitle(''); setDue('')
    const now = new Date().toISOString()
    startTransition(async () => {
      change({ add: { id: `pending-${now}`, title: t, due_date: d || null, done_at: null, status: 'todo' } })
      await act(() => addPersonalTodo(t, d || null))
    })
  }
  function toggle(t: WPersonalTodo, done: boolean) {
    if (t.id.startsWith('pending-')) return
    startTransition(async () => {
      change({ toggle: t.id })
      await act(() => setPersonalTodoDone(t.id, done))
    })
  }
  async function remove(t: WPersonalTodo) {
    if (t.id.startsWith('pending-') || !(await confirmDialog('Delete this to-do?'))) return
    startTransition(async () => {
      change({ remove: t.id })
      await act(() => deletePersonalTodo(t.id))
    })
  }

  return (
    <>
      <p className="text-xs text-gray-500 mb-2">Only you can see these. They are not tied to any meeting.</p>
      <form onSubmit={add} className="grid gap-2 grid-cols-[1fr_auto_auto] mb-3">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a personal to-do" className={input} aria-label="New personal to-do" />
        <input type="date" value={due} onChange={e => setDue(e.target.value)} className={input} aria-label="Due date" />
        <button className={`${primary} px-3`} aria-label="Add personal to-do"><Plus className="w-4 h-4" /></button>
      </form>
      <label className="flex items-center gap-2 text-xs text-gray-500 mb-2"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show completed ({list.length - active.length})</label>
      {shown.length === 0 ? <Empty>Nothing here. Add your first personal to-do above.</Empty> : (
        <ul className="divide-y">
          {shown.map(t => (
            <li key={t.id} className="flex items-center gap-2 py-2">
              <input type="checkbox" checked={!!t.done_at} onChange={e => toggle(t, e.target.checked)} aria-label={`Mark "${t.title}" done`} />
              <span className={`flex-1 text-sm ${t.done_at ? 'line-through text-gray-500' : ''}`}>{t.title}</span>
              {t.due_date && <span className={`text-xs whitespace-nowrap ${!t.done_at && t.due_date < today ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date}</span>}
              <button onClick={() => remove(t)} aria-label="Delete to-do" className="p-2 -m-2 text-gray-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function NotesBody({ notes }: { notes: WNote[] }) {
  const [draft, setDraft] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    const ok = await act(async () => { await addPrivateNote(draft); return true })
    if (ok) setDraft('')
  }

  return (
    <>
      <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><StickyNote className="w-3 h-3" /> Only you can see these.</p>
      <form onSubmit={add} className="grid gap-2 grid-cols-[1fr_auto] mb-3">
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="New note" className={input} aria-label="New note" />
        <button className={`${primary} px-3`} aria-label="Add note"><Plus className="w-4 h-4" /></button>
      </form>
      {notes.length === 0 ? <Empty>No notes yet.</Empty> : (
        <ul className="space-y-2">
          {notes.map(n => (
            <li key={`${n.id}-${n.updated_at}`} className="relative">
              <textarea
                defaultValue={n.body}
                rows={2}
                onBlur={e => { if (e.target.value !== n.body) act(() => updatePrivateNote(n.id, e.target.value)) }}
                className={`${input} w-full pr-8`}
                aria-label="Note"
              />
              <button onClick={async () => { if (await confirmDialog('Delete this note?')) { await (act(() => deletePrivateNote(n.id))) } }} aria-label="Delete note" className="absolute top-2 right-2 p-2 -m-2 text-gray-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// --------------------------------------------------- headlines and issues

export function HeadlinesBody({ headlines, peopleById, onOpen }: { headlines: WHeadline[]; peopleById: Map<string, Person>; onOpen: (h: WHeadline) => void }) {
  if (headlines.length === 0) return <Empty>No headlines yet.</Empty>
  return (
    <ul className="space-y-1.5">
      {[...headlines].reverse().map(h => (
        <li key={h.id}>
          <button onClick={() => onOpen(h)} className="flex items-center gap-2 w-full text-left text-sm hover:text-blue-700">
            <Avatar person={peopleById.get(h.owner_id ?? '')} size="sm" /><span className="truncate">{h.title}</span><NewBadge createdAt={h.created_at} />
          </button>
        </li>
      ))}
    </ul>
  )
}

export function IssuesBody({ issues, peopleById, onOpen }: { issues: WIssue[]; peopleById: Map<string, Person>; onOpen: (i: WIssue) => void }) {
  const open = issues.filter(i => i.status === 'short_term' || i.status === 'parking_lot')
  if (open.length === 0) return <Empty>No open issues.</Empty>
  return (
    <ul className="space-y-1.5">
      {open.map(i => (
        <li key={i.id}>
          <button onClick={() => onOpen(i)} className="flex items-center gap-2 w-full text-left text-sm hover:text-blue-700">
            <Avatar person={peopleById.get(i.owner_id ?? '')} size="sm" />
            <span className="truncate">{i.title}</span>
            {i.status === 'parking_lot' && <span className="text-xs text-gray-500">KIV</span>}
            <NewBadge createdAt={i.created_at} />
            {i.due_date && <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">{i.due_date}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- calendar

export type Schedule = { days: number[]; time: string; every: number; anchor?: string }
export type CalMeeting = { id: string; name: string; schedule: Schedule | null }
export type CalHeld = { meeting_id: string; name: string; date: string }
export type CalItem = { id: string; kind: 'todo' | 'issue'; title: string; date: string; done: boolean; meeting_id: string; meetingName?: string }

type CalEvent = {
  key: string; date: string; kind: 'meeting' | 'held' | 'todo' | 'issue'; title: string; sub?: string
  done?: boolean; overdue?: boolean; href?: string; item?: CalItem
}

const KIND_STYLE: Record<CalEvent['kind'], string> = {
  meeting: 'bg-violet-100 text-violet-800 border-violet-200',
  held: 'bg-slate-100 text-slate-600 border-slate-200',
  todo: 'bg-blue-100 text-blue-800 border-blue-200',
  issue: 'bg-amber-100 text-amber-800 border-amber-200',
}
const KIND_LABEL: Record<CalEvent['kind'], string> = { meeting: 'Meeting', held: 'Meeting held', todo: 'To-do due', issue: 'Issue due' }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function weekIndex(d: Date) {
  // Whole weeks since a fixed Monday, local time.
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return Math.round((monday.getTime() - new Date(2020, 0, 6).getTime()) / (7 * 86400000))
}

function occursOn(s: Schedule, d: Date) {
  if (!s.days.includes(d.getDay())) return false
  const every = Math.max(1, s.every || 1)
  if (every === 1) return true
  const [y, m, dd] = (s.anchor ?? '2020-01-06').split('-').map(Number)
  return (((weekIndex(d) - weekIndex(new Date(y, m - 1, dd))) % every) + every) % every === 0
}

export function CalendarBody({ meetings, held, items, onOpenItem }: {
  meetings: CalMeeting[]; held: CalHeld[]; items: CalItem[]; onOpenItem: (i: CalItem) => void
}) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [selected, setSelected] = useState(() => ymd(new Date()))
  const today = ymd(new Date())

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [cursor])

  const events = useMemo(() => {
    const by = new Map<string, CalEvent[]>()
    const push = (e: CalEvent) => by.set(e.date, [...(by.get(e.date) ?? []), e])
    const heldKey = new Set(held.map(h => `${h.meeting_id}|${h.date}`))
    const heldOnce = Array.from(new Map(held.map(h => [`${h.meeting_id}|${h.date}`, h])).values())
    for (const d of cells) {
      const date = ymd(d)
      for (const m of meetings) {
        if (!m.schedule || !occursOn(m.schedule, d)) continue
        // A scheduled slot that already happened shows once, as "held".
        if (heldKey.has(`${m.id}|${date}`)) continue
        push({ key: `m-${m.id}-${date}`, date, kind: 'meeting', title: m.name, sub: m.schedule.time || undefined, href: `/meetings/${m.id}` })
      }
    }
    for (const h of heldOnce) push({ key: `h-${h.meeting_id}-${h.date}`, date: h.date, kind: 'held', title: h.name, href: `/meetings/${h.meeting_id}?tab=MEETING_SUMMARIES` })
    for (const it of items) push({ key: `${it.kind}-${it.id}`, date: it.date, kind: it.kind, title: it.title, sub: it.meetingName, done: it.done, overdue: !it.done && it.date < today, item: it })
    return by
  }, [cells, meetings, held, items, today])

  const selectedEvents = events.get(selected) ?? []
  const month = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month" className="p-2 rounded border hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
        <div className="font-semibold text-sm w-36 text-center">{month}</div>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month" className="p-2 rounded border hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
        <button onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); setSelected(ymd(n)) }} className="ml-1 px-3 py-2 text-xs rounded border hover:bg-gray-50">Today</button>
        <div className="ml-auto hidden sm:flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
          {(['meeting', 'todo', 'issue', 'held'] as const).map(k => <span key={k} className={`px-1.5 py-0.5 rounded border ${KIND_STYLE[k]}`}>{KIND_LABEL[k]}</span>)}
        </div>
      </div>

      <div className="grid grid-cols-7 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {DOW.map(d => <div key={d} className="px-1 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        {cells.map(d => {
          const date = ymd(d)
          const evs = events.get(date) ?? []
          const inMonth = d.getMonth() === cursor.getMonth()
          return (
            <button
              key={date}
              onClick={() => setSelected(date)}
              className={`min-h-[4.5rem] text-left p-1 flex flex-col gap-0.5 ${inMonth ? 'bg-white' : 'bg-gray-50'} ${selected === date ? 'ring-2 ring-inset ring-blue-500' : 'hover:bg-blue-50/40'}`}
              aria-label={`${date}, ${evs.length} item${evs.length === 1 ? '' : 's'}`}
            >
              <span className={`text-xs w-5 h-5 inline-flex items-center justify-center rounded-full ${date === today ? 'bg-blue-600 text-white font-bold' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>{d.getDate()}</span>
              {evs.slice(0, 3).map(e => (
                <span key={e.key} className={`block truncate text-xs leading-4 px-1 rounded border ${e.overdue ? 'bg-red-100 text-red-800 border-red-200' : KIND_STYLE[e.kind]} ${e.done ? 'line-through opacity-60' : ''}`}>{e.title}</span>
              ))}
              {evs.length > 3 && <span className="text-xs text-gray-500 px-1">+{evs.length - 3} more</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> {new Date(selected + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        {selectedEvents.length === 0 ? <p className="text-sm text-gray-500">Nothing on this day.</p> : (
          <ul className="space-y-1">
            {selectedEvents.map(e => (
              <li key={e.key} className="flex items-center gap-2 text-sm">
                <span className={`shrink-0 text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${e.overdue ? 'bg-red-100 text-red-800 border-red-200' : KIND_STYLE[e.kind]}`}>{e.overdue ? 'Overdue' : KIND_LABEL[e.kind]}</span>
                {e.href ? (
                  <Link href={e.href} className="truncate hover:text-blue-700 hover:underline">{e.title}</Link>
                ) : (
                  <button onClick={() => e.item && onOpenItem(e.item)} className={`truncate text-left hover:text-blue-700 hover:underline ${e.done ? 'line-through text-gray-500' : ''}`}>{e.title}</button>
                )}
                {e.sub && <span className="text-xs text-gray-500 truncate">{e.sub}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
