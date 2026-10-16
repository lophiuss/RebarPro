'use client'

import { confirmDialog } from '../../ui/feedback'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, Trash2 } from 'lucide-react'
import { saveOneOnOneAnswers, setOneOnOneStatus, deleteOneOnOne } from '../actions'
import { act } from '../../act'
import Avatar from '../../Avatar'
import { ONE_ON_ONE_QUESTIONS, type OneOnOneAnswers, type OneOnOneSide, type Person } from '@/lib/meetings'

type Session = { id: string; manager_id: string; report_id: string; quarter: string; status: 'draft' | 'complete'; answers: OneOnOneAnswers }
type Rating = 'plus' | 'plus_minus' | 'minus'

const RATING_LABEL: Record<Rating, string> = { plus: '+', plus_minus: '+/−', minus: '−' }
const RATING_STYLE: Record<Rating, string> = {
  plus: 'bg-green-100 text-green-700 border-green-300',
  plus_minus: 'bg-amber-100 text-amber-700 border-amber-300',
  minus: 'bg-red-100 text-red-700 border-red-300',
}
const GWC = [
  { key: 'gets_it', label: 'Gets it' },
  { key: 'wants_it', label: 'Wants it' },
  { key: 'capacity', label: 'Capacity' },
] as const

const sections = Array.from(new Set(ONE_ON_ONE_QUESTIONS.map(q => q.section)))

function ReadOnlySide({ side, coreValues }: { side: OneOnOneSide | undefined; coreValues: string[] }) {
  if (!side || Object.keys(side).length === 0) return <p className="text-sm text-gray-500">Nothing written yet.</p>
  return (
    <div className="space-y-4 text-sm">
      {sections.map(sec => (
        <div key={sec}>
          <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-1">{sec}</div>
          <ul className="space-y-2">
            {ONE_ON_ONE_QUESTIONS.filter(q => q.section === sec).map(q => (
              <li key={q.id}>
                <div className="text-gray-500">{q.label}</div>
                <div className="whitespace-pre-wrap">{side[q.id] != null && side[q.id] !== '' ? String(side[q.id]) : <span className="text-gray-300">—</span>}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {coreValues.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-1">Core values</div>
          <ul className="space-y-1">
            {coreValues.map(cv => {
              const r = side.core_values?.[cv] as Rating | undefined
              return <li key={cv} className="flex items-center gap-2"><span className="flex-1">{cv}</span>{r ? <span className={`text-xs font-bold border rounded px-1.5 py-0.5 ${RATING_STYLE[r]}`}>{RATING_LABEL[r]}</span> : <span className="text-gray-300">—</span>}</li>
            })}
          </ul>
        </div>
      )}
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-1">Right seat</div>
        <ul className="flex gap-4">
          {GWC.map(g => {
            const v = side.gwc?.[g.key]
            return <li key={g.key}>{g.label}: {v === true ? <b className="text-green-600">Yes</b> : v === false ? <b className="text-red-600">No</b> : <span className="text-gray-300">—</span>}</li>
          })}
        </ul>
      </div>
    </div>
  )
}

export default function OneOnOneForm({ session, people, coreValues, myId }: { session: Session; people: Person[]; coreValues: string[]; myId: string }) {
  const router = useRouter()
  const peopleById = new Map(people.map(p => [p.id, p]))
  const me: 'manager' | 'report' | null = session.manager_id === myId ? 'manager' : session.report_id === myId ? 'report' : null
  const other: 'manager' | 'report' = me === 'report' ? 'manager' : 'report'
  const locked = session.status === 'complete'
  const [side, setSide] = useState<OneOnOneSide>(() => (me ? { ...(session.answers[me] ?? {}) } : {}))
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const nameOf = (id: string) => peopleById.get(id)?.full_name ?? 'Unknown'

  async function save() {
    setSaving(true)
    const ok = await act(async () => { await saveOneOnOneAnswers(session.id, side); return true })
    setSaving(false)
    if (ok) setSavedAt(new Date())
  }

  async function setStatus(status: 'draft' | 'complete') {
    if (me === 'manager' && status === 'complete' && !(await confirmDialog('Mark this conversation complete? Both people will be unable to edit it until you reopen it.'))) return
    const ok = await act(async () => { await setOneOnOneStatus(session.id, status); return true })
    if (ok) router.refresh()
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1600px] mx-auto">
      <Link href="/meetings/one-on-one" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"><ArrowLeft className="w-4 h-4" /> All conversations</Link>
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold">{session.quarter.replace('-', ' ')} 1:1</h1>
        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${locked ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{locked ? 'Complete' : 'In progress'}</span>
        {me === 'manager' && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setStatus(locked ? 'draft' : 'complete')} className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50">{locked ? 'Reopen' : 'Mark complete'}</button>
            <button onClick={async () => { if (await confirmDialog('Delete this conversation for both people?')) { await (act(async () => { await deleteOneOnOne(session.id); router.push('/meetings/one-on-one') })) } }} aria-label="Delete" className="p-2 -m-2 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-6 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Private to {nameOf(session.manager_id)} and {nameOf(session.report_id)}.</p>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Your side (editable) or the manager's side when viewing as an admin */}
        <section className="border rounded-xl bg-white shadow-sm p-5">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <Avatar person={peopleById.get(me ? myId : session.manager_id)} size="sm" /> {me ? 'Your answers' : `${nameOf(session.manager_id)}'s answers`}
          </h2>
          {me && !locked ? (
            <div className="space-y-5">
              {sections.map(sec => (
                <div key={sec}>
                  <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-2">{sec}</div>
                  <div className="space-y-3">
                    {ONE_ON_ONE_QUESTIONS.filter(q => q.section === sec).map(q => (
                      <label key={q.id} className="block text-sm font-medium">
                        {q.label}
                        {q.type === 'text' ? (
                          <textarea value={(side[q.id] as string) ?? ''} onChange={e => setSide({ ...side, [q.id]: e.target.value })} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
                        ) : (
                          <input type="number" min={1} max={10} value={(side[q.id] as number | undefined) ?? ''} onChange={e => setSide({ ...side, [q.id]: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-24 border rounded-lg px-3 py-2 text-sm font-normal" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {coreValues.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-2">Core values</div>
                  <ul className="space-y-2">
                    {coreValues.map(cv => (
                      <li key={cv} className="flex items-center gap-3">
                        <span className="flex-1 text-sm">{cv}</span>
                        <div className="flex gap-1">
                          {(['plus', 'plus_minus', 'minus'] as Rating[]).map(r => (
                            <button key={r} type="button" onClick={() => setSide({ ...side, core_values: { ...side.core_values, [cv]: r } })}
                              className={`min-w-10 text-sm font-bold border rounded-lg px-2 py-1 ${side.core_values?.[cv] === r ? RATING_STYLE[r] : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{RATING_LABEL[r]}</button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-2">Right seat</div>
                <ul className="space-y-2">
                  {GWC.map(g => (
                    <li key={g.key} className="flex items-center gap-3">
                      <span className="flex-1 text-sm">{g.label}</span>
                      <div className="flex gap-1">
                        {([true, false] as const).map(val => (
                          <button key={String(val)} type="button" onClick={() => setSide({ ...side, gwc: { ...side.gwc, [g.key]: val } })}
                            className={`min-w-12 text-sm font-semibold border rounded-lg px-3 py-1 ${side.gwc?.[g.key] === val ? (val ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300') : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{val ? 'Yes' : 'No'}</button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button onClick={save} disabled={saving} className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save my answers'}</button>
                {savedAt && <span className="text-sm text-green-700">Saved {savedAt.toLocaleTimeString('en-GB', { timeStyle: 'short' })}</span>}
              </div>
            </div>
          ) : (
            <ReadOnlySide side={me ? session.answers[me] : session.answers.manager} coreValues={coreValues} />
          )}
        </section>

        <section className="border rounded-xl bg-white shadow-sm p-5">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <Avatar person={peopleById.get(me ? (me === 'manager' ? session.report_id : session.manager_id) : session.report_id)} size="sm" />
            {nameOf(me ? (me === 'manager' ? session.report_id : session.manager_id) : session.report_id)}&apos;s answers
          </h2>
          <ReadOnlySide side={me ? session.answers[other] : session.answers.report} coreValues={coreValues} />
        </section>
      </div>
    </div>
  )
}
