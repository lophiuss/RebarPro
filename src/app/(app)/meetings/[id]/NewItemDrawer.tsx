'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ListChecks, AlertCircle } from 'lucide-react'
import { createLinkedItem } from '../actions'
import { useMeeting, useRun } from './context'
import { PersonSelect } from '../PersonPicker'
import { RichEditor } from '../RichText'

export type Draft = { title: string; details: string | null; owner_id: string | null; due_date: string | null }

const field = 'w-full border rounded-lg px-3 py-2 text-sm bg-white'
const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5'

export function plusDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Side panel for turning something (a headline, a KPI number) into a NEW to-do
// or issue. It opens pre-filled with a copy of the source so the person can edit
// the wording, owner, due date and details first; nothing exists until they
// press Create. The source itself is never changed.
export default function NewItemDrawer({
  kind, draft, sourceLabel, headlineId, onClose,
}: {
  kind: 'todo' | 'issue'
  draft: Draft
  sourceLabel: string
  headlineId?: string
  onClose: () => void
}) {
  const { meetingId, people, myId } = useMeeting()
  const run = useRun()
  const [title, setTitle] = useState(draft.title)
  const [owner, setOwner] = useState(draft.owner_id ?? myId)
  const [due, setDue] = useState(draft.due_date ?? (kind === 'todo' ? plusDays(7) : ''))
  const details = useRef<string | null>(draft.details)
  const [busy, setBusy] = useState(false)
  const Icon = kind === 'todo' ? ListChecks : AlertCircle
  const label = kind === 'todo' ? 'to-do' : 'issue'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function create() {
    if (!title.trim()) return
    setBusy(true)
    const ok = await run(async () => {
      await createLinkedItem(meetingId, kind, { title, details: details.current, owner_id: owner || null, due_date: due || null }, { headlineId })
      return true
    })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 no-print" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[34rem] bg-white shadow-2xl flex flex-col no-print" role="dialog" aria-label={`New ${label}`}>
        <header className="flex items-center gap-3 px-5 py-4 border-b">
          <Icon className={`w-5 h-5 ${kind === 'todo' ? 'text-blue-600' : 'text-amber-600'}`} />
          <h2 className="font-bold text-lg flex-1">New {label}</h2>
          <span className="text-[11px] font-bold uppercase tracking-wide rounded-full bg-green-100 text-green-700 px-2 py-0.5">New</span>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400 hover:text-gray-700" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <p className="text-xs text-gray-600 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
            {sourceLabel} Edit anything you like, then press <b>Create {label}</b>. The original stays as it is.
          </p>
          <div>
            <div className={sectionTitle}>{kind === 'todo' ? 'To-do' : 'Issue'}</div>
            <input value={title} onChange={e => setTitle(e.target.value)} className={field} aria-label="Title" autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className={sectionTitle}>Assign to</div>
              <PersonSelect people={people} value={owner} onChange={setOwner} emptyLabel="No owner" className="w-full" ariaLabel="Owner" />
            </div>
            <div>
              <div className={sectionTitle}>Due date</div>
              <input type="date" value={due} onChange={e => setDue(e.target.value)} className={field} aria-label="Due date" />
            </div>
          </div>
          <div>
            <div className={sectionTitle}>Details</div>
            <RichEditor value={draft.details} onCommit={html => { details.current = html }} />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border bg-white hover:bg-gray-50">Cancel</button>
          <button onClick={create} disabled={busy || !title.trim()} className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Creating…' : `Create ${label}`}
          </button>
        </footer>
      </aside>
    </>
  )
}
