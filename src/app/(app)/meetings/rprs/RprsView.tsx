'use client'

import { useMemo, useState } from 'react'
import { X, History, Trash2 } from 'lucide-react'
import { saveAssessment, deleteAssessment } from './actions'
import { act } from '../act'
import Avatar from '../Avatar'
import type { Person } from '@/lib/meetings'

type Rating = 'plus' | 'plus_minus' | 'minus'
type Gwc = { gets_it: boolean | null; wants_it: boolean | null; capacity: boolean | null }
type Assessment = { id: string; person_id: string; assessor_id: string; assessed_on: string; core_values: Record<string, Rating>; gwc: Partial<Gwc>; notes: string | null; created_at: string }

const RATING_LABEL: Record<Rating, string> = { plus: '+', plus_minus: '+/−', minus: '−' }
const RATING_STYLE: Record<Rating, string> = {
  plus: 'bg-green-100 text-green-700 border-green-300',
  plus_minus: 'bg-amber-100 text-amber-700 border-amber-300',
  minus: 'bg-red-100 text-red-700 border-red-300',
}
const GWC: { key: keyof Gwc; label: string }[] = [
  { key: 'gets_it', label: 'Gets it' },
  { key: 'wants_it', label: 'Wants it' },
  { key: 'capacity', label: 'Capacity' },
]

// Right Person = no "−" on any core value and a "+" on at least half of them.
// Right Seat = Gets it, Wants it and Capacity all yes.
function verdict(a: Assessment | undefined, coreValues: string[]) {
  if (!a) return { label: 'Not assessed', style: 'bg-gray-100 text-gray-500' }
  const ratings = coreValues.map(v => a.core_values?.[v])
  const answered = ratings.filter(Boolean) as Rating[]
  const gwcDone = GWC.every(g => a.gwc?.[g.key] === true || a.gwc?.[g.key] === false)
  if (answered.length < coreValues.length || !gwcDone) return { label: 'Incomplete', style: 'bg-gray-100 text-gray-500' }
  const rightPerson = !answered.includes('minus') && answered.filter(r => r === 'plus').length * 2 >= coreValues.length
  const rightSeat = GWC.every(g => a.gwc?.[g.key] === true)
  if (rightPerson && rightSeat) return { label: 'Right person, right seat', style: 'bg-green-100 text-green-700' }
  if (rightPerson) return { label: 'Right person, wrong seat', style: 'bg-amber-100 text-amber-700' }
  return { label: 'Wrong person', style: 'bg-red-100 text-red-700' }
}

export default function RprsView({
  coreValues, assessments, people, seatsByPerson, myId, canAssess,
}: { coreValues: string[]; assessments: Assessment[]; people: Person[]; seatsByPerson: Record<string, string[]>; myId: string; canAssess: boolean }) {
  const [onlySeated, setOnlySeated] = useState(true)
  const [form, setForm] = useState<{ person: Person; core_values: Record<string, Rating>; gwc: Gwc; notes: string } | null>(null)
  const [history, setHistory] = useState<Person | null>(null)
  const [saving, setSaving] = useState(false)

  const latest = useMemo(() => {
    const m = new Map<string, Assessment>()
    for (const a of assessments) if (!m.has(a.person_id)) m.set(a.person_id, a) // already newest-first
    return m
  }, [assessments])

  const rows = people.filter(p => (onlySeated ? !!seatsByPerson[p.id] : true))

  function open(p: Person) {
    const prev = latest.get(p.id)
    setForm({
      person: p,
      core_values: { ...(prev?.core_values ?? {}) },
      gwc: { gets_it: prev?.gwc?.gets_it ?? null, wants_it: prev?.gwc?.wants_it ?? null, capacity: prev?.gwc?.capacity ?? null },
      notes: '',
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    const ok = await act(async () => {
      await saveAssessment({ person_id: form.person.id, core_values: form.core_values, gwc: form.gwc, notes: form.notes })
      return true
    })
    setSaving(false)
    if (ok) setForm(null)
  }

  if (coreValues.length === 0) {
    return (
      <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">
        Add your core values in Meetings Settings first. Each person is rated against them.
      </div>
    )
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer w-fit">
        <input type="checkbox" checked={onlySeated} onChange={e => setOnlySeated(e.target.checked)} /> Only people in seats on the org chart
      </label>

      <div className="border rounded-xl bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Person</th>
              {coreValues.map((v, i) => <th key={v} className="px-2 py-2 font-semibold max-w-32" title={v}><span className="block truncate">{i + 1}. {v.split(':')[0]}</span></th>)}
              {GWC.map(g => <th key={g.key} className="px-2 py-2 font-semibold whitespace-nowrap">{g.label}</th>)}
              <th className="px-3 py-2 font-semibold text-left">Result</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && <tr><td colSpan={coreValues.length + 6} className="px-3 py-8 text-center text-gray-400">No people to show.</td></tr>}
            {rows.map(p => {
              const a = latest.get(p.id)
              const v = verdict(a, coreValues)
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar person={p} size="sm" />
                      <div className="min-w-0"><div className="font-medium truncate">{p.full_name}</div><div className="text-[11px] text-gray-400 truncate">{(seatsByPerson[p.id] ?? []).join(', ')}</div></div>
                    </div>
                  </td>
                  {coreValues.map(cv => {
                    const r = a?.core_values?.[cv]
                    return <td key={cv} className="px-2 py-2 text-center">{r ? <span className={`inline-block min-w-9 text-xs font-bold border rounded px-1.5 py-0.5 ${RATING_STYLE[r]}`}>{RATING_LABEL[r]}</span> : <span className="text-gray-300">—</span>}</td>
                  })}
                  {GWC.map(g => {
                    const val = a?.gwc?.[g.key]
                    return <td key={g.key} className="px-2 py-2 text-center">{val === true ? <span className="text-green-600 font-bold">Y</span> : val === false ? <span className="text-red-600 font-bold">N</span> : <span className="text-gray-300">—</span>}</td>
                  })}
                  <td className="px-3 py-2"><span className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${v.style}`}>{v.label}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <button onClick={() => setHistory(p)} aria-label="History" title="History" className="text-gray-400 hover:text-blue-600 mr-2"><History className="w-4 h-4 inline" /></button>
                    {canAssess && <button onClick={() => open(p)} className="px-3 py-1 text-xs font-semibold rounded-lg border bg-white hover:bg-gray-50">{a ? 'Reassess' : 'Assess'}</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg flex items-center gap-2"><Avatar person={form.person} size="sm" /> {form.person.full_name}</h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <div className="text-sm font-semibold mb-2">Core values</div>
                <p className="text-xs text-gray-500 mb-2">+ most of the time · +/− some of the time · − rarely</p>
                <ul className="space-y-2">
                  {coreValues.map(cv => (
                    <li key={cv} className="flex items-center gap-3">
                      <span className="flex-1 text-sm">{cv}</span>
                      <div className="flex gap-1">
                        {(['plus', 'plus_minus', 'minus'] as Rating[]).map(r => (
                          <button key={r} type="button" onClick={() => setForm({ ...form, core_values: { ...form.core_values, [cv]: r } })}
                            className={`min-w-10 text-sm font-bold border rounded-lg px-2 py-1 ${form.core_values[cv] === r ? RATING_STYLE[r] : 'bg-white text-gray-400 hover:bg-gray-50'}`}>{RATING_LABEL[r]}</button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-sm font-semibold mb-2">Right seat</div>
                <ul className="space-y-2">
                  {GWC.map(g => (
                    <li key={g.key} className="flex items-center gap-3">
                      <span className="flex-1 text-sm">{g.label}</span>
                      <div className="flex gap-1">
                        {([true, false] as const).map(val => (
                          <button key={String(val)} type="button" onClick={() => setForm({ ...form, gwc: { ...form.gwc, [g.key]: val } })}
                            className={`min-w-12 text-sm font-semibold border rounded-lg px-3 py-1 ${form.gwc[g.key] === val ? (val ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300') : 'bg-white text-gray-400 hover:bg-gray-50'}`}>{val ? 'Yes' : 'No'}</button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="block text-sm font-semibold">Notes <span className="text-gray-400 font-normal">(optional)</span>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save assessment'}</button>
            </div>
          </form>
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">History · {history.full_name}</h2>
              <button onClick={() => setHistory(null)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <ul className="divide-y">
              {assessments.filter(a => a.person_id === history.id).length === 0 && <li className="px-5 py-8 text-center text-sm text-gray-400">No assessments yet.</li>}
              {assessments.filter(a => a.person_id === history.id).map(a => {
                const v = verdict(a, coreValues)
                return (
                  <li key={a.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{new Date(a.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })} <span className={`ml-2 text-xs font-semibold rounded-full px-2 py-0.5 ${v.style}`}>{v.label}</span></div>
                      {a.notes && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.notes}</p>}
                    </div>
                    {a.assessor_id === myId && <button onClick={() => confirm('Delete this assessment?') && act(() => deleteAssessment(a.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
