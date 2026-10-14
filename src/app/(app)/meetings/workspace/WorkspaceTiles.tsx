'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Plus, Trash2, ArrowRight, StickyNote } from 'lucide-react'
import { addTodo, setTodoDone, deleteTodo, setKpiValue, addPrivateNote, updatePrivateNote, deletePrivateNote } from '../actions'
import { act } from '../act'
import { weekStart, ymd } from '@/lib/meetings'

type Todo = { id: string; title: string; due_date: string | null; done_at: string | null; meeting_id: string; meeting: { name: string } | null }
type Goal = { id: string; title: string; status: 'on' | 'off' | 'done'; due_date: string | null; milestones: { title: string; done: boolean }[]; meeting_id: string; meeting: { name: string } | null }
type Kpi = { id: string; name: string; target: number | null; unit: string | null; meeting_id: string; meeting: { name: string } | null }
type KpiValue = { kpi_id: string; period_start: string; value: number | null }
type Note = { id: string; body: string; updated_at: string }

const card = 'border rounded-xl bg-white'
const input = 'border rounded-lg px-3 py-2 text-sm bg-white'
const todayStr = () => ymd(new Date())

function Tile({ title, count, href, children }: { title: string; count?: number; href?: string; children: React.ReactNode }) {
  return (
    <section className={`${card} flex flex-col`}>
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-bold text-slate-900">{title}{count != null && <span className="ml-1.5 text-gray-400 font-normal text-sm">({count})</span>}</h2>
        {href && <Link href={href} className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>}
      </header>
      <div className="p-4 flex-1">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 text-center py-4">{children}</p>
}

function MyTodos({ todos, meetings }: { todos: Todo[]; meetings: { id: string; name: string }[] }) {
  const [showDone, setShowDone] = useState(false)
  const [form, setForm] = useState({ title: '', meeting_id: meetings[0]?.id ?? '', due_date: '' })
  const active = todos.filter(t => !t.done_at)
  const shown = (showDone ? todos : active).slice(0, 12)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.meeting_id) return
    const ok = await act(async () => {
      // owner defaults to the caller server-side (addTodo falls back to user.id)
      await addTodo(form.meeting_id, { title: form.title, owner_id: null, due_date: form.due_date || null })
      return true
    })
    if (ok) setForm({ ...form, title: '', due_date: '' })
  }

  return (
    <Tile title="To-dos" count={active.length} href="/meetings/todos">
      <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-2 cursor-pointer w-fit">
        <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show completed
      </label>
      {shown.length === 0 ? <Empty>No to-dos. Nice and clear.</Empty> : (
        <ul className="divide-y -mx-1">
          {shown.map(t => {
            const overdue = !t.done_at && t.due_date && t.due_date < todayStr()
            return (
              <li key={t.id} className="flex items-center gap-2.5 px-1 py-2">
                <button
                  onClick={() => act(() => setTodoDone(t.meeting_id, t.id, !t.done_at))}
                  aria-label={t.done_at ? 'Mark not done' : 'Mark done'}
                  className={`w-5 h-5 rounded-full border-2 shrink-0 inline-flex items-center justify-center ${t.done_at ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 hover:border-blue-500'}`}
                >
                  {t.done_at && <Check className="w-3 h-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${t.done_at ? 'line-through text-gray-400' : ''}`}>{t.title}</div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide truncate">{t.meeting?.name}</div>
                </div>
                <span className={`text-xs whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date ?? ''}</span>
                <button onClick={() => act(() => deleteTodo(t.meeting_id, t.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            )
          })}
        </ul>
      )}
      {meetings.length > 0 && (
        <form onSubmit={add} className="mt-3 grid gap-2 grid-cols-[1fr_auto]">
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="New to-do" className={input} />
          <button className="inline-flex items-center justify-center px-3 rounded-lg bg-blue-600 text-white" aria-label="Add to-do"><Plus className="w-4 h-4" /></button>
          <select value={form.meeting_id} onChange={e => setForm({ ...form, meeting_id: e.target.value })} className={input} aria-label="Meeting">
            {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={input} aria-label="Due date" title="Defaults to 7 days from today" />
        </form>
      )}
    </Tile>
  )
}

function MyKpis({ kpis, values }: { kpis: Kpi[]; values: KpiValue[] }) {
  const thisWeek = useMemo(() => weekStart(new Date()), [])
  const byKey = useMemo(() => new Map(values.map(v => [`${v.kpi_id}|${v.period_start}`, v.value])), [values])

  return (
    <Tile title="Weekly KPIs" count={kpis.length}>
      {kpis.length === 0 ? <Empty>No weekly KPIs assigned to you.</Empty> : (
        <ul className="divide-y -mx-1">
          {kpis.map(k => {
            const value = byKey.get(`${k.id}|${thisWeek}`)
            const hit = value != null && k.target != null ? value >= k.target : null
            return (
              <li key={`${k.id}-${value ?? ''}`} className="flex items-center gap-2.5 px-1 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{k.name}</div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide truncate">{k.meeting?.name}{k.target != null ? ` · target ${k.target}${k.unit ? ' ' + k.unit : ''}` : ''}</div>
                </div>
                <input
                  type="number"
                  step="any"
                  defaultValue={value ?? ''}
                  placeholder="—"
                  aria-label={`${k.name} this week`}
                  onBlur={e => {
                    const raw = e.target.value.trim()
                    const next = raw === '' ? null : Number(raw)
                    if (next === (value ?? null)) return
                    act(() => setKpiValue(k.meeting_id, k.id, thisWeek, next))
                  }}
                  className={`w-20 text-center border rounded-md px-1 py-1 text-sm ${hit === null ? 'bg-white' : hit ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'}`}
                />
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] text-gray-400 mt-2">Week starting {thisWeek}</p>
    </Tile>
  )
}

const GOAL_STYLE: Record<string, string> = { on: 'bg-green-100 text-green-700', off: 'bg-red-100 text-red-700', done: 'bg-blue-100 text-blue-700' }
const GOAL_LABEL: Record<string, string> = { on: 'On track', off: 'Off track', done: 'Done' }

function MyGoals({ goals }: { goals: Goal[] }) {
  const open = goals.filter(g => g.status !== 'done')
  return (
    <Tile title="Quarterly Priorities" count={open.length}>
      {goals.length === 0 ? <Empty>No priorities assigned to you.</Empty> : (
        <ul className="space-y-3">
          {goals.map(g => {
            const total = g.milestones.length
            const done = g.milestones.filter(m => m.done).length
            return (
              <li key={g.id}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{g.title}</span>
                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${GOAL_STYLE[g.status]}`}>{GOAL_LABEL[g.status]}</span>
                </div>
                <div className="text-[11px] text-gray-400 uppercase tracking-wide truncate">{g.meeting?.name}{g.due_date ? ` · due ${g.due_date}` : ''}</div>
                {total > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
                    <span className="text-[11px] text-gray-500 tabular-nums">{done}/{total}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Tile>
  )
}

function CoreValues({ values }: { values: string[] }) {
  return (
    <Tile title="Core Values">
      {values.length === 0 ? <Empty>No core values yet. A Meetings admin can add them in Settings.</Empty> : (
        <ol className="space-y-2 list-decimal list-inside">
          {values.map((v, i) => <li key={i} className="text-sm text-slate-800">{v}</li>)}
        </ol>
      )}
    </Tile>
  )
}

function PrivateNotes({ notes }: { notes: Note[] }) {
  const [draft, setDraft] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    const ok = await act(async () => { await addPrivateNote(draft); return true })
    if (ok) setDraft('')
  }

  return (
    <Tile title="Private Notes" count={notes.length}>
      <p className="text-[11px] text-gray-400 mb-2 flex items-center gap-1"><StickyNote className="w-3 h-3" /> Only you can see these.</p>
      <form onSubmit={add} className="grid gap-2 grid-cols-[1fr_auto] mb-3">
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="New note" className={input} />
        <button className="inline-flex items-center justify-center px-3 rounded-lg bg-blue-600 text-white" aria-label="Add note"><Plus className="w-4 h-4" /></button>
      </form>
      {notes.length === 0 ? <Empty>No notes yet.</Empty> : (
        <ul className="space-y-2">
          {notes.map(n => (
            <li key={`${n.id}-${n.updated_at}`} className="group relative">
              <textarea
                defaultValue={n.body}
                rows={2}
                onBlur={e => { if (e.target.value !== n.body) act(() => updatePrivateNote(n.id, e.target.value)) }}
                className={`${input} w-full pr-8`}
                aria-label="Note"
              />
              <button onClick={() => confirm('Delete this note?') && act(() => deletePrivateNote(n.id))} aria-label="Delete note" className="absolute top-2 right-2 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}

export default function WorkspaceTiles({
  meetings, todos, goals, kpis, kpiValues, coreValues, notes,
}: { meetings: { id: string; name: string }[]; todos: Todo[]; goals: Goal[]; kpis: Kpi[]; kpiValues: KpiValue[]; coreValues: string[]; notes: Note[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MyTodos todos={todos} meetings={meetings} />
      <MyKpis kpis={kpis} values={kpiValues} />
      <MyGoals goals={goals} />
      <CoreValues values={coreValues} />
      <PrivateNotes notes={notes} />
    </div>
  )
}
