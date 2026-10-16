'use client'

import { confirmDialog } from '../ui/feedback'
import { useMemo, useState } from 'react'
import { X, History, Trash2, Info, Settings2, Plus } from 'lucide-react'
import { saveAssessment, deleteAssessment, saveSeatCriteria } from './actions'
import { act } from '../act'
import Avatar from '../Avatar'
import type { Person } from '@/lib/meetings'

type Rating = 'plus' | 'plus_minus' | 'minus'
type Dim = 'gets_it' | 'wants_it' | 'capacity'
type Criterion = { id: string; dimension: string; label: string }
type Item = { id: string; dimension: Dim; label: string; score: 0 | 1 | 2 }
type Gwc = {
  scored?: boolean; seat_id?: string; seat_title?: string | null; items?: Item[]
  totals?: { gets_it: number; wants_it: number; capacity: number; total: number; max: number; by_max: Record<Dim, number> }
  pass_score?: number; passed?: boolean
  // older assessments (yes / no)
  gets_it?: boolean | null; wants_it?: boolean | null; capacity?: boolean | null
}
type Assessment = {
  id: string; person_id: string; assessor_id: string; assessed_on: string
  core_values: Record<string, Rating>; gwc: Gwc; notes: string | null; created_at: string
}
type Scope = Record<string, { level: number; seats: string[]; seat_ids: string[]; roles: string[] }>
type SeatInfo = Record<string, { title: string; pass_score: number | null; can_edit: boolean }>

const RATING_LABEL: Record<Rating, string> = { plus: '+', plus_minus: '+/−', minus: '−' }
const RATING_STYLE: Record<Rating, string> = {
  plus: 'bg-green-100 text-green-700 border-green-300',
  plus_minus: 'bg-amber-100 text-amber-700 border-amber-300',
  minus: 'bg-red-100 text-red-700 border-red-300',
}
const DIMS: { key: Dim; label: string; hint: string }[] = [
  { key: 'gets_it', label: 'Gets it', hint: 'Understands the job, the culture and the pace of this seat.' },
  { key: 'wants_it', label: 'Wants it', hint: 'Truly wants this seat, not just the title or the pay.' },
  { key: 'capacity', label: 'Capacity', hint: 'Has the time, skills, knowledge and bandwidth to do it well.' },
]
const SCORES: { value: 0 | 1 | 2; label: string; on: string }[] = [
  { value: 2, label: 'Good (2)', on: 'bg-green-100 text-green-700 border-green-300' },
  { value: 1, label: 'So-so (1)', on: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 0, label: 'No (0)', on: 'bg-red-100 text-red-700 border-red-300' },
]
const REVIEW_DAYS = 90

// Right Person = no "−" on any core value and a "+" on at least half of them
// (when core values exist). Right Seat = total score reaches the expected score.
function verdict(a: Assessment | undefined, coreValues: string[]) {
  if (!a) return { label: 'Not assessed', style: 'bg-gray-100 text-gray-500', ok: false, attention: false }
  const answered = coreValues.map(v => a.core_values?.[v]).filter(Boolean) as Rating[]
  const valuesDone = answered.length >= coreValues.length
  const rightPerson = coreValues.length === 0 || (valuesDone && !answered.includes('minus') && answered.filter(r => r === 'plus').length * 2 >= coreValues.length)
  const g = a.gwc ?? {}
  if (g.scored && g.totals) {
    if (!valuesDone) return { label: 'Core values incomplete', style: 'bg-gray-100 text-gray-500', ok: false, attention: false }
    if (g.passed && rightPerson) return { label: `Pass · ${g.totals.total}/${g.totals.max}`, style: 'bg-green-100 text-green-700', ok: true, attention: false }
    if (g.passed) return { label: 'Values mismatch', style: 'bg-red-100 text-red-700', ok: false, attention: true }
    return { label: `Below expected · ${g.totals.total} of ${g.pass_score}`, style: 'bg-amber-100 text-amber-700', ok: false, attention: true }
  }
  // Older yes / no assessments.
  const done = (['gets_it', 'wants_it', 'capacity'] as Dim[]).every(k => g[k] === true || g[k] === false)
  if (!done || !valuesDone) return { label: 'Incomplete', style: 'bg-gray-100 text-gray-500', ok: false, attention: false }
  const failing = DIMS.filter(d => g[d.key] !== true).map(d => d.label)
  if (rightPerson && failing.length === 0) return { label: 'Right person, right seat', style: 'bg-green-100 text-green-700', ok: true, attention: false }
  if (rightPerson) return { label: `Seat at risk: ${failing.join(', ')}`, style: 'bg-amber-100 text-amber-700', ok: false, attention: true }
  return { label: 'Values mismatch', style: 'bg-red-100 text-red-700', ok: false, attention: true }
}

function daysSince(iso: string) {
  return Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86400000)
}

type Row = { person: Person; seatId: string; seatTitle: string; level: number }
type EditCrit = { id?: string; dimension: Dim; label: string }

export default function RprsView({
  coreValues, assessments, people, scope, seatInfo, criteriaBySeat, myId, canAssess, isBoss, mySeats,
}: {
  coreValues: string[]; assessments: Assessment[]; people: Person[]; scope: Scope; seatInfo: SeatInfo
  criteriaBySeat: Record<string, Criterion[]>
  myId: string; canAssess: boolean; isBoss: boolean; mySeats: number
}) {
  const [directOnly, setDirectOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ row: Row; scores: Record<string, number>; core_values: Record<string, Rating>; notes: string } | null>(null)
  const [setup, setSetup] = useState<{ seatId: string; title: string; criteria: EditCrit[]; pass: string } | null>(null)
  const [history, setHistory] = useState<Person | null>(null)
  const [saving, setSaving] = useState(false)

  // Newest assessment per person and seat (older ones without a seat count for any seat).
  const latest = useMemo(() => {
    const m = new Map<string, Assessment>()
    for (const a of assessments) {
      const key = a.gwc?.seat_id ? `${a.person_id}|${a.gwc.seat_id}` : `${a.person_id}|*`
      if (!m.has(key)) m.set(key, a) // already newest-first
    }
    return m
  }, [assessments])
  const lastFor = (r: Row) => latest.get(`${r.person.id}|${r.seatId}`) ?? latest.get(`${r.person.id}|*`)

  const rows: Row[] = people
    .filter(p => scope[p.id])
    .filter(p => !directOnly || scope[p.id].level === 1)
    .filter(p => !search.trim() || (p.full_name ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    .flatMap(p => scope[p.id].seat_ids.map((sid, i) => ({ person: p, seatId: sid, seatTitle: scope[p.id].seats[i], level: scope[p.id].level })))
    .sort((a, b) => (a.level - b.level) || (a.person.full_name ?? '').localeCompare(b.person.full_name ?? ''))

  const stats = useMemo(() => {
    let ok = 0, attention = 0, due = 0
    for (const r of rows) {
      const a = lastFor(r)
      const v = verdict(a, coreValues)
      if (v.ok) ok++
      if (v.attention) attention++
      if (!a || daysSince(a.created_at) > REVIEW_DAYS) due++
    }
    return { ok, attention, due }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, latest, coreValues])

  function openSetup(seatId: string) {
    const existing = criteriaBySeat[seatId] ?? []
    setSetup({
      seatId,
      title: seatInfo[seatId]?.title ?? 'Seat',
      criteria: existing.length ? existing.map(c => ({ id: c.id, dimension: c.dimension as Dim, label: c.label })) : DIMS.map(d => ({ dimension: d.key, label: '' })),
      pass: seatInfo[seatId]?.pass_score != null ? String(seatInfo[seatId].pass_score) : '',
    })
  }

  async function saveSetup(e: React.FormEvent) {
    e.preventDefault()
    if (!setup) return
    setSaving(true)
    const ok = await act(async () => {
      await saveSeatCriteria({ seat_id: setup.seatId, pass_score: setup.pass.trim() === '' ? null : Number(setup.pass), criteria: setup.criteria })
      return true
    })
    setSaving(false)
    if (ok) setSetup(null)
  }

  function openAssess(r: Row) {
    const prev = lastFor(r)
    setForm({ row: r, scores: {}, core_values: { ...(prev?.core_values ?? {}) }, notes: '' })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    const ok = await act(async () => {
      await saveAssessment({ person_id: form.row.person.id, seat_id: form.row.seatId, scores: form.scores, core_values: form.core_values, notes: form.notes })
      return true
    })
    setSaving(false)
    if (ok) setForm(null)
  }

  if (!canAssess) {
    return (
      <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">
        This page is for managers and the boss. Ask a Meetings admin to give you the <b>manager</b> role to review the people below your seat.
      </div>
    )
  }

  const tile = (label: string, value: number, tone: string) => (
    <div className="rounded-xl border bg-white shadow-sm px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div><div className={`text-2xl font-bold ${tone}`}>{value}</div></div>
  )

  const formCriteria = form ? criteriaBySeat[form.row.seatId] ?? [] : []
  const formTotal = form ? formCriteria.reduce((s, c) => s + (form.scores[c.id] ?? 0), 0) : 0
  const formMax = formCriteria.length * 2
  const formPass = form ? seatInfo[form.row.seatId]?.pass_score ?? Math.ceil(formMax * 0.75) : 0
  const formComplete = form ? formCriteria.length > 0 && formCriteria.every(c => form.scores[c.id] !== undefined) : false
  const setupMax = setup ? setup.criteria.filter(c => c.label.trim()).length * 2 : 0

  return (
    <div>
      {coreValues.length === 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>To also rate each person against your <b>core values</b> (the “right person” half), add them in Meetings → Settings. The scored Gets it / Wants it / Capacity assessment works without them.</span>
        </div>
      )}

      {rows.length === 0 && !search ? (
        <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-600 space-y-2">
          <p className="font-semibold text-slate-800">No one to review yet</p>
          {isBoss ? (
            <p>Nobody is sitting in a seat on the Organizational Chart. Add seats and put people in them, then come back.</p>
          ) : mySeats === 0 ? (
            <p>You are not in a seat on the Organizational Chart, so there is no one “below” you. Ask a Meetings admin to place you in your seat.</p>
          ) : (
            <p>There is nobody in a seat below yours yet. Add seats beneath yours on the Organizational Chart.</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {tile('Seats in scope', rows.length, 'text-slate-900')}
            {tile('Passed', stats.ok, 'text-green-700')}
            {tile('Needs attention', stats.attention, 'text-amber-600')}
            {tile(`Not reviewed in ${REVIEW_DAYS} days`, stats.due, 'text-blue-700')}
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name" aria-label="Search name" className="border rounded-lg px-3 py-2 text-sm bg-white w-56" />
            {!isBoss && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={directOnly} onChange={e => setDirectOnly(e.target.checked)} /> Direct reports only
              </label>
            )}
            <span className="text-xs text-gray-500">{isBoss ? 'As the boss you can review everyone who holds a seat.' : 'Showing everyone in seats below yours.'}</span>
          </div>

          <div className="border rounded-xl bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Person / seat</th>
                  {coreValues.map((v, i) => <th key={v} className="px-2 py-2 font-semibold max-w-32" title={v}><span className="block truncate">{i + 1}. {v.split(':')[0]}</span></th>)}
                  {DIMS.map(d => <th key={d.key} className="px-2 py-2 font-semibold whitespace-nowrap">{d.label}</th>)}
                  <th className="px-2 py-2 font-semibold whitespace-nowrap">Total / pass</th>
                  <th className="px-3 py-2 font-semibold text-left">Result</th>
                  <th className="px-3 py-2 font-semibold text-left whitespace-nowrap">Last review</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 && <tr><td colSpan={coreValues.length + 8} className="px-3 py-8 text-center text-gray-500">No one matches.</td></tr>}
                {rows.map(r => {
                  const a = lastFor(r)
                  const v = verdict(a, coreValues)
                  const age = a ? daysSince(a.created_at) : null
                  const info = seatInfo[r.seatId]
                  const hasCriteria = (criteriaBySeat[r.seatId] ?? []).length > 0
                  const g = a?.gwc
                  return (
                    <tr key={`${r.person.id}|${r.seatId}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar person={r.person} size="sm" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.person.full_name}</div>
                            <div className="text-xs text-gray-500 truncate">{r.seatTitle}{r.level > 1 ? ` · level ${r.level} below` : r.level === 1 ? ' · direct report' : ''}</div>
                          </div>
                        </div>
                      </td>
                      {coreValues.map(cv => {
                        const rt = a?.core_values?.[cv]
                        return <td key={cv} className="px-2 py-2 text-center">{rt ? <span className={`inline-block min-w-9 text-xs font-bold border rounded px-1.5 py-0.5 ${RATING_STYLE[rt]}`}>{RATING_LABEL[rt]}</span> : <span className="text-gray-300">—</span>}</td>
                      })}
                      {DIMS.map(d => {
                        if (g?.scored && g.totals) return <td key={d.key} className="px-2 py-2 text-center tabular-nums font-medium">{g.totals[d.key]}<span className="text-gray-500 font-normal">/{g.totals.by_max[d.key]}</span></td>
                        const val = g?.[d.key]
                        return <td key={d.key} className="px-2 py-2 text-center">{val === true ? <span className="text-green-600 font-bold">Y</span> : val === false ? <span className="text-red-600 font-bold">N</span> : <span className="text-gray-300">—</span>}</td>
                      })}
                      <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap">
                        {g?.scored && g.totals ? <><b>{g.totals.total}</b><span className="text-gray-500">/{g.pass_score}</span></> : <span className="text-gray-300">{info?.pass_score != null ? `pass ${info.pass_score}` : '—'}</span>}
                      </td>
                      <td className="px-3 py-2"><span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${v.style}`}>{v.label}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{age === null ? <span className="text-gray-500">Never</span> : <span className={age > REVIEW_DAYS ? 'text-amber-700 font-semibold' : 'text-gray-500'}>{age === 0 ? 'Today' : `${age}d ago`}{age > REVIEW_DAYS ? ' · due' : ''}</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <button onClick={() => setHistory(r.person)} aria-label="History" title="History" className="text-gray-500 hover:text-blue-600 mr-2"><History className="w-4 h-4 inline" /></button>
                        {info?.can_edit && <button onClick={() => openSetup(r.seatId)} title="Write the Gets it / Wants it / Capacity criteria and the expected score" className="px-2.5 py-1 text-xs font-semibold rounded-lg border bg-white hover:bg-gray-50 mr-1.5 inline-flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" /> Criteria</button>}
                        {hasCriteria
                          ? <button onClick={() => openAssess(r)} className="px-3 py-1 text-xs font-semibold rounded-lg border bg-white hover:bg-gray-50">{a ? 'Reassess' : 'Assess'}</button>
                          : <span className="text-xs text-gray-500">{info?.can_edit ? 'Set criteria first' : 'No criteria yet'}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {setup && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={saveSetup} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">Criteria for “{setup.title}”</h2>
              <button type="button" onClick={() => setSetup(null)} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-5">
              <p className="text-sm text-gray-600">Write what you expect for each. When you assess someone in this seat you score each line <b>good (2), so-so (1) or no (0)</b>, and the total is compared with the expected score below.</p>
              {DIMS.map(d => (
                <div key={d.key}>
                  <div className="text-sm font-semibold">{d.label} <span className="text-xs text-gray-500 font-normal">{d.hint}</span></div>
                  <ul className="mt-2 space-y-1.5">
                    {setup.criteria.map((c, i) => c.dimension !== d.key ? null : (
                      <li key={i} className="flex gap-2">
                        <input value={c.label} onChange={e => setSetup({ ...setup, criteria: setup.criteria.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)) })} placeholder="e.g. Can explain the weekly production plan" className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
                        <button type="button" onClick={() => setSetup({ ...setup, criteria: setup.criteria.filter((_, idx) => idx !== i) })} aria-label="Remove criterion" className="p-2 -m-2 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => setSetup({ ...setup, criteria: [...setup.criteria, { dimension: d.key, label: '' }] })} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"><Plus className="w-3.5 h-3.5" /> Add to {d.label}</button>
                </div>
              ))}
              <div className="rounded-lg border bg-gray-50 px-3 py-3">
                <label className="text-sm font-semibold block">Expected score (the pass mark)
                  <div className="flex items-center gap-2 mt-1">
                    <input type="number" min={0} max={setupMax} value={setup.pass} onChange={e => setSetup({ ...setup, pass: e.target.value })} className="w-24 border rounded-lg px-3 py-1.5 text-sm font-normal" />
                    <span className="text-sm text-gray-600 font-normal">out of <b>{setupMax}</b> ({setup.criteria.filter(c => c.label.trim()).length} criteria × 2)</span>
                    {setupMax > 0 && <button type="button" onClick={() => setSetup({ ...setup, pass: String(Math.ceil(setupMax * 0.75)) })} className="text-xs text-blue-600 hover:underline font-normal">Use 75% ({Math.ceil(setupMax * 0.75)})</button>}
                  </div>
                </label>
                <p className="text-xs text-gray-500 mt-1">Leave empty to use 75% of the maximum.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setSetup(null)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save criteria'}</button>
            </div>
          </form>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg flex items-center gap-2"><Avatar person={form.row.person} size="sm" /> {form.row.person.full_name} <span className="text-sm font-normal text-gray-500">· {form.row.seatTitle}</span></h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-5">
              {scope[form.row.person.id]?.roles.length > 0 && (
                <details className="rounded-lg bg-gray-50 border px-3 py-2">
                  <summary className="text-sm font-semibold cursor-pointer">Roles of this seat</summary>
                  <ul className="mt-1 text-xs text-gray-600 list-disc list-inside space-y-0.5">{scope[form.row.person.id].roles.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </details>
              )}

              {coreValues.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">Right person: core values</div>
                  <p className="text-xs text-gray-500 mb-2">+ most of the time · +/− some of the time · − rarely</p>
                  <ul className="space-y-2">
                    {coreValues.map(cv => (
                      <li key={cv} className="flex items-center gap-3">
                        <span className="flex-1 text-sm">{cv}</span>
                        <div className="flex gap-1">
                          {(['plus', 'plus_minus', 'minus'] as Rating[]).map(rt => (
                            <button key={rt} type="button" onClick={() => setForm({ ...form, core_values: { ...form.core_values, [cv]: rt } })}
                              className={`min-w-10 text-sm font-bold border rounded-lg px-2 py-1 ${form.core_values[cv] === rt ? RATING_STYLE[rt] : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{RATING_LABEL[rt]}</button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {DIMS.map(d => {
                const list = formCriteria.filter(c => c.dimension === d.key)
                if (list.length === 0) return null
                const sub = list.reduce((s, c) => s + (form.scores[c.id] ?? 0), 0)
                return (
                  <div key={d.key}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <div className="text-sm font-semibold">{d.label}</div>
                      <div className="text-xs text-gray-500 tabular-nums">{sub} / {list.length * 2}</div>
                    </div>
                    <ul className="space-y-2">
                      {list.map(c => (
                        <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                          <span className="flex-1 min-w-48 text-sm">{c.label}</span>
                          <div className="flex gap-1">
                            {SCORES.map(sc => (
                              <button key={sc.value} type="button" onClick={() => setForm({ ...form, scores: { ...form.scores, [c.id]: sc.value } })}
                                className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${form.scores[c.id] === sc.value ? sc.on : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{sc.label}</button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}

              <div className={`rounded-lg border px-4 py-3 flex items-center gap-4 ${!formComplete ? 'bg-gray-50' : formTotal >= formPass ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="text-2xl font-bold tabular-nums">{formTotal}<span className="text-gray-500 text-base font-normal"> / {formMax}</span></div>
                <div className="text-sm">
                  <div>Expected score: <b>{formPass}</b></div>
                  <div className="font-semibold">{!formComplete ? 'Score every line to see the result' : formTotal >= formPass ? 'Pass' : `Below expected by ${formPass - formTotal}`}</div>
                </div>
              </div>

              <label className="block text-sm font-semibold">Overall notes <span className="text-gray-500 font-normal">(optional)</span>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button disabled={saving || !formComplete} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save assessment'}</button>
            </div>
          </form>
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">History · {history.full_name}</h2>
              <button onClick={() => setHistory(null)} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <ul className="divide-y">
              {assessments.filter(a => a.person_id === history.id).length === 0 && <li className="px-5 py-8 text-center text-sm text-gray-500">No assessments yet.</li>}
              {assessments.filter(a => a.person_id === history.id).map(a => {
                const v = verdict(a, coreValues)
                const g = a.gwc
                return (
                  <li key={a.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{new Date(a.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}{g?.seat_title ? ` · ${g.seat_title}` : ''} <span className={`ml-2 text-xs font-semibold rounded-full px-2 py-0.5 ${v.style}`}>{v.label}</span></div>
                      {g?.scored && g.totals ? (
                        <>
                          <div className="text-xs text-gray-500 mt-0.5">{DIMS.map(d => `${d.label} ${g.totals![d.key]}/${g.totals!.by_max[d.key]}`).join(' · ')} · total {g.totals.total}/{g.totals.max} (pass {g.pass_score})</div>
                          <ul className="mt-1 space-y-0.5">{(g.items ?? []).map(i => <li key={i.id} className="text-xs text-gray-600 flex gap-2"><span className={`w-14 shrink-0 font-semibold ${i.score === 2 ? 'text-green-700' : i.score === 1 ? 'text-amber-700' : 'text-red-700'}`}>{i.score === 2 ? 'Good' : i.score === 1 ? 'So-so' : 'No'} ({i.score})</span><span className="truncate" title={i.label}>{i.label}</span></li>)}</ul>
                        </>
                      ) : (
                        <div className="text-xs text-gray-500 mt-0.5">{DIMS.map(d => `${d.label}: ${g?.[d.key] === true ? 'Yes' : g?.[d.key] === false ? 'No' : '—'}`).join(' · ')}</div>
                      )}
                      {a.notes && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.notes}</p>}
                    </div>
                    {a.assessor_id === myId && <button onClick={async () => { if (await confirmDialog('Delete this assessment?')) { await (act(() => deleteAssessment(a.id))) } }} aria-label="Delete" className="p-2 -m-2 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
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
