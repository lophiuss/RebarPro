'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, X, ArrowRight, Eye } from 'lucide-react'
import { createPrepSession, deletePrepSession, savePrepDoc, deletePrepDoc } from './actions'
import { act } from '../act'

type Q = { id?: string; label: string; type: 'text' | 'rating' }
type Doc = { id: string; name: string; questions: Q[] }
type Session = { id: string; meeting_id: string; due_date: string; created_by: string | null; meeting_name: string; doc_name: string; submitted: number; total: number; mine: boolean; mySubmitted: boolean }

const input = 'border rounded-lg px-3 py-2 text-sm bg-white'

export default function SessionPrepView({ sessions, docs, meetings, myId, canManageDocs }: {
  sessions: Session[]; docs: Doc[]; meetings: { id: string; name: string }[]; myId: string; canManageDocs: boolean
}) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ meeting_id: '', doc_id: docs[0]?.id ?? '', due_date: '', add_todos: true })
  const [preview, setPreview] = useState<Doc | null>(null)
  const [busy, setBusy] = useState(false)
  const [docForm, setDocForm] = useState<{ id?: string; name: string; questions: Q[] } | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const id = await act(() => createPrepSession(form))
    setBusy(false)
    if (id) { setShowCreate(false); router.push(`/meetings/session-prep/${id}`) }
  }

  async function saveDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!docForm) return
    setBusy(true)
    const ok = await act(async () => { await savePrepDoc(docForm); return true })
    setBusy(false)
    if (ok) setDocForm(null)
  }

  const selectedDoc = docs.find(d => d.id === form.doc_id)

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Prep sessions</h2>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"><Plus className="w-4 h-4" /> Create session prep</button>
        </div>
        {sessions.length === 0 ? (
          <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">No prep sessions yet.</div>
        ) : (
          <ul className="border rounded-xl bg-white divide-y">
            {sessions.map(s => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <Link href={`/meetings/session-prep/${s.id}`} className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.doc_name} <span className="text-gray-400 font-normal">· {s.meeting_name}</span></div>
                  <div className="text-xs text-gray-500">Due {s.due_date} · {s.submitted}/{s.total} submitted{s.mine && !s.mySubmitted ? ' · waiting for you' : ''}</div>
                </Link>
                {s.mine && !s.mySubmitted && <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">To do</span>}
                {(s.created_by === myId || canManageDocs) && (
                  <button onClick={() => confirm('Delete this prep session and all responses?') && act(() => deletePrepSession(s.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                )}
                <Link href={`/meetings/session-prep/${s.id}`}><ArrowRight className="w-4 h-4 text-gray-300" /></Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Prep docs</h2>
          {canManageDocs && <button onClick={() => setDocForm({ name: '', questions: [{ label: '', type: 'text' }] })} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"><Plus className="w-4 h-4" /> New prep doc</button>}
        </div>
        <ul className="border rounded-xl bg-white divide-y">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0"><div className="font-medium truncate">{d.name}</div><div className="text-xs text-gray-500">{d.questions.length} question{d.questions.length === 1 ? '' : 's'}</div></div>
              <button onClick={() => setPreview(d)} aria-label="Preview" className="text-gray-400 hover:text-blue-600"><Eye className="w-4 h-4" /></button>
              {canManageDocs && (
                <>
                  <button onClick={() => setDocForm({ id: d.id, name: d.name, questions: d.questions.map(q => ({ label: q.label, type: q.type })) })} aria-label="Edit" className="text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => confirm(`Delete "${d.name}"?`) && act(() => deletePrepDoc(d.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </>
              )}
            </li>
          ))}
          {docs.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No prep docs yet.</li>}
        </ul>
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={create} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">Create session prep</h2>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">Use this form to gather everyone&apos;s thoughts beforehand so your meeting stays focused and efficient.</p>
              <label className="block text-sm font-medium">Due date *
                <input required type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={`${input} mt-1 w-full font-normal`} />
              </label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.add_todos} onChange={e => setForm({ ...form, add_todos: e.target.checked })} /> Add a to-do for all members to complete their forms</label>
              <label className="block text-sm font-medium">Attach to meeting *
                <select required value={form.meeting_id} onChange={e => setForm({ ...form, meeting_id: e.target.value })} className={`${input} mt-1 w-full font-normal`}>
                  <option value="">Choose a meeting</option>
                  {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">Prep doc *
                <select required value={form.doc_id} onChange={e => setForm({ ...form, doc_id: e.target.value })} className={`${input} mt-1 w-full font-normal`}>
                  <option value="">Choose a prep doc</option>
                  {docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              {selectedDoc && <button type="button" onClick={() => setPreview(selectedDoc)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">Preview here</button>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button disabled={busy || !form.meeting_id || !form.doc_id || !form.due_date} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b"><h2 className="font-bold text-lg">{preview.name}</h2><button onClick={() => setPreview(null)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button></div>
            <ol className="p-5 space-y-3 list-decimal list-inside">
              {preview.questions.map((q, i) => <li key={i} className="text-sm">{q.label} <span className="text-xs text-gray-400">({q.type === 'rating' ? '1-10' : 'text'})</span></li>)}
            </ol>
          </div>
        </div>
      )}

      {docForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={saveDoc} className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">{docForm.id ? 'Edit prep doc' : 'New prep doc'}</h2>
              <button type="button" onClick={() => setDocForm(null)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-sm font-medium">Name
                <input required value={docForm.name} onChange={e => setDocForm({ ...docForm, name: e.target.value })} className={`${input} mt-1 w-full font-normal`} />
              </label>
              <div>
                <div className="text-sm font-medium mb-1">Questions</div>
                <ul className="space-y-2">
                  {docForm.questions.map((q, i) => (
                    <li key={i} className="flex gap-2">
                      <input value={q.label} onChange={e => setDocForm({ ...docForm, questions: docForm.questions.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)) })} placeholder={`Question ${i + 1}`} className={`${input} flex-1`} />
                      <select value={q.type} onChange={e => setDocForm({ ...docForm, questions: docForm.questions.map((x, idx) => (idx === i ? { ...x, type: e.target.value as Q['type'] } : x)) })} className={input} aria-label="Answer type">
                        <option value="text">Text</option><option value="rating">Rating 1-10</option>
                      </select>
                      <button type="button" onClick={() => setDocForm({ ...docForm, questions: docForm.questions.filter((_, idx) => idx !== i) })} aria-label="Remove" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setDocForm({ ...docForm, questions: [...docForm.questions, { label: '', type: 'text' }] })} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"><Plus className="w-4 h-4" /> Add question</button>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setDocForm(null)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
