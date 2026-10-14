'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Plus, Trash2, FileText } from 'lucide-react'
import { addDocument, deleteDocument } from './actions'
import { act } from '../act'

type Doc = { id: string; title: string; description: string | null; url: string | null; category: string | null; meeting_id: string | null; created_by: string | null; created_at: string }

const input = 'border rounded-lg px-3 py-2 text-sm bg-white'

export default function DocumentsView({ docs, meetings, people, myId, isManager }: {
  docs: Doc[]; meetings: { id: string; name: string }[]; people: Record<string, string>; myId: string; isManager: boolean
}) {
  const [category, setCategory] = useState('all')
  const [form, setForm] = useState({ title: '', url: '', category: '', description: '', meeting_id: '' })
  const [busy, setBusy] = useState(false)

  const categories = useMemo(() => Array.from(new Set(docs.map(d => d.category).filter((c): c is string => !!c))).sort(), [docs])
  const meetingName = useMemo(() => new Map(meetings.map(m => [m.id, m.name])), [meetings])
  const shown = docs.filter(d => category === 'all' || d.category === category)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const ok = await act(async () => { await addDocument({ ...form, meeting_id: form.meeting_id || null }); return true })
    setBusy(false)
    if (ok) setForm({ title: '', url: '', category: form.category, description: '', meeting_id: '' })
  }

  return (
    <div>
      <form onSubmit={add} className="border rounded-xl bg-white p-4 mb-6 grid gap-2 md:grid-cols-2">
        <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Title" className={input} />
        <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="Link (https://…)" className={input} />
        <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Category (optional)" list="doc-categories" className={input} />
        <datalist id="doc-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
        <select value={form.meeting_id} onChange={e => setForm({ ...form, meeting_id: e.target.value })} className={input} aria-label="Meeting">
          <option value="">Not tied to a meeting</option>
          {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" className={`${input} md:col-span-2`} />
        <div className="md:col-span-2 flex justify-end">
          <button disabled={busy || !form.title.trim()} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"><Plus className="w-4 h-4" /> {busy ? 'Adding…' : 'Add document'}</button>
        </div>
      </form>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {['all', ...categories].map(c => (
            <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1 text-sm rounded-full border ${category === c ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-gray-50'}`}>{c === 'all' ? 'All' : c}</button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">No documents yet.</div>
      ) : (
        <ul className="border rounded-xl bg-white divide-y">
          {shown.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="w-5 h-5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1">{d.title}<ExternalLink className="w-3.5 h-3.5" /></a> : d.title}
                </div>
                {d.description && <div className="text-sm text-gray-500 truncate">{d.description}</div>}
                <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                  {[d.category, d.meeting_id ? meetingName.get(d.meeting_id) : null, d.created_by ? people[d.created_by] : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              {d.meeting_id && meetingName.has(d.meeting_id) && <Link href={`/meetings/${d.meeting_id}`} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Meeting</Link>}
              {(d.created_by === myId || isManager) && (
                <button onClick={() => confirm('Delete this document?') && act(() => deleteDocument(d.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
