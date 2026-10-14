'use client'

import { useState } from 'react'
import { ArrowLeft, Star, FileText, Mail } from 'lucide-react'
import Avatar from '../Avatar'
import { emailSummary } from './emailSummary'
import { formatSeconds, PAGE_LABEL, PAGE_TYPES, type Person } from '@/lib/meetings'
import type { Headline, Todo, Issue } from './Sections'

export type SummaryRow = {
  id: string
  run_id: string
  created_at: string
  average_rating: number | null
  snapshot: any
  emailed_at?: string | null
}

function EmailButton({ summaryId, emailedAt }: { summaryId: string; emailedAt?: string | null }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function send() {
    if (!confirm('Email this summary to all attendees?')) return
    setBusy(true)
    setMsg(null)
    try {
      const n = await emailSummary(summaryId, { includeDetails: true, includeNotes: false })
      setMsg({ ok: true, text: `Sent to ${n} attendee${n === 1 ? '' : 's'}.` })
    } catch (err: any) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={send} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
        <Mail className="w-4 h-4" /> {busy ? 'Sending…' : 'Email summary'}
      </button>
      {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>}
      {!msg && emailedAt && <span className="text-xs text-gray-500">Last emailed {new Date(emailedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
    </div>
  )
}

const card = 'border rounded-xl bg-white'

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export function SummaryTab({ summaries, peopleById }: { summaries: SummaryRow[]; peopleById: Map<string, Person> }) {
  const [selected, setSelected] = useState<SummaryRow | null>(null)

  if (selected) {
    const s = selected.snapshot ?? {}
    const started = s.started_at ? new Date(s.started_at).getTime() : null
    const ended = s.ended_at ? new Date(s.ended_at).getTime() : null
    const duration = started && ended ? Math.round((ended - started) / 1000) : null
    const sections: { title: string; items: { key: string; owner?: string | null; text: string; meta?: string }[] }[] = [
      { title: 'Headlines', items: (s.headlines ?? []).map((h: any) => ({ key: h.id, owner: h.owner_id, text: h.title })) },
      { title: 'To-dos created', items: (s.todos_created ?? []).map((t: any) => ({ key: t.id, owner: t.owner_id, text: t.title, meta: t.due_date })) },
      { title: 'To-dos completed', items: (s.todos_completed ?? []).map((t: any) => ({ key: t.id, owner: t.owner_id, text: t.title })) },
      { title: 'Issues solved', items: (s.issues_solved ?? []).map((i: any) => ({ key: i.id, text: i.title })) },
    ]
    return (
      <div>
        <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"><ArrowLeft className="w-4 h-4" /> Back to summary list</button>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <h2 className="text-xl font-bold">{when(selected.created_at)}</h2>
          <EmailButton summaryId={selected.id} emailedAt={selected.emailed_at} />
        </div>
        <div className="text-sm text-gray-500 mb-4 flex gap-4 flex-wrap">
          {duration != null && <span>Duration {formatSeconds(duration)}</span>}
          {selected.average_rating != null && <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Average rating {Number(selected.average_rating).toFixed(1)}</span>}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {sections.map(sec => (
            <div key={sec.title} className={`${card} p-4`}>
              <div className="font-semibold text-sm mb-2">{sec.title} <span className="text-gray-400 font-normal">({sec.items.length})</span></div>
              {sec.items.length === 0 ? <p className="text-sm text-gray-400">None</p> : (
                <ul className="space-y-1.5">
                  {sec.items.map(it => (
                    <li key={it.key} className="text-sm flex items-center gap-2">
                      {it.owner !== undefined && <Avatar person={peopleById.get(it.owner ?? '')} size="sm" />}
                      <span className="flex-1">{it.text}</span>
                      {it.meta && <span className="text-xs text-gray-500">{it.meta}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {(s.ratings ?? []).length > 0 && (
          <div className={`${card} p-4 mt-4`}>
            <div className="font-semibold text-sm mb-2">Ratings</div>
            <ul className="space-y-1.5">
              {s.ratings.map((r: any) => (
                <li key={r.user_id} className="text-sm flex items-start gap-2">
                  <Avatar person={peopleById.get(r.user_id)} size="sm" />
                  <span className="w-36 truncate">{peopleById.get(r.user_id)?.full_name}</span>
                  <span className="font-semibold">{r.rating ?? '—'}</span>
                  {r.feedback && <span className="text-gray-600">— {r.feedback}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {s.page_seconds && (
          <div className={`${card} p-4 mt-4`}>
            <div className="font-semibold text-sm mb-2">Time per section</div>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {PAGE_TYPES.map(p => (
                <li key={p} className="text-sm flex justify-between"><span>{PAGE_LABEL[p]}</span><span className="tabular-nums text-gray-600">{formatSeconds(Math.round(s.page_seconds[p] ?? 0))}</span></li>
              ))}
            </ul>
          </div>
        )}

        {s.notes && (
          <div className={`${card} p-4 mt-4`}>
            <div className="font-semibold text-sm mb-2">Meeting notes</div>
            <p className="text-sm whitespace-pre-wrap">{s.notes}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Summaries</h2>
      {summaries.length === 0 ? (
        <div className="border border-dashed rounded-xl p-8 text-center bg-white">
          <div className="font-semibold text-slate-700">No meeting summary found for this meeting.</div>
          <div className="text-sm text-gray-500 mt-1">A summary is saved each time a meeting is concluded.</div>
        </div>
      ) : (
        <ul className={`${card} divide-y`}>
          {summaries.map(s => (
            <li key={s.id}>
              <button onClick={() => setSelected(s)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="flex-1 font-medium">{when(s.created_at)}</span>
                {s.average_rating != null && <span className="text-sm text-gray-600 flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{Number(s.average_rating).toFixed(1)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ArchiveTab({ archived, peopleById }: { archived: { headlines: Headline[]; todos: Todo[]; issues: Issue[] }; peopleById: Map<string, Person> }) {
  const groups = [
    { title: 'Headlines', items: archived.headlines.map(h => ({ key: h.id, owner: h.owner_id, text: h.title })) },
    { title: 'Completed to-dos', items: archived.todos.map(t => ({ key: t.id, owner: t.owner_id, text: t.title })) },
    { title: 'Solved issues', items: archived.issues.map(i => ({ key: i.id, owner: i.owner_id, text: i.title })) },
  ]
  const empty = groups.every(g => g.items.length === 0)
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Archive</h2>
      {empty ? (
        <div className="border border-dashed rounded-xl p-8 text-center bg-white">
          <div className="font-semibold text-slate-700">Nothing archived yet</div>
          <div className="text-sm text-gray-500 mt-1">Completed to-dos, headlines and solved issues land here when a meeting is concluded.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => g.items.length > 0 && (
            <div key={g.title} className={`${card} p-4`}>
              <div className="font-semibold text-sm mb-2">{g.title} <span className="text-gray-400 font-normal">({g.items.length})</span></div>
              <ul className="space-y-1.5">
                {g.items.map(it => (
                  <li key={it.key} className="text-sm flex items-center gap-2">
                    <Avatar person={peopleById.get(it.owner ?? '')} size="sm" /> {it.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
