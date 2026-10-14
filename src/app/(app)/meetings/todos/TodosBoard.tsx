'use client'

import { useMemo, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { addTodo, setTodoDone, deleteTodo } from '../actions'
import { act } from '../act'
import Avatar from '../Avatar'
import { ymd, type Person } from '@/lib/meetings'

type Todo = { id: string; title: string; owner_id: string | null; due_date: string | null; done_at: string | null; meeting_id: string; created_at: string }
type Meeting = { id: string; name: string }

const card = 'border rounded-xl bg-white'
const input = 'border rounded-lg px-3 py-2 text-sm bg-white'

export default function TodosBoard({ todos, meetings, people, myId }: { todos: Todo[]; meetings: Meeting[]; people: Person[]; myId: string }) {
  const [owner, setOwner] = useState<string>(myId)           // user id | 'all'
  const [meetingId, setMeetingId] = useState<string>('all')
  const [status, setStatus] = useState<'active' | 'completed' | 'all'>('active')
  const [form, setForm] = useState({ title: '', meeting_id: meetings[0]?.id ?? '', owner_id: myId, due_date: '' })

  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const meetingsById = useMemo(() => new Map(meetings.map(m => [m.id, m.name])), [meetings])
  const today = ymd(new Date())

  const shown = todos
    .filter(t => (owner === 'all' ? true : t.owner_id === owner))
    .filter(t => (meetingId === 'all' ? true : t.meeting_id === meetingId))
    .filter(t => (status === 'all' ? true : status === 'completed' ? !!t.done_at : !t.done_at))
  const doneCount = shown.filter(t => t.done_at).length
  const pct = shown.length ? Math.round((doneCount / shown.length) * 100) : 0

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.meeting_id) return
    const ok = await act(async () => {
      await addTodo(form.meeting_id, { title: form.title, owner_id: form.owner_id, due_date: form.due_date || null })
      return true
    })
    if (ok) setForm({ ...form, title: '', due_date: '' })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <select value={owner} onChange={e => setOwner(e.target.value)} className={input} aria-label="Owner">
          <option value={myId}>My to-dos</option>
          <option value="all">Everyone</option>
          {people.filter(p => p.id !== myId).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <select value={meetingId} onChange={e => setMeetingId(e.target.value)} className={input} aria-label="Meeting">
          <option value="all">All meetings</option>
          {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="flex rounded-lg border bg-white overflow-hidden text-sm">
          {(['active', 'completed', 'all'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)} className={`px-3 py-2 capitalize ${status === s ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>{s}</button>
          ))}
        </div>
        <span className="ml-auto text-sm text-gray-500">{shown.length} to-do{shown.length === 1 ? '' : 's'}{status === 'all' ? ` · ${pct}% completed` : ''}</span>
      </div>

      {shown.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">No to-dos match these filters.</div>
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(t => {
            const overdue = !t.done_at && t.due_date && t.due_date < today
            return (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  onClick={() => act(() => setTodoDone(t.meeting_id, t.id, !t.done_at))}
                  aria-label={t.done_at ? 'Mark not done' : 'Mark done'}
                  className={`w-5 h-5 rounded-full border-2 shrink-0 inline-flex items-center justify-center ${t.done_at ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 hover:border-blue-500'}`}
                >
                  {t.done_at && <Check className="w-3 h-3" />}
                </button>
                <Avatar person={peopleById.get(t.owner_id ?? '')} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className={`truncate ${t.done_at ? 'line-through text-gray-400' : ''}`}>{t.title}</div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide truncate">{meetingsById.get(t.meeting_id)}</div>
                </div>
                <span className={`text-xs whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date ?? ''}</span>
                <button onClick={() => act(() => deleteTodo(t.meeting_id, t.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </li>
            )
          })}
        </ul>
      )}

      {meetings.length > 0 && (
        <form onSubmit={add} className={`${card} p-3 mt-4 grid gap-2 md:grid-cols-[1fr_12rem_10rem_auto_auto]`}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Add a to-do" className={input} />
          <select value={form.meeting_id} onChange={e => setForm({ ...form, meeting_id: e.target.value })} className={input} aria-label="Meeting">
            {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={form.owner_id} onChange={e => setForm({ ...form, owner_id: e.target.value })} className={input} aria-label="Owner">
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={input} aria-label="Due date" title="Defaults to 7 days from today" />
          <button className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"><Plus className="w-4 h-4" /> Add</button>
        </form>
      )}
    </div>
  )
}
