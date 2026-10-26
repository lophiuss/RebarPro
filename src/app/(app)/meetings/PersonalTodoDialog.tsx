'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { updatePersonalTodo, deletePersonalTodo } from './actions'
import { act } from './act'
import { confirmDialog } from './ui/feedback'
import { TODO_COLUMNS, type TodoStatus } from '@/lib/meetings'

export type EditablePersonalTodo = { id: string; title: string; due_date: string | null; done_at: string | null; status: TodoStatus }

// Edit a personal to-do (only you can see it): title, due date and status, or delete it.
export default function PersonalTodoDialog({ todo, onClose }: { todo: EditablePersonalTodo; onClose: () => void }) {
  const [title, setTitle] = useState(todo.title)
  const [due, setDue] = useState(todo.due_date ?? '')
  const [status, setStatus] = useState<TodoStatus>(todo.done_at ? 'done' : todo.status)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    const ok = await act(async () => { await updatePersonalTodo(todo.id, { title, due_date: due || null, status }); return true })
    setBusy(false)
    if (ok) onClose()
  }
  async function remove() {
    if (busy || !(await confirmDialog('Delete this to-do?'))) return
    setBusy(true)
    const ok = await act(async () => { await deletePersonalTodo(todo.id); return true })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose() }} className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" role="dialog" aria-label="Edit personal to-do">
        <h2 className="text-base font-bold">Edit personal to-do</h2>
        <p className="text-xs text-gray-500 -mt-2">Only you can see this. It is not tied to any meeting.</p>
        <label className="block text-xs font-medium text-gray-600">Title
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={300} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-gray-600">Due date
            <input type="date" value={due} onChange={e => setDue(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
          </label>
          <label className="block text-xs font-medium text-gray-600">Status
            <select value={status} onChange={e => setStatus(e.target.value as TodoStatus)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white font-normal">
              {TODO_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border bg-white">Cancel</button>
            <button disabled={busy || !title.trim()} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">Save</button>
          </div>
        </div>
      </form>
    </div>
  )
}
