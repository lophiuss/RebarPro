'use client'

import { useState } from 'react'
import { Plus, Trash2, Pencil, Presentation } from 'lucide-react'
import { saveGrowthPlan } from './actions'
import Avatar from '../Avatar'
import type { GrowthPlanContent, Person } from '@/lib/meetings'

type Goal = { id: string; title: string; status: string; due_date: string | null; owner_id: string | null; milestones: { title: string; done: boolean }[]; meeting: { name: string } | null }
type Parked = { id: string; title: string; owner_id: string | null }

const card = 'border rounded-xl bg-white shadow-sm p-5'
const input = 'w-full border rounded-lg px-3 py-2 text-sm bg-white'

function fmtDate(d?: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}-${m}-${y}`
}

// ----------------------------------------------------------------- edit helpers

function Text({ label, value, onChange, rows = 3 }: { label: string; value?: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows} className={`${input} mt-1 font-normal`} />
    </label>
  )
}

function ListField({ label, values, onChange, placeholder }: { label: string; values?: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const items = values ?? []
  return (
    <div className="text-sm font-medium">
      {label}
      <ul className="mt-1 space-y-1.5">
        {items.map((v, i) => (
          <li key={i} className="flex gap-2">
            <input value={v} onChange={e => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder={placeholder} className={`${input} font-normal`} />
            <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label="Remove" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...items, ''])} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"><Plus className="w-4 h-4" /> Add</button>
    </div>
  )
}

function DateField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input type="date" value={value ?? ''} onChange={e => onChange(e.target.value)} className={`${input} mt-1 font-normal max-w-xs`} />
    </label>
  )
}

// ----------------------------------------------------------------- presentation helpers

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      <h2 className="text-lg font-bold text-slate-900 mb-3">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Para({ label, text }: { label?: string; text?: string }) {
  if (!text) return null
  return (
    <div>
      {label && <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-1">{label}</div>}
      <p className="text-slate-800 whitespace-pre-wrap">{text}</p>
    </div>
  )
}

function Numbered({ label, items }: { label?: string; items?: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      {label && <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-1">{label}</div>}
      <ol className="list-decimal list-inside space-y-1 text-slate-800">{items.map((x, i) => <li key={i}>{x}</li>)}</ol>
    </div>
  )
}

function Bullets({ label, items }: { label?: string; items?: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      {label && <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-1">{label}</div>}
      <ul className="list-disc list-inside space-y-1 text-slate-800">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )
}

function GoalsBlock({ date, goals }: { date?: string; goals?: string[] }) {
  if (!date && (!goals || goals.length === 0)) return null
  return (
    <div>
      {date && <div className="text-sm text-gray-600 mb-2">Future date: <b>{fmtDate(date)}</b></div>}
      <ul className="space-y-1.5">
        {(goals ?? []).map((g, i) => (
          <li key={i} className="border-l-4 border-blue-500 bg-blue-50/50 px-3 py-1.5 text-slate-800 rounded-r">{g}</li>
        ))}
      </ul>
    </div>
  )
}

export default function GrowthPlanView({
  initial, savedAt, coreValues, goals, parked, people, canEdit,
}: { initial: GrowthPlanContent; savedAt: string | null; coreValues: string[]; goals: Goal[]; parked: Parked[]; people: Person[]; canEdit: boolean }) {
  const [mode, setMode] = useState<'present' | 'edit'>('present')
  const [tab, setTab] = useState<'future' | 'short'>('future')
  const [plan, setPlan] = useState<GrowthPlanContent>(initial)
  const [draft, setDraft] = useState<GrowthPlanContent>(initial)
  const [saved, setSaved] = useState<string | null>(savedAt)
  const [saving, setSaving] = useState(false)
  const peopleById = new Map(people.map(p => [p.id, p]))

  const patch = (p: Partial<GrowthPlanContent>) => setDraft({ ...draft, ...p })

  async function save() {
    setSaving(true)
    try {
      const res = await saveGrowthPlan(draft)
      setPlan(res.content)
      setDraft(res.content)
      setSaved(res.updated_at)
      setMode('present')
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const header = (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="flex rounded-lg border bg-white overflow-hidden text-sm">
        {([['future', 'Future Focus'], ['short', 'Short-Term Focus']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 font-medium ${tab === k ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>{label}</button>
        ))}
      </div>
      <span className="text-xs text-gray-500">{saved ? `Saved on ${new Date(saved).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not saved yet'}</span>
      {canEdit && (
        <div className="ml-auto flex rounded-lg border bg-white overflow-hidden text-sm">
          <button onClick={() => { setDraft(plan); setMode('present') }} className={`inline-flex items-center gap-1.5 px-3 py-2 ${mode === 'present' ? 'bg-slate-900 text-white' : 'hover:bg-gray-50'}`}><Presentation className="w-4 h-4" /> Presentation mode</button>
          <button onClick={() => setMode('edit')} className={`inline-flex items-center gap-1.5 px-3 py-2 ${mode === 'edit' ? 'bg-slate-900 text-white' : 'hover:bg-gray-50'}`}><Pencil className="w-4 h-4" /> Edit mode</button>
        </div>
      )}
    </div>
  )

  if (mode === 'edit') {
    return (
      <div>
        {header}
        <div className="space-y-4">
          {tab === 'future' ? (
            <>
              <Section title="What, How & Why">
                <Text label="What" value={draft.what} onChange={v => patch({ what: v })} />
                <Text label="How" value={draft.how} onChange={v => patch({ how: v })} />
                <Text label="Why" value={draft.why} onChange={v => patch({ why: v })} />
              </Section>
              <Section title="5-Year Vision"><Text label="Vision" value={draft.five_year_vision} onChange={v => patch({ five_year_vision: v })} /></Section>
              <Section title="Marketing Strategy">
                <Text label="Ideal client" value={draft.marketing?.ideal_client} onChange={v => patch({ marketing: { ...draft.marketing, ideal_client: v } })} />
                <ListField label="Differentiators" values={draft.marketing?.differentiators} onChange={v => patch({ marketing: { ...draft.marketing, differentiators: v } })} />
                <Text label="Proven process" value={draft.marketing?.proven_process} onChange={v => patch({ marketing: { ...draft.marketing, proven_process: v } })} />
                <Text label="Guarantee" value={draft.marketing?.guarantee} onChange={v => patch({ marketing: { ...draft.marketing, guarantee: v } })} />
              </Section>
              <Section title="3-Year Future">
                <DateField label="Future date" value={draft.three_year?.date} onChange={v => patch({ three_year: { ...draft.three_year, date: v } })} />
                <ListField label="Growth goals" values={draft.three_year?.goals} onChange={v => patch({ three_year: { ...draft.three_year, goals: v } })} />
                <ListField label="Future possibilities" values={draft.three_year?.possibilities} onChange={v => patch({ three_year: { ...draft.three_year, possibilities: v } })} />
              </Section>
            </>
          ) : (
            <>
              <Section title="1-Year Plan">
                <DateField label="Future date" value={draft.one_year?.date} onChange={v => patch({ one_year: { ...draft.one_year, date: v } })} />
                <ListField label="Growth goals" values={draft.one_year?.goals} onChange={v => patch({ one_year: { ...draft.one_year, goals: v } })} />
                <ListField label="Annual goals" values={draft.one_year?.annual_goals} onChange={v => patch({ one_year: { ...draft.one_year, annual_goals: v } })} />
              </Section>
              <Section title="90-Day Plan">
                <DateField label="Future date" value={draft.ninety_day?.date} onChange={v => patch({ ninety_day: { ...draft.ninety_day, date: v } })} />
                <ListField label="Growth goals" values={draft.ninety_day?.goals} onChange={v => patch({ ninety_day: { ...draft.ninety_day, goals: v } })} />
              </Section>
              <p className="text-sm text-gray-500">Quarterly priorities and the parking lot come from your meetings and update automatically. Core values are edited in Settings.</p>
            </>
          )}
        </div>
        <div className="sticky bottom-0 bg-gray-50/90 backdrop-blur border-t mt-6 -mx-4 md:-mx-8 px-4 md:px-8 py-3 flex justify-end gap-2">
          <button onClick={() => { setDraft(plan); setMode('present') }} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    )
  }

  const empty = (
    <div className="border border-dashed rounded-xl p-8 text-center bg-white text-sm text-gray-500">
      Nothing here yet.{canEdit ? ' Switch to Edit mode to fill in your plan.' : ' A manager can fill this in.'}
    </div>
  )

  return (
    <div>
      {header}
      {tab === 'future' ? (
        <div className="space-y-4">
          <Section title="Core Values">
            {coreValues.length ? <Numbered items={coreValues} /> : <p className="text-sm text-gray-400">Add core values in Settings.</p>}
          </Section>
          {(plan.what || plan.how || plan.why) ? (
            <Section title="What, How & Why">
              <Para label="What" text={plan.what} /><Para label="How" text={plan.how} /><Para label="Why" text={plan.why} />
            </Section>
          ) : null}
          {plan.five_year_vision ? <Section title="5-Year Vision"><Para text={plan.five_year_vision} /></Section> : null}
          {(plan.marketing?.ideal_client || plan.marketing?.differentiators?.length || plan.marketing?.proven_process || plan.marketing?.guarantee) ? (
            <Section title="Marketing Strategy">
              <Para label="Ideal client" text={plan.marketing?.ideal_client} />
              <Numbered label="Differentiators" items={plan.marketing?.differentiators} />
              <Para label="Proven process" text={plan.marketing?.proven_process} />
              <Para label="Guarantee" text={plan.marketing?.guarantee} />
            </Section>
          ) : null}
          {(plan.three_year?.date || plan.three_year?.goals?.length || plan.three_year?.possibilities?.length) ? (
            <Section title="3-Year Future">
              <GoalsBlock date={plan.three_year?.date} goals={plan.three_year?.goals} />
              <Bullets label="Future possibilities" items={plan.three_year?.possibilities} />
            </Section>
          ) : null}
          {!plan.what && !plan.five_year_vision && !plan.marketing?.ideal_client && !plan.three_year?.goals?.length && empty}
        </div>
      ) : (
        <div className="space-y-4">
          {(plan.one_year?.date || plan.one_year?.goals?.length || plan.one_year?.annual_goals?.length) ? (
            <Section title="1-Year Plan">
              <GoalsBlock date={plan.one_year?.date} goals={plan.one_year?.goals} />
              <Numbered label="Annual goals" items={plan.one_year?.annual_goals} />
            </Section>
          ) : null}
          {(plan.ninety_day?.date || plan.ninety_day?.goals?.length) ? (
            <Section title="90-Day Plan"><GoalsBlock date={plan.ninety_day?.date} goals={plan.ninety_day?.goals} /></Section>
          ) : null}
          <Section title={`Quarterly Priorities (${goals.length})`}>
            {goals.length === 0 ? <p className="text-sm text-gray-400">You have no quarterly priority.</p> : (
              <ul className="space-y-3">
                {goals.map(g => {
                  const total = g.milestones.length
                  const done = g.milestones.filter(m => m.done).length
                  return (
                    <li key={g.id} className="flex items-start gap-3">
                      <Avatar person={peopleById.get(g.owner_id ?? '')} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{g.title}</div>
                        <div className="text-[11px] text-gray-400 uppercase tracking-wide">{g.meeting?.name}{g.due_date ? ` · due ${fmtDate(g.due_date)}` : ''}{total ? ` · ${done}/${total} milestones` : ''}</div>
                      </div>
                      <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${g.status === 'off' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{g.status === 'off' ? 'Off track' : 'On track'}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
          <Section title={`Parking Lot (${parked.length})`}>
            {parked.length === 0 ? <p className="text-sm text-gray-400">Nothing in the parking lot.</p> : (
              <ol className="space-y-2">
                {parked.map((p, i) => (
                  <li key={p.id} className="flex items-start gap-3 text-slate-800">
                    <span className="w-5 text-sm text-gray-400 tabular-nums">{i + 1}.</span>
                    <Avatar person={peopleById.get(p.owner_id ?? '')} size="sm" />
                    <span className="flex-1">{p.title}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
          {!plan.one_year?.goals?.length && !plan.ninety_day?.goals?.length && !goals.length && !parked.length && empty}
        </div>
      )}
    </div>
  )
}
