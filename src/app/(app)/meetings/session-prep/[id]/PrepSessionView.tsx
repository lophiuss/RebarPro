'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check } from 'lucide-react'
import { savePrepResponse } from '../actions'
import { act } from '../../act'
import Avatar from '../../Avatar'
import type { Person } from '@/lib/meetings'

type Q = { id: string; label: string; type: 'text' | 'rating' }
type Response = { user_id: string; answers: Record<string, string | number>; submitted_at: string | null }

export default function PrepSessionView({
  sessionId, meetingId, meetingName, docName, questions, dueDate, attendeeIds, responses, people, myId,
}: {
  sessionId: string; meetingId: string; meetingName: string; docName: string; questions: Q[]; dueDate: string
  attendeeIds: string[]; responses: Response[]; people: Person[]; myId: string
}) {
  const peopleById = new Map(people.map(p => [p.id, p]))
  const mine = responses.find(r => r.user_id === myId)
  const isAttendee = attendeeIds.includes(myId)
  const [answers, setAnswers] = useState<Record<string, string | number>>(mine?.answers ?? {})
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const [msg, setMsg] = useState('')

  const submittedResponses = responses.filter(r => r.submitted_at)
  const waiting = attendeeIds.filter(id => !submittedResponses.some(r => r.user_id === id))

  async function save(submit: boolean) {
    setBusy(submit ? 'submit' : 'save')
    setMsg('')
    const ok = await act(async () => { await savePrepResponse(sessionId, answers, submit); return true })
    setBusy(null)
    if (ok) setMsg(submit ? 'Submitted. Thank you!' : 'Draft saved.')
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Link href="/meetings/session-prep" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"><ArrowLeft className="w-4 h-4" /> All prep sessions</Link>
      <h1 className="text-2xl font-bold">{docName}</h1>
      <p className="text-sm text-gray-500 mb-6">For <Link href={`/meetings/${meetingId}`} className="text-blue-600 hover:underline">{meetingName}</Link> · due {dueDate} · {submittedResponses.length}/{attendeeIds.length} submitted</p>

      {isAttendee ? (
        <section className="border rounded-xl bg-white p-5 mb-6">
          <h2 className="font-bold mb-4">Your response {mine?.submitted_at && <span className="ml-2 text-xs font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Submitted</span>}</h2>
          <div className="space-y-4">
            {questions.map(q => (
              <label key={q.id} className="block text-sm font-medium">
                {q.label}
                {q.type === 'text' ? (
                  <textarea value={(answers[q.id] as string) ?? ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
                ) : (
                  <input type="number" min={1} max={10} value={(answers[q.id] as number | undefined) ?? ''} onChange={e => { const next = { ...answers }; if (e.target.value === '') delete next[q.id]; else next[q.id] = Number(e.target.value); setAnswers(next) }} className="mt-1 w-24 border rounded-lg px-3 py-2 text-sm font-normal" />
                )}
              </label>
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
        <h2 className="font-bold mb-3">Responses</h2>
        {submittedResponses.length === 0 ? (
          <div className="border border-dashed rounded-xl p-8 text-center bg-white text-sm text-gray-500">Nobody has submitted yet.</div>
        ) : (
          <div className="space-y-4">
            {questions.map(q => (
              <div key={q.id} className="border rounded-xl bg-white p-4">
                <div className="text-sm font-semibold mb-2">{q.label}</div>
                <ul className="space-y-2">
                  {submittedResponses.map(r => (
                    <li key={r.user_id} className="flex items-start gap-2 text-sm">
                      <Avatar person={peopleById.get(r.user_id)} size="sm" />
                      <span className="w-32 shrink-0 truncate text-gray-500">{peopleById.get(r.user_id)?.full_name}</span>
                      <span className="whitespace-pre-wrap">{r.answers[q.id] != null && r.answers[q.id] !== '' ? String(r.answers[q.id]) : <span className="text-gray-300">—</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {waiting.length > 0 && <p className="text-xs text-gray-500 mt-3">Waiting for: {waiting.map(id => peopleById.get(id)?.full_name ?? '?').join(', ')}</p>}
      </section>
    </div>
  )
}
