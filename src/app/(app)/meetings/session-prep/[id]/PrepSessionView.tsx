'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check } from 'lucide-react'
import { savePrepResponse } from '../actions'
import { act } from '../../act'
import Avatar from '../../Avatar'
import type { Person } from '@/lib/meetings'

type QType = 'text' | 'rating' | 'number' | 'yesno' | 'choice' | 'multi' | 'vote' | 'date'
type Q = { id: string; label: string; type: QType; options?: string[]; unit?: string; required?: boolean }
type Answer = string | number | string[] | Record<string, string>
type Response = { user_id: string; answers: Record<string, Answer>; submitted_at: string | null }

const TYPE_HINT: Record<QType, string> = {
  text: '', rating: '1 = low, 10 = high', number: '', yesno: '', choice: 'Pick one', multi: 'Pick all that apply', vote: 'Vote on each option', date: '',
}
const VOTES: { key: 'for' | 'against' | 'abstain'; label: string; on: string }[] = [
  { key: 'for', label: 'For', on: 'bg-green-100 text-green-700 border-green-300' },
  { key: 'against', label: 'Against', on: 'bg-red-100 text-red-700 border-red-300' },
  { key: 'abstain', label: 'Abstain', on: 'bg-gray-200 text-gray-700 border-gray-300' },
]
const pill = (on: boolean) => `px-3 py-1.5 rounded-lg border text-sm font-medium ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`

function fmt(q: Q, v: Answer | undefined): string {
  if (v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${x}`).join('; ')
  if (q.type === 'yesno') return v === 'yes' ? 'Yes' : 'No'
  if (q.type === 'number') return `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 })}${q.unit ? ` ${q.unit}` : ''}`
  return String(v)
}

function Bar({ label, count, total, names, tone = 'bg-blue-600' }: { label: string; count: number; total: number; names: string[]; tone?: string }) {
  return (
    <li className="text-sm">
      <div className="flex items-center gap-3">
        <span className="w-44 shrink-0 truncate" title={label}>{label}</span>
        <span className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden"><span className={`block h-full ${tone}`} style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }} /></span>
        <span className="w-10 text-right font-semibold tabular-nums">{count}</span>
      </div>
      {names.length > 0 && <div className="text-xs text-gray-500 ml-[11.75rem]">{names.join(', ')}</div>}
    </li>
  )
}

function Results({ q, submitted, nameOf, peopleById }: { q: Q; submitted: Response[]; nameOf: (id: string) => string; peopleById: Map<string, Person> }) {
  const answered = submitted.filter(r => r.answers[q.id] !== undefined && r.answers[q.id] !== '')

  if (q.type === 'choice' || q.type === 'multi') {
    return (
      <ul className="space-y-2">
        {(q.options ?? []).map(o => {
          const who = answered.filter(r => (q.type === 'choice' ? r.answers[q.id] === o : (r.answers[q.id] as string[]).includes(o))).map(r => nameOf(r.user_id))
          return <Bar key={o} label={o} count={who.length} total={answered.length} names={who} />
        })}
      </ul>
    )
  }
  if (q.type === 'yesno') {
    const yes = answered.filter(r => r.answers[q.id] === 'yes').map(r => nameOf(r.user_id))
    const no = answered.filter(r => r.answers[q.id] === 'no').map(r => nameOf(r.user_id))
    return <ul className="space-y-2"><Bar label="Yes" count={yes.length} total={answered.length} names={yes} tone="bg-green-600" /><Bar label="No" count={no.length} total={answered.length} names={no} tone="bg-red-500" /></ul>
  }
  if (q.type === 'vote') {
    return (
      <ul className="space-y-3">
        {(q.options ?? []).map(o => {
          const by = (k: string) => answered.filter(r => (r.answers[q.id] as Record<string, string>)[o] === k).map(r => nameOf(r.user_id))
          const f = by('for'), a = by('against'), ab = by('abstain')
          const verdict = f.length > a.length ? 'Leading' : f.length < a.length ? 'Behind' : f.length ? 'Tied' : ''
          return (
            <li key={o} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5"><span className="font-semibold text-sm">{o}</span>{verdict && <span className="text-[11px] font-bold uppercase text-gray-500">{verdict}</span>}</div>
              <ul className="space-y-1.5">
                <Bar label="For" count={f.length} total={answered.length} names={f} tone="bg-green-600" />
                <Bar label="Against" count={a.length} total={answered.length} names={a} tone="bg-red-500" />
                <Bar label="Abstain" count={ab.length} total={answered.length} names={ab} tone="bg-gray-400" />
              </ul>
            </li>
          )
        })}
      </ul>
    )
  }
  if (q.type === 'rating' || q.type === 'number') {
    const nums = answered.map(r => r.answers[q.id] as number)
    const sum = nums.reduce((s, n) => s + n, 0)
    const stat = (label: string, v: number | null) => (
      <div className="rounded-lg border px-3 py-1.5"><div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div><div className="font-bold tabular-nums">{v === null ? '—' : Number(v.toLocaleString('en-US', { maximumFractionDigits: 2 }).replace(/,/g, ''))}{v !== null && q.unit ? ` ${q.unit}` : ''}</div></div>
    )
    return (
      <div>
        <div className="flex flex-wrap gap-2 mb-3">
          {stat('Average', nums.length ? sum / nums.length : null)}
          {q.type === 'number' && stat('Total', nums.length ? sum : null)}
          {stat('Lowest', nums.length ? Math.min(...nums) : null)}
          {stat('Highest', nums.length ? Math.max(...nums) : null)}
        </div>
        <ul className="space-y-1">{answered.map(r => <li key={r.user_id} className="flex items-center gap-2 text-sm"><Avatar person={peopleById.get(r.user_id)} size="sm" /><span className="w-32 truncate text-gray-500">{nameOf(r.user_id)}</span><b>{fmt(q, r.answers[q.id])}</b></li>)}</ul>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {submitted.map(r => (
        <li key={r.user_id} className="flex items-start gap-2 text-sm">
          <Avatar person={peopleById.get(r.user_id)} size="sm" />
          <span className="w-32 shrink-0 truncate text-gray-500">{nameOf(r.user_id)}</span>
          <span className="whitespace-pre-wrap">{r.answers[q.id] != null && r.answers[q.id] !== '' ? fmt(q, r.answers[q.id]) : <span className="text-gray-300">—</span>}</span>
        </li>
      ))}
    </ul>
  )
}

export default function PrepSessionView({
  sessionId, meetingId, meetingName, docName, questions, dueDate, attendeeIds, responses, people, myId,
}: {
  sessionId: string; meetingId: string; meetingName: string; docName: string; questions: Q[]; dueDate: string
  attendeeIds: string[]; responses: Response[]; people: Person[]; myId: string
}) {
  const peopleById = new Map(people.map(p => [p.id, p]))
  const nameOf = (id: string) => peopleById.get(id)?.full_name ?? '?'
  const mine = responses.find(r => r.user_id === myId)
  const isAttendee = attendeeIds.includes(myId)
  const [answers, setAnswers] = useState<Record<string, Answer>>(mine?.answers ?? {})
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const [msg, setMsg] = useState('')

  const submittedResponses = responses.filter(r => r.submitted_at)
  const waiting = attendeeIds.filter(id => !submittedResponses.some(r => r.user_id === id))

  const set = (id: string, v: Answer | undefined) => setAnswers(prev => {
    const next = { ...prev }
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete next[id]
    else next[id] = v
    return next
  })

  async function save(submit: boolean) {
    setBusy(submit ? 'submit' : 'save')
    setMsg('')
    const ok = await act(async () => { await savePrepResponse(sessionId, answers, submit); return true })
    setBusy(null)
    if (ok) setMsg(submit ? 'Submitted. Thank you!' : 'Draft saved.')
  }

  function field(q: Q) {
    const v = answers[q.id]
    switch (q.type) {
      case 'text':
        return <textarea value={(v as string) ?? ''} onChange={e => set(q.id, e.target.value)} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
      case 'rating':
        return <div className="mt-1 flex flex-wrap gap-1.5">{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <button key={n} type="button" onClick={() => set(q.id, v === n ? undefined : n)} className={`w-9 h-9 rounded-lg text-sm font-semibold border ${v === n ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>{n}</button>)}</div>
      case 'number':
        return <div className="mt-1 flex items-center gap-2"><input type="number" step="any" value={(v as number | undefined) ?? ''} onChange={e => set(q.id, e.target.value === '' ? undefined : Number(e.target.value))} className="w-40 border rounded-lg px-3 py-2 text-sm font-normal" />{q.unit && <span className="text-sm text-gray-500">{q.unit}</span>}</div>
      case 'yesno':
        return <div className="mt-1 flex gap-2">{(['yes', 'no'] as const).map(o => <button key={o} type="button" onClick={() => set(q.id, v === o ? undefined : o)} className={pill(v === o)}>{o === 'yes' ? 'Yes' : 'No'}</button>)}</div>
      case 'date':
        return <input type="date" value={(v as string) ?? ''} onChange={e => set(q.id, e.target.value)} className="mt-1 border rounded-lg px-3 py-2 text-sm font-normal" />
      case 'choice':
        return <div className="mt-1 space-y-1.5">{(q.options ?? []).map(o => <label key={o} className="flex items-center gap-2 text-sm font-normal cursor-pointer"><input type="radio" name={q.id} checked={v === o} onChange={() => set(q.id, o)} /> {o}</label>)}</div>
      case 'multi': {
        const picked = Array.isArray(v) ? v : []
        return <div className="mt-1 space-y-1.5">{(q.options ?? []).map(o => <label key={o} className="flex items-center gap-2 text-sm font-normal cursor-pointer"><input type="checkbox" checked={picked.includes(o)} onChange={() => set(q.id, picked.includes(o) ? picked.filter(x => x !== o) : [...picked, o])} /> {o}</label>)}</div>
      }
      case 'vote': {
        const votes = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, string>
        return (
          <ul className="mt-1 space-y-2">
            {(q.options ?? []).map(o => (
              <li key={o} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                <span className="flex-1 min-w-40 text-sm font-normal">{o}</span>
                <div className="flex gap-1">{VOTES.map(x => <button key={x.key} type="button" onClick={() => { const next = { ...votes }; if (next[o] === x.key) delete next[o]; else next[o] = x.key; set(q.id, next) }} className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${votes[o] === x.key ? x.on : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{x.label}</button>)}</div>
              </li>
            ))}
          </ul>
        )
      }
    }
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-6xl mx-auto">
      <Link href="/meetings/session-prep" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"><ArrowLeft className="w-4 h-4" /> All prep sessions</Link>
      <h1 className="text-2xl font-bold">{docName}</h1>
      <p className="text-sm text-gray-500 mb-6">For <Link href={`/meetings/${meetingId}`} className="text-blue-600 hover:underline">{meetingName}</Link> · due {dueDate} · {submittedResponses.length}/{attendeeIds.length} submitted</p>

      {isAttendee ? (
        <section className="border rounded-xl bg-white shadow-sm p-5 mb-6">
          <h2 className="font-bold mb-4">Your response {mine?.submitted_at && <span className="ml-2 text-xs font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Submitted</span>}</h2>
          <div className="space-y-5">
            {questions.map(q => (
              <div key={q.id} className="text-sm font-medium">
                <div>{q.label}{q.required && <span className="text-red-500"> *</span>} {TYPE_HINT[q.type] && <span className="text-xs text-gray-400 font-normal">({TYPE_HINT[q.type]})</span>}</div>
                {field(q)}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button onClick={() => save(false)} disabled={busy !== null} className="px-4 py-2 text-sm rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
            <button onClick={() => save(true)} disabled={busy !== null} className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy === 'submit' ? 'Submitting…' : mine?.submitted_at ? 'Resubmit' : 'Submit'}</button>
            {msg && <span className="text-sm text-green-700">{msg}</span>}
          </div>
        </section>
      ) : (
        <p className="text-sm text-gray-500 mb-6">You are not an attendee of this meeting, so you can read but not respond.</p>
      )}

      <section>
        <h2 className="font-bold mb-3">Results</h2>
        {submittedResponses.length === 0 ? (
          <div className="border border-dashed rounded-xl p-8 text-center bg-white text-sm text-gray-500">Nobody has submitted yet.</div>
        ) : (
          <div className="space-y-4">
            {questions.map(q => (
              <div key={q.id} className="border rounded-xl bg-white shadow-sm p-4">
                <div className="text-sm font-semibold mb-2">{q.label}</div>
                <Results q={q} submitted={submittedResponses} nameOf={nameOf} peopleById={peopleById} />
              </div>
            ))}
          </div>
        )}
        {waiting.length > 0 && <p className="text-xs text-gray-500 mt-3">Waiting for: {waiting.map(nameOf).join(', ')}</p>}
      </section>
    </div>
  )
}
