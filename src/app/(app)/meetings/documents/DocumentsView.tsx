'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ExternalLink, Plus, Trash2, FileText, Upload, Link2, X, Download, Search, Folder, FolderOpen, Users, Building2,
  UserRound, PenTool, Layers, ChevronRight, Inbox,
} from 'lucide-react'
import { addDocument, deleteDocument, getDocumentUrl } from './actions'
import { createWhiteboard } from '../coach/actions'
import { createClient } from '@/lib/supabase/client'
import { act } from '../act'
import { DOC_DEPARTMENTS } from '@/lib/meetings'

type Doc = {
  id: string; title: string; description: string | null; url: string | null; category: string | null
  meeting_id: string | null; department: string | null; created_by: string | null; created_at: string
  file_name: string | null; file_size: number | null; mime_type: string | null; file_path: string | null
}
type Board = { id: string; title: string; meeting_id: string | null; created_by: string | null; created_at: string; updated_at: string }
type Entry = { type: 'doc'; doc: Doc; at: string } | { type: 'board'; board: Board; at: string }

// Folders are built for you from what is in them: every meeting, every department,
// your own files, whiteboards, and a General folder for anything not filed yet.
type FolderKey =
  | { k: 'root' } | { k: 'all' } | { k: 'meetings' } | { k: 'meeting'; id: string }
  | { k: 'departments' } | { k: 'department'; name: string } | { k: 'mine' } | { k: 'boards' } | { k: 'general' }

const input = 'border rounded-lg px-3 py-2 text-sm bg-white w-full'
const MAX = 25 * 1024 * 1024

function size(n: number | null) {
  if (!n) return ''
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

function Tile({ icon: Icon, title, count, tone, onClick }: { icon: React.ComponentType<{ className?: string }>; title: string; count: number; tone: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group text-left rounded-xl border bg-white shadow-sm hover:shadow-md transition overflow-hidden">
      <div className={`h-24 flex items-center justify-center ${tone}`}><Icon className="w-9 h-9 opacity-80 group-hover:scale-110 transition" /></div>
      <div className="px-3 py-2.5">
        <div className="text-sm font-semibold truncate" title={title}>{title}</div>
        <div className="text-xs text-gray-500">{count} item{count === 1 ? '' : 's'}</div>
      </div>
    </button>
  )
}

export default function DocumentsView({ docs, boards, meetings, people, myId, isManager }: {
  docs: Doc[]; boards: Board[]; meetings: { id: string; name: string }[]; people: Record<string, string>; myId: string; isManager: boolean
}) {
  const router = useRouter()
  const [folder, setFolder] = useState<FolderKey>({ k: 'root' })
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [form, setForm] = useState({ title: '', url: '', category: '', description: '', meeting_id: '', department: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const meetingName = useMemo(() => new Map(meetings.map(m => [m.id, m.name])), [meetings])
  const entries: Entry[] = useMemo(() => [
    ...docs.map(d => ({ type: 'doc' as const, doc: d, at: d.created_at })),
    ...boards.map(b => ({ type: 'board' as const, board: b, at: b.updated_at })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [docs, boards])

  const meetingOf = (e: Entry) => (e.type === 'doc' ? e.doc.meeting_id : e.board.meeting_id)
  const deptOf = (e: Entry) => (e.type === 'doc' ? e.doc.department : null)
  const ownerOf = (e: Entry) => (e.type === 'doc' ? e.doc.created_by : e.board.created_by)

  const inFolder = (f: FolderKey): Entry[] => {
    switch (f.k) {
      case 'root': case 'all': case 'meetings': case 'departments': return entries
      case 'meeting': return entries.filter(e => meetingOf(e) === f.id)
      case 'department': return entries.filter(e => deptOf(e) === f.name)
      case 'mine': return entries.filter(e => ownerOf(e) === myId)
      case 'boards': return entries.filter(e => e.type === 'board')
      case 'general': return entries.filter(e => !meetingOf(e) && !deptOf(e))
    }
  }

  const q = query.trim().toLowerCase()
  const textOf = (e: Entry) => (e.type === 'doc' ? `${e.doc.title} ${e.doc.description ?? ''} ${e.doc.file_name ?? ''} ${e.doc.category ?? ''}` : e.board.title).toLowerCase()
  const leaf = folder.k !== 'root' && folder.k !== 'meetings' && folder.k !== 'departments'
  const shown = (q ? entries : leaf ? inFolder(folder) : []).filter(e => !q || textOf(e).includes(q))

  const title = (f: FolderKey) =>
    f.k === 'root' ? 'Documents' : f.k === 'all' ? 'All documents' : f.k === 'meetings' ? 'By meeting' : f.k === 'departments' ? 'By department'
    : f.k === 'meeting' ? meetingName.get(f.id) ?? 'Meeting' : f.k === 'department' ? f.name : f.k === 'mine' ? 'My documents' : f.k === 'boards' ? 'Whiteboards' : 'General'
  const crumbs: FolderKey[] = folder.k === 'root' ? [{ k: 'root' }]
    : folder.k === 'meeting' ? [{ k: 'root' }, { k: 'meetings' }, folder]
    : folder.k === 'department' ? [{ k: 'root' }, { k: 'departments' }, folder]
    : [{ k: 'root' }, folder]

  function openAdd() {
    setForm({ title: '', url: '', category: '', description: '', meeting_id: folder.k === 'meeting' ? folder.id : '', department: folder.k === 'department' ? folder.name : '' })
    setFile(null); setError('')
    if (fileInput.current) fileInput.current.value = ''
    setAdding(true)
  }

  function pick(f: File | null) {
    setError('')
    if (f && f.size > MAX) { setError('That file is larger than 25 MB.'); return }
    setFile(f)
    if (f && !form.title.trim()) setForm(prev => ({ ...prev, title: f.name.replace(/\.[^.]+$/, '') }))
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (mode === 'file' && !file) { setError('Choose a file to upload, or switch to “Link”.'); return }
    if (mode === 'link' && !form.url.trim()) { setError('Paste the link.'); return }
    setBusy(true)
    try {
      let uploaded: { path: string; name: string; size: number; type: string } | null = null
      if (mode === 'file' && file) {
        const supabase = createClient()
        const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120)
        const path = `${myId}/${crypto.randomUUID()}-${safe}`
        const { error: upErr } = await supabase.storage.from('meeting-docs').upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
        uploaded = { path, name: file.name, size: file.size, type: file.type || 'application/octet-stream' }
      }
      await addDocument({ ...form, url: mode === 'link' ? form.url : '', meeting_id: form.meeting_id || null, department: form.department || null, file: uploaded })
      setAdding(false)
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function newBoard() {
    const name = prompt('Whiteboard name', folder.k === 'meeting' ? `${meetingName.get(folder.id) ?? 'Meeting'} whiteboard` : 'New whiteboard')
    if (!name?.trim()) return
    const id = await act(() => createWhiteboard({ title: name, meeting_id: folder.k === 'meeting' ? folder.id : null }))
    if (id) router.push(`/meetings/coach/${id}`)
  }

  async function open(d: Doc) {
    const url = await act(() => getDocumentUrl(d.id))
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const count = (f: FolderKey) => inFolder(f).length
  const mine = (b: { created_by: string | null }) => b.created_by === myId || isManager

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <nav className="flex items-center gap-1 text-sm text-gray-600 min-w-0" aria-label="Folder path">
          {crumbs.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
              {i === crumbs.length - 1 && !q
                ? <span className="font-semibold text-slate-900 truncate">{title(c)}</span>
                : <button onClick={() => { setFolder(c); setQuery('') }} className="hover:text-blue-700 hover:underline truncate">{title(c)}</button>}
            </span>
          ))}
        </nav>
        <div className="relative ml-auto">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search everything" className="pl-8 pr-3 py-1.5 border rounded-lg text-sm bg-white w-56" aria-label="Search documents" />
        </div>
        <button onClick={newBoard} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-sm font-semibold hover:bg-gray-50"><PenTool className="w-4 h-4" /> New whiteboard</button>
        <button onClick={openAdd} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"><Plus className="w-4 h-4" /> Add document</button>
      </div>

      {/* Folder tiles */}
      {!q && folder.k === 'root' && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <Tile icon={Layers} title="All documents" count={entries.length} tone="bg-blue-50 text-blue-700" onClick={() => setFolder({ k: 'all' })} />
          <Tile icon={Users} title="By meeting" count={entries.filter(e => meetingOf(e)).length} tone="bg-violet-50 text-violet-700" onClick={() => setFolder({ k: 'meetings' })} />
          <Tile icon={Building2} title="By department" count={entries.filter(e => deptOf(e)).length} tone="bg-emerald-50 text-emerald-700" onClick={() => setFolder({ k: 'departments' })} />
          <Tile icon={UserRound} title="My documents" count={count({ k: 'mine' })} tone="bg-amber-50 text-amber-700" onClick={() => setFolder({ k: 'mine' })} />
          <Tile icon={PenTool} title="Whiteboards" count={count({ k: 'boards' })} tone="bg-pink-50 text-pink-700" onClick={() => setFolder({ k: 'boards' })} />
          <Tile icon={Inbox} title="General" count={count({ k: 'general' })} tone="bg-slate-100 text-slate-600" onClick={() => setFolder({ k: 'general' })} />
        </div>
      )}
      {!q && folder.k === 'meetings' && (
        meetings.length === 0 ? <p className="text-sm text-gray-500">No meetings yet.</p> : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
            {meetings.map(m => <Tile key={m.id} icon={count({ k: 'meeting', id: m.id }) ? FolderOpen : Folder} title={m.name} count={count({ k: 'meeting', id: m.id })} tone="bg-violet-50 text-violet-700" onClick={() => setFolder({ k: 'meeting', id: m.id })} />)}
          </div>
        )
      )}
      {!q && folder.k === 'departments' && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
          {DOC_DEPARTMENTS.map(d => <Tile key={d} icon={count({ k: 'department', name: d }) ? FolderOpen : Folder} title={d} count={count({ k: 'department', name: d })} tone="bg-emerald-50 text-emerald-700" onClick={() => setFolder({ k: 'department', name: d })} />)}
        </div>
      )}

      {/* Items */}
      {(q || leaf) && (
        shown.length === 0 ? (
          <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">
            {q ? 'Nothing matches your search.' : 'Nothing here yet. Use “Add document” or “New whiteboard” above.'}
          </div>
        ) : (
          <ul className="border rounded-xl bg-white shadow-sm divide-y">
            {shown.map(e => e.type === 'board' ? (
              <li key={`b-${e.board.id}`} className="flex items-center gap-3 px-4 py-3">
                <PenTool className="w-5 h-5 text-pink-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link href={`/meetings/coach/${e.board.id}`} className="font-medium text-blue-700 hover:underline truncate block">{e.board.title}</Link>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide">Whiteboard · {[e.board.meeting_id ? meetingName.get(e.board.meeting_id) : null, e.board.created_by ? people[e.board.created_by] : null, new Date(e.board.updated_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })].filter(Boolean).join(' · ')}</div>
                </div>
              </li>
            ) : (
              <li key={`d-${e.doc.id}`} className="flex items-center gap-3 px-4 py-3">
                {e.doc.file_path ? <Upload className="w-5 h-5 text-blue-500 shrink-0" /> : <FileText className="w-5 h-5 text-gray-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {e.doc.file_path ? (
                      <button onClick={() => open(e.doc)} className="text-blue-700 hover:underline inline-flex items-center gap-1 text-left"><span className="truncate">{e.doc.title}</span><Download className="w-3.5 h-3.5 shrink-0" /></button>
                    ) : e.doc.url ? (
                      <a href={e.doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1">{e.doc.title}<ExternalLink className="w-3.5 h-3.5" /></a>
                    ) : e.doc.title}
                  </div>
                  {e.doc.description && <div className="text-sm text-gray-500 truncate">{e.doc.description}</div>}
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                    {[e.doc.department, e.doc.category, e.doc.file_name ? `${e.doc.file_name} · ${size(e.doc.file_size)}` : 'Link', e.doc.meeting_id ? meetingName.get(e.doc.meeting_id) : null, e.doc.created_by ? people[e.doc.created_by] : null, new Date(e.doc.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {e.doc.meeting_id && meetingName.has(e.doc.meeting_id) && <Link href={`/meetings/${e.doc.meeting_id}`} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Meeting</Link>}
                {mine(e.doc) && (
                  <button onClick={() => confirm('Delete this document?') && act(() => deleteDocument(e.doc.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {adding && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={add} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">Add document</h2>
              <button type="button" onClick={() => setAdding(false)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm">
                <button type="button" onClick={() => setMode('file')} className={`px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 ${mode === 'file' ? 'bg-white shadow-sm' : 'text-gray-500'}`}><Upload className="w-4 h-4" /> Upload file</button>
                <button type="button" onClick={() => setMode('link')} className={`px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 ${mode === 'link' ? 'bg-white shadow-sm' : 'text-gray-500'}`}><Link2 className="w-4 h-4" /> Link</button>
              </div>

              {mode === 'file' ? (
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null) }}
                  className="border-2 border-dashed rounded-xl p-6 text-center bg-gray-50"
                >
                  <input ref={fileInput} type="file" onChange={e => pick(e.target.files?.[0] ?? null)} className="hidden" id="doc-file" />
                  {file ? (
                    <div className="text-sm"><b>{file.name}</b> <span className="text-gray-500">({size(file.size)})</span>
                      <button type="button" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = '' }} className="ml-2 text-red-600 hover:underline">Remove</button></div>
                  ) : (
                    <label htmlFor="doc-file" className="cursor-pointer text-sm text-gray-600">
                      <Upload className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                      <span className="font-semibold text-blue-600">Choose a file</span> or drop it here<br /><span className="text-xs text-gray-400">PDF, Word, Excel, images… up to 25 MB</span>
                    </label>
                  )}
                </div>
              ) : (
                <label className="block text-sm font-medium">Link
                  <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://…" className={`${input} mt-1 font-normal`} />
                </label>
              )}

              <label className="block text-sm font-medium">Title
                <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={`${input} mt-1 font-normal`} />
              </label>
              <p className="text-xs text-gray-500 -mb-2">It is filed automatically in the folders you choose here. Leave both empty to put it in General.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">Meeting
                  <select value={form.meeting_id} onChange={e => setForm({ ...form, meeting_id: e.target.value })} className={`${input} mt-1 font-normal`}>
                    <option value="">Not tied to a meeting</option>
                    {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">Department
                  <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className={`${input} mt-1 font-normal`}>
                    <option value="">No department</option>
                    {DOC_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium">Description <span className="text-gray-400 font-normal">(optional)</span>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={`${input} mt-1 font-normal`} />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? (mode === 'file' ? 'Uploading…' : 'Saving…') : 'Add document'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
