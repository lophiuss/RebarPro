'use client'

import { useState } from 'react'
import { CalendarDays, FileText, Plus } from 'lucide-react'
import { setTodoStatus, addTodo, addPersonalTodo, setPersonalTodoStatus } from './actions'
import { act } from './act'
import Avatar from './Avatar'
import { TODO_COLUMNS, ymd, type Person, type TodoStatus } from '@/lib/meetings'

export type BoardTodo = {
  id: string
  title: string
  details: string | null
  owner_id: string | null
  due_date: string | null
  done_at: string | null
  status: TodoStatus
  meeting_id: string
  created_at: string
  // A to-do that belongs to one person, not to a meeting
  personal?: boolean
}

export const PERSONAL_ID = 'personal'

const DONE_LIMIT = 12

// Kanban view of to-dos: drag a card between To do / In progress / Blocked /
// Done. Moving a card to Done completes the to-do; any other column re-opens it.
export default function TodoBoard({
  todos, meetingNames, peopleById, onOpen, addIn,
}: {
  todos: BoardTodo[]
  meetingNames: Map<string, string>
  peopleById: Map<string, Person>
  onOpen: (todo: BoardTodo) => void
  // Meetings a new to-do can be added to. Leave out to hide the add buttons.
  addIn?: { id: string; name: string }[]
}) {
  // Cards move instantly; the server value takes over once the page refreshes.
  const signature = todos.map(t => `${t.id}:${t.status}:${t.done_at ? 1 : 0}`).join('|')
  const [seen, setSeen] = useState(signature)
  const [moved, setMoved] = useState<Record<string, TodoStatus>>({})
  if (seen !== signature) { setSeen(signature); setMoved({}) }
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<TodoStatus | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)
  const [adding, setAdding] = useState<TodoStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [draftMeeting, setDraftMeeting] = useState('')
  const [saving, setSaving] = useState(false)
  const today = ymd(new Date())

  const statusOf = (t: BoardTodo): TodoStatus => moved[t.id] ?? (t.done_at ? 'done' : t.status)

  async function drop(col: TodoStatus) {
    const id = dragId
    setDragId(null)
    setOverCol(null)
    const todo = todos.find(t => t.id === id)
    if (!todo || statusOf(todo) === col) return
    setMoved(m => ({ ...m, [todo.id]: col }))
    const ok = await act(async () => { if (todo.personal) await setPersonalTodoStatus(todo.id, col); else await setTodoStatus(todo.meeting_id, todo.id, col); return true })
    if (!ok) setMoved(m => { const next = { ...m }; delete next[todo.id]; return next })
  }

  async function create(col: TodoStatus) {
    const title = draft.trim()
    const meetingId = draftMeeting || addIn?.[0]?.id
    if (!title || !meetingId) return
    setSaving(true)
    const ok = await act(async () => { if (meetingId === PERSONAL_ID) await addPersonalTodo(title, null, col); else await addTodo(meetingId, { title, owner_id: null, due_date: null, status: col }); return true })
    setSaving(false)
    if (ok) { setDraft(''); setAdding(null) }
  }

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 h-full min-h-0">
      {TODO_COLUMNS.map(col => {
        let cards = todos.filter(t => statusOf(t) === col.key)
        if (col.key === 'done') cards = cards.sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
        else cards = cards.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
        const total = cards.length
        const hidden = col.key === 'done' && !showAllDone ? Math.max(0, total - DONE_LIMIT) : 0
        if (hidden) cards = cards.slice(0, DONE_LIMIT)
        return (
          <section
            key={col.key}
            onDragOver={e => { if (dragId) { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key) } }}
            onDragLeave={() => setOverCol(c => (c === col.key ? null : c))}
            onDrop={e => { e.preventDefault(); drop(col.key) }}
            className={`flex flex-col min-h-0 rounded-xl border bg-gray-50/70 ${overCol === col.key ? 'ring-2 ring-blue-400 bg-blue-50/40' : ''}`}
            aria-label={col.label}
          >
            <header className="flex items-center justify-between px-3 py-2 border-b">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${col.tone}`}>{col.label}</span>
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-500 tabular-nums">{total}</span>
                {addIn && addIn.length > 0 && (
                  <button type="button" onClick={() => { setAdding(adding === col.key ? null : col.key); setDraft(''); setDraftMeeting(addIn[0].id) }} aria-label={`Add a to-do to ${col.label}`} title={`Add a to-do to ${col.label}`} className="w-5 h-5 rounded-full border bg-white text-gray-500 hover:text-blue-600 hover:border-blue-400 inline-flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                )}
              </span>
            </header>
            {addIn && adding === col.key && (
              <form onSubmit={e => { e.preventDefault(); create(col.key) }} className="p-2 border-b bg-white space-y-1.5">
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setAdding(null) }}
                  placeholder="New to-do…"
                  aria-label="New to-do"
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                />
                {addIn.length > 1 && (
                  <select value={draftMeeting} onChange={e => setDraftMeeting(e.target.value)} aria-label="Meeting" className="w-full border rounded-md px-2 py-1 text-xs bg-white">
                    {addIn.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                <div className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => setAdding(null)} className="px-2 py-1 text-xs rounded-md border bg-white">Cancel</button>
                  <button disabled={saving || !draft.trim()} className="px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? 'Adding…' : 'Add'}</button>
                </div>
              </form>
            )}
            <ul className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
              {cards.length === 0 && <li className="text-xs text-gray-400 text-center py-6">Drop a card here</li>}
              {cards.map(t => {
                const overdue = !t.done_at && statusOf(t) !== 'done' && t.due_date && t.due_date < today
                return (
                  <li
                    key={t.id}
                    draggable
                    onDragStart={e => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id) }}
                    onDragEnd={() => { setDragId(null); setOverCol(null) }}
                    className={`rounded-lg border bg-white shadow-sm p-2.5 cursor-grab active:cursor-grabbing ${dragId === t.id ? 'opacity-40' : ''}`}
                  >
                    <button onClick={() => onOpen(t)} className={`block w-full text-left text-sm font-medium hover:text-blue-700 ${statusOf(t) === 'done' ? 'line-through text-gray-400' : ''}`}>
                      {t.title}
                      {t.details && <FileText className="inline-block w-3.5 h-3.5 ml-1.5 text-gray-400 align-[-2px]" aria-label="Has details" />}
                    </button>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="truncate flex-1 uppercase tracking-wide">{t.personal ? 'Personal' : (meetingNames.get(t.meeting_id) ?? '')}</span>
                      {t.due_date && (
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : ''}`}><CalendarDays className="w-3 h-3" />{t.due_date}</span>
                      )}
                      <Avatar person={peopleById.get(t.owner_id ?? '')} size="sm" />
                    </div>
                  </li>
                )
              })}
              {hidden > 0 && (
                <li><button onClick={() => setShowAllDone(true)} className="w-full text-xs font-semibold text-blue-600 hover:text-blue-800 py-1">Show {hidden} older completed</button></li>
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
