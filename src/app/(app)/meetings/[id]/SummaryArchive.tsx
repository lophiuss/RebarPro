'use client'

import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Star, FileText, Mail, Printer, Eye, X, Send } from 'lucide-react'
import { emailSummary } from './emailSummary'
import { useMeeting } from './context'
import { PeopleChecklist } from '../PersonPicker'
import { card, Empty } from './shared'
import { buildMinutesHtml } from '@/lib/minutesHtml'
import type { Person } from '@/lib/meetings'

export type SummaryRow = {
  id: string
  run_id: string
  created_at: string
  average_rating: number | null
  snapshot: any
  emailed_at?: string | null
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}
function day(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ------------------------------------------------------------- send dialog

function SendDialog({ summary, meetingName, onClose }: { summary: SummaryRow; meetingName: string; onClose: () => void }) {
  const { people, attendeeIds, myId } = useMeeting()
  const [selected, setSelected] = useState<string[]>(attendeeIds)
  const [subject, setSubject] = useState(`Meeting minutes: ${meetingName} (${new Date(summary.snapshot?.ended_at ?? summary.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})`)
  const [message, setMessage] = useState('')
  const [includeDetails, setIncludeDetails] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  // Attendees first, then everyone else.
  const ordered = useMemo(() => [...people].sort((a, b) => Number(attendeeIds.includes(b.id)) - Number(attendeeIds.includes(a.id))), [people, attendeeIds])

  async function send(ids: string[]) {
    if (ids.length === 0) return
    setBusy(true)
    setResult(null)
    try {
      const r = await emailSummary(summary.id, { includeDetails, includeNotes, recipientIds: ids, subject, message })
      const extra = [r.skipped.length ? `No e-mail address: ${r.skipped.join(', ')}.` : '', r.failed.length ? `Failed: ${r.failed.join(', ')}.` : ''].filter(Boolean).join(' ')
      setResult({ ok: r.failed.length === 0 && r.sent > 0, text: `Sent ${r.sent} separate e-mail${r.sent === 1 ? '' : 's'}. ${extra}`.trim() })
    } catch (err: any) {
      setResult({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  // Rendered on <body> so the meeting page's zoom setting cannot shift or clip it.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-lg">Send meeting minutes</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-sm font-medium mb-1">To ({selected.length} selected)</div>
            <PeopleChecklist people={ordered} selected={selected} onToggle={id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))} maxHeight="max-h-52" />
            <p className="text-xs text-gray-500 mt-1">Everyone gets their own separate e-mail, so nobody sees who else received it.</p>
          </div>
          <label className="block text-sm font-medium">Subject
            <input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
          </label>
          <label className="block text-sm font-medium">Message (optional)
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="A short note shown above the minutes" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
          </label>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeDetails} onChange={e => setIncludeDetails(e.target.checked)} /> Include item details</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeNotes} onChange={e => setIncludeNotes(e.target.checked)} /> Include meeting notes</label>
          </div>
          {result && <p className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>{result.text}</p>}
          {summary.emailed_at && !result && <p className="text-xs text-gray-500">Last e-mailed {when(summary.emailed_at)}.</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <button onClick={() => send([myId])} disabled={busy} className="px-3 py-2 text-sm rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50" title="Sends one copy to you only, to check how it looks">Send test to me</button>
          <button onClick={() => send(selected)} disabled={busy || selected.length === 0} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
            <Send className="w-4 h-4" /> {busy ? 'Sending…' : `Send to ${selected.length}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ------------------------------------------------------------------ report

// The report on screen IS the e-mail: the same HTML is previewed here, printed
// from its own frame (so the website header and sidebar never appear), and sent.
function Report({ summary, meetingName, peopleById, onBack }: {
  summary: SummaryRow; meetingName: string; peopleById: Map<string, Person>; onBack: () => void
}) {
  const [includeDetails, setIncludeDetails] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [sending, setSending] = useState(false)
  const [height, setHeight] = useState(900)
  const frame = useRef<HTMLIFrameElement>(null)

  const html = useMemo(() => buildMinutesHtml({
    meetingName,
    createdAt: summary.created_at,
    averageRating: summary.average_rating,
    snapshot: summary.snapshot,
    names: Object.fromEntries([...peopleById.entries()].map(([id, p]) => [id, p.full_name ?? '—'])),
    includeDetails,
    includeNotes,
    ref: summary.id,
  }), [meetingName, summary, peopleById, includeDetails, includeNotes])

  function print() {
    frame.current?.contentWindow?.focus()
    frame.current?.contentWindow?.print()
  }

  return (
    <div>
      <div className="no-print flex flex-wrap items-center gap-3 mb-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Back to summary list</button>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500"><Eye className="w-4 h-4" /> Preview: this is exactly what is printed and e-mailed</span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={includeDetails} onChange={e => setIncludeDetails(e.target.checked)} /> Item details</label>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={includeNotes} onChange={e => setIncludeNotes(e.target.checked)} /> Notes</label>
          <button onClick={print} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"><Printer className="w-4 h-4" /> Print / Save as PDF</button>
          <button onClick={() => setSending(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-sm font-semibold hover:bg-gray-50"><Mail className="w-4 h-4" /> Send…</button>
        </div>
      </div>
      <iframe
        ref={frame}
        title="Meeting minutes preview"
        srcDoc={html}
        // No scripts. Same-origin lets us size the frame and print it.
        sandbox="allow-same-origin allow-modals"
        onLoad={() => { const h = frame.current?.contentDocument?.documentElement.scrollHeight; if (h) setHeight(h + 8) }}
        style={{ height }}
        className="w-full border rounded-xl bg-slate-100"
      />
      {sending && <SendDialog summary={summary} meetingName={meetingName} onClose={() => setSending(false)} />}
    </div>
  )
}

// --------------------------------------------------------------------- list

export function SummaryTab({ summaries, peopleById, meetingName }: { summaries: SummaryRow[]; peopleById: Map<string, Person>; meetingName: string }) {
  const [selected, setSelected] = useState<SummaryRow | null>(null)

  if (selected) return <Report summary={selected} meetingName={meetingName} peopleById={peopleById} onBack={() => setSelected(null)} />

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Summaries</h2>
      {summaries.length === 0 ? (
        <Empty title="No meeting summary found for this meeting." hint="A report is saved each time a meeting is concluded." />
      ) : (
        <ul className={`${card} divide-y`}>
          {summaries.map(s => {
            const snap = s.snapshot ?? {}
            const att: { present: boolean }[] = snap.attendance ?? []
            return (
              <li key={s.id}>
                <button onClick={() => setSelected(s)} className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50">
                  <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{day(snap.ended_at ?? s.created_at)}</div>
                    <div className="text-xs text-gray-500">
                      {(snap.todos_created ?? []).length} to-dos created · {snap.counts?.issues_solved ?? (snap.issues_solved ?? []).length} issues solved
                      {att.length > 0 && ` · ${att.filter(a => a.present).length}/${att.length} present`}
                      {s.emailed_at && ` · e-mailed ${when(s.emailed_at)}`}
                    </div>
                  </div>
                  {s.average_rating != null && <span className="text-sm text-gray-700 flex items-center gap-1 font-semibold"><Star className="w-4 h-4 fill-amber-400 text-amber-400" />{Number(s.average_rating).toFixed(1)}</span>}
                  <span className="text-xs font-semibold text-blue-600">View minutes</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
