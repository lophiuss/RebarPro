'use client'

import { confirmDialog } from '../ui/feedback'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, PenTool, X } from 'lucide-react'
import { createWhiteboard, deleteWhiteboard } from './actions'
import { act } from '../act'

type Board = { id: string; title: string; meeting_id: string | null; created_by: string | null; updated_at: string; created_at: string }

export default function CoachList({ boards, meetings, people, myId }: { boards: Board[]; meetings: { id: string; name: string }[]; people: Record<string, string>; myId: string }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', meeting_id: '' })
  const [busy, setBusy] = useState(false)
  const meetingName = new Map(meetings.map(m => [m.id, m.name]))

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const id = await act(() => createWhiteboard({ title: form.title, meeting_id: form.meeting_id || null }))
    setBusy(false)
    if (id) router.push(`/meetings/coach/${id}`)
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => { setForm({ title: '', meeting_id: '' }); setAdding(true) }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"><Plus className="w-4 h-4" /> New whiteboard</button>
      </div>

      {boards.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">No whiteboards yet. Create one to start drawing.</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map(b => (
            <li key={b.id} className="border rounded-xl bg-white shadow-sm hover:shadow transition p-4 flex flex-col">
              <Link href={`/meetings/coach/${b.id}`} className="flex-1">
                <div className="flex items-center gap-2 font-semibold"><PenTool className="w-4 h-4 text-blue-600 shrink-0" /><span className="truncate">{b.title}</span></div>
                <div className="text-xs text-gray-500 mt-1">{b.meeting_id ? meetingName.get(b.meeting_id) ?? 'Meeting' : 'General'}</div>
                <div className="text-xs text-gray-500 mt-0.5">Updated {new Date(b.updated_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}{b.created_by ? ` · ${people[b.created_by] ?? ''}` : ''}</div>
              </Link>
              {(b.created_by === myId) && (
                <button onClick={async () => { if (await confirmDialog(`Delete whiteboard "${b.title}"?`)) { await (act(() => deleteWhiteboard(b.id))) } }} aria-label="Delete whiteboard" className="self-end p-2 -m-2 text-gray-500 hover:text-red-600 mt-2"><Trash2 className="w-4 h-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={create} className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">New whiteboard</h2>
              <button type="button" onClick={() => setAdding(false)} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-sm font-medium">Name
                <input required autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" placeholder="e.g. Q3 coaching: sales team" />
              </label>
              <label className="block text-sm font-medium">Meeting <span className="text-gray-500 font-normal">(optional)</span>
                <select value={form.meeting_id} onChange={e => setForm({ ...form, meeting_id: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal bg-white">
                  <option value="">Not tied to a meeting</option>
                  {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button disabled={busy || !form.title.trim()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
