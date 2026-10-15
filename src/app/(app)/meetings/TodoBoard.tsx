'use client'

import { useState } from 'react'
import { CalendarDays, FileText } from 'lucide-react'
import { setTodoStatus } from './actions'
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
}

const DONE_LIMIT = 12

// Kanban view of to-dos: drag a card between To do / In progress / Blocked /
// Done. Moving a card to Done completes the to-do; any other column re-opens it.
export default function TodoBoard({
  todos, meetingNames, peopleById, onOpen,
}: {
  todos: BoardTodo[]
  meetingNames: Map<string, string>
  peopleById: Map<string, Person>
  onOpen: (todo: BoardTodo) => void
}) {
  // Cards move instantly; the server value takes over once the page refreshes.
  const signature = todos.map(t => `${t.id}:${t.status}:${t.done_at ? 1 : 0}`).join('|')
  const [seen, setSeen] = useState(signature)
  const [moved, setMoved] = useState<Record<string, TodoStatus>>({})
  if (seen !== signature) { setSeen(signature); setMoved({}) }
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<TodoStatus | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)
  const today = ymd(new Date())

  const statusOf = (t: BoardTodo): TodoStatus => moved[t.id] ?? (t.done_at ? 'done' : t.status)

  async function drop(col: TodoStatus) {
    const id = dragId
    setDragId(null)
    setOverCol(null)
    const todo = todos.find(t => t.id === id)
    if (!todo || statusOf(todo) === col) return
    setMoved(m => ({ ...m, [todo.id]: col }))
    const ok = await act(async () => { await setTodoStatus(todo.meeting_id, todo.id, col); return true })
    if (!ok) setMoved(m => { const next = { ...m }; delete next[todo.id]; return next })
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
              <span className="text-xs font-semibold text-gray-500 tabular-nums">{total}</span>
            </header>
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
                      <span className="truncate flex-1 uppercase tracking-wide">{meetingNames.get(t.meeting_id) ?? ''}</span>
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
