'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, X, Check, ListChecks, AlertCircle, BarChart3, Table2, StickyNote, MoreVertical } from 'lucide-react'
import { addKpi, setKpiValue, setKpiNote, deleteKpi, updateKpi, setKpiMeetings, setKpiCustomGoal, deleteKpiCustomGoal } from '../actions'
import { useMeeting, useRun } from './context'
import Avatar from '../Avatar'
import { PersonSelect } from '../PersonPicker'
import { RichEditor } from '../RichText'
import NewItemDrawer from './NewItemDrawer'
import KpiChart from './KpiChart'
import { periodsFor, resolveRange, bucketValues, parseYmd, RANGE_LABEL, GROUP_LABEL, type Range, type RangePreset, type Group } from './kpiRange'
import {
  card, input, primaryBtn, labelCls, Empty, OwnerSelect, SectionTitle, Segmented,
  type Kpi, type KpiValue, type KpiCustomGoal, type OtherMeetings,
} from './shared'
import {
  CADENCES, GOAL_RULES, UNIT_TYPES, evaluateGoal, formatGoal, formatKpiValue,
  type Cadence, type Goal, type GoalRule, type UnitType,
} from '@/lib/meetings'

function baseGoal(k: Kpi): Goal {
  return { rule: k.goal_rule, value: k.goal_value, max: k.goal_value_max }
}

// A custom goal for a period replaces the KPI's normal goal for that period.
function goalFor(k: Kpi, period: string, custom: KpiCustomGoal[]): Goal {
  const c = custom.find(x => x.kpi_id === k.id && x.period_start === period)
  return c ? { rule: c.goal_rule, value: c.goal_value, max: c.goal_value_max } : baseGoal(k)
}

const HIT = 'bg-green-50 border-green-300 text-green-800'
const MISS = 'bg-red-50 border-red-300 text-red-800'

// ---------------------------------------------------------------------- cell

function KpiCell({ kpi, start, value, goal, onCreate, note, onNote }: {
  kpi: Kpi; start: string; value: number | null | undefined; goal: Goal
  onCreate: (kind: 'todo' | 'issue') => void
  note?: string
  onNote: () => void
}) {
  const { meetingId } = useMeeting()
  const run = useRun()
  const hit = evaluateGoal(goal, value)
  const tone = hit === null ? 'bg-white' : hit ? HIT : MISS
  const save = (next: number | null) => {
    if (next === (value ?? null)) return
    run(() => setKpiValue(meetingId, kpi.id, start, next))
  }

  let control: React.ReactNode
  if (kpi.unit_type === 'yesno') {
    control = (
      <select
        key={`${start}-${value ?? ''}`}
        defaultValue={value === null || value === undefined ? '' : String(value)}
        onChange={e => save(e.target.value === '' ? null : Number(e.target.value))}
        className={`w-full min-w-0 text-center border rounded px-0.5 py-0.5 text-xs ${tone}`}
        aria-label={`${kpi.name} ${start}`}
      >
        <option value="">—</option><option value="1">Yes</option><option value="0">No</option>
      </select>
    )
  } else {
    control = (
      <input
        key={`${start}-${value ?? ''}`}
        type="number"
        step="any"
        defaultValue={value ?? ''}
        onBlur={e => {
          const raw = e.target.value.trim()
          save(raw === '' ? null : Number(raw))
        }}
        className={`w-full min-w-0 text-center border rounded px-1 py-0.5 text-xs ${tone}`}
        aria-label={`${kpi.name} ${start}`}
      />
    )
  }

  // The actions live in a small menu opened from a tiny corner button, so nothing ever covers the
  // number or the cells beside it while the mouse passes over.
  const [menu, setMenu] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', onKey) }
  }, [menu])
  function openMenu() {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.min(r.left, window.innerWidth - 220)
    setMenu(window.innerHeight - r.bottom < 170 ? { bottom: window.innerHeight - r.top + 4, left } : { top: r.bottom + 4, left })
  }
  const item = 'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2'

  return (
    <div className="group relative block w-full" title={note ? `Note: ${note}` : undefined}>
      {control}
      {note && (
        <button type="button" onClick={onNote} aria-label={`Note: ${note}`} className="absolute top-0 right-0 w-0 h-0 border-t-[9px] border-l-[9px] border-t-amber-500 border-l-transparent rounded-tr" />
      )}
      <button
        ref={trigger}
        type="button"
        onClick={openMenu}
        aria-label="Actions for this KPI number"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        className="absolute top-0 left-0 h-3.5 w-3.5 hidden group-hover:inline-flex group-focus-within:inline-flex items-center justify-center rounded-sm bg-white/80 text-gray-500 hover:text-gray-900 hover:bg-white"
      ><MoreVertical className="w-3 h-3" /></button>
      {menu && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setMenu(null)} />
          <div role="menu" style={{ position: 'fixed', top: menu.top, bottom: menu.bottom, left: menu.left, width: 208 }} className="z-[71] bg-white border rounded-lg shadow-xl py-1">
            <button role="menuitem" type="button" onClick={() => { setMenu(null); onNote() }} className={item}><StickyNote className="w-4 h-4 text-amber-500" /> {note ? 'Edit note' : 'Add note'}</button>
            <button role="menuitem" type="button" onClick={() => { setMenu(null); onCreate('todo') }} className={item}><ListChecks className="w-4 h-4 text-blue-600" /> Create to-do</button>
            <button role="menuitem" type="button" onClick={() => { setMenu(null); onCreate('issue') }} className={item}><AlertCircle className="w-4 h-4 text-amber-600" /> Create issue</button>
          </div>
        </>
      )}
    </div>
  )
}

// -------------------------------------------------------------- goal editor

function GoalFields({ rule, value, max, onChange, compact = false }: {
  rule: GoalRule; value: string; max: string
  onChange: (g: { rule: GoalRule; value: string; max: string }) => void
  compact?: boolean
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'items-center'}`}>
      <select value={rule} onChange={e => onChange({ rule: e.target.value as GoalRule, value, max })} className={input} aria-label="Goal rule">
        {GOAL_RULES.map(r => <option key={r.key} value={r.key}>{r.symbol} {r.label}</option>)}
      </select>
      <input type="number" step="any" value={value} onChange={e => onChange({ rule, value: e.target.value, max })} placeholder={rule === 'between' ? 'From' : 'Goal'} className={`${input} w-28`} aria-label="Goal value" />
      {rule === 'between' && (
        <>
          <span className="self-center text-gray-400">to</span>
          <input type="number" step="any" value={max} onChange={e => onChange({ rule, value, max: e.target.value })} placeholder="To" className={`${input} w-28`} aria-label="Goal upper value" />
        </>
      )}
    </div>
  )
}

const num = (s: string) => (s.trim() === '' ? null : Number(s))

// -------------------------------------------------------------------- drawer

function KpiDrawer({ kpi, custom, allMeetings, onClose }: {
  kpi: Kpi; custom: KpiCustomGoal[]; allMeetings: OtherMeetings; onClose: () => void
}) {
  const { meetingId, people } = useMeeting()
  const run = useRun()
  const [name, setName] = useState(kpi.name)
  const [goal, setGoal] = useState({ rule: kpi.goal_rule, value: kpi.goal_value === null ? '' : String(kpi.goal_value), max: kpi.goal_value_max === null ? '' : String(kpi.goal_value_max) })
  const [saved, setSaved] = useState(false)
  const [cg, setCg] = useState({ period: '', rule: 'gte' as GoalRule, value: '', max: '' })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save(patch: Parameters<typeof updateKpi>[2]) {
    setSaved(false)
    const ok = await run(async () => { await updateKpi(meetingId, kpi.id, patch); return true })
    if (ok) setSaved(true)
  }

  // "Between" needs both ends; wait until the person has typed them instead of erroring.
  const saveGoal = (g: typeof goal) => {
    if (g.rule === 'between' && (num(g.value) === null || num(g.max) === null)) return
    const same = g.rule === kpi.goal_rule && num(g.value) === kpi.goal_value && (g.rule !== 'between' || num(g.max) === kpi.goal_value_max)
    if (same) return
    return save({ goal_rule: g.rule, goal_value: num(g.value), goal_value_max: g.rule === 'between' ? num(g.max) : null })
  }

  async function toggleMeeting(id: string) {
    const has = kpi.meeting_ids.includes(id)
    const next = has ? kpi.meeting_ids.filter(x => x !== id) : [...kpi.meeting_ids, id]
    if (next.length === 0) { alert('A KPI must stay attached to at least one meeting.'); return }
    setSaved(false)
    const ok = await run(async () => { await setKpiMeetings(meetingId, kpi.id, next); return true })
    if (ok) setSaved(true)
  }

  async function addCustom() {
    if (!cg.period) return
    const ok = await run(async () => {
      await setKpiCustomGoal(meetingId, kpi.id, cg.period, { goal_rule: cg.rule, goal_value: num(cg.value), goal_value_max: cg.rule === 'between' ? num(cg.max) : null })
      return true
    })
    if (ok) setCg({ period: '', rule: 'gte', value: '', max: '' })
  }

  const myCustom = custom.filter(c => c.kpi_id === kpi.id).sort((a, b) => a.period_start.localeCompare(b.period_start))
  const unit = kpi.unit_type
  const f = 'w-full border rounded-lg px-3 py-2 text-sm bg-white'

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 no-print" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[34rem] bg-white shadow-2xl flex flex-col no-print" role="dialog" aria-label="Edit KPI">
        <header className="flex items-center gap-3 px-5 py-4 border-b">
          <h2 className="font-bold text-lg flex-1">Edit KPI</h2>
          {saved && <span className="text-xs text-green-700 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Changes saved</span>}
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400 hover:text-gray-700" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <div className={`${labelCls} mb-1.5`}>Title</div>
            <input value={name} onChange={e => { setName(e.target.value); setSaved(false) }} onBlur={() => { if (name.trim() && name.trim() !== kpi.name) save({ name }); else if (!name.trim()) setName(kpi.name) }} className={f} aria-label="Title" />
          </div>

          <div>
            <div className={`${labelCls} mb-1.5`}>Details</div>
            <RichEditor key={kpi.id} value={kpi.details} onCommit={html => save({ details: html })} minHeight={100} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className={`${labelCls} mb-1.5`}>Frequency</div>
              <select value={kpi.cadence} onChange={e => save({ cadence: e.target.value as Cadence })} className={`${f} capitalize`} aria-label="Frequency">
                {CADENCES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <div className={`${labelCls} mb-1.5`}>Units</div>
              <select value={unit} onChange={e => save({ unit_type: e.target.value as UnitType })} className={f} aria-label="Units">
                {UNIT_TYPES.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <div className={`${labelCls} mb-1.5`}>Owner</div>
              <PersonSelect people={people} value={kpi.owner_id ?? ''} onChange={id => save({ owner_id: id || null })} emptyLabel="No owner" className="w-full" ariaLabel="Owner" />
            </div>
          </div>

          <div>
            <div className={`${labelCls} mb-1.5`}>Goal</div>
            <div onBlur={() => saveGoal(goal)}>
              <GoalFields rule={goal.rule} value={goal.value} max={goal.max} onChange={g => { setGoal(g); setSaved(false) }} />
            </div>
            <p className="text-xs text-gray-500 mt-1.5">Currently: <b>{formatGoal(baseGoal(kpi), unit)}</b>. Cells turn green when the goal is met and red when it is missed.</p>
          </div>

          <div>
            <div className={`${labelCls} mb-1.5`}>Custom goals</div>
            <p className="text-xs text-gray-500 mb-2">Use a different goal for one period (a holiday week, a ramp-up month).</p>
            {myCustom.length > 0 && (
              <ul className="mb-2 divide-y border rounded-lg">
                {myCustom.map(c => (
                  <li key={c.period_start} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-medium">{c.period_start}</span>
                    <span className="flex-1 text-gray-600">{formatGoal({ rule: c.goal_rule, value: c.goal_value, max: c.goal_value_max }, unit)}</span>
                    <button onClick={() => run(() => deleteKpiCustomGoal(meetingId, kpi.id, c.period_start))} aria-label="Remove custom goal" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-lg border p-3 space-y-2">
              <input type="date" value={cg.period} onChange={e => setCg({ ...cg, period: e.target.value })} className={`${input} w-44`} aria-label="Period start" title="Start date of the period (the Monday for weekly KPIs)" />
              <GoalFields rule={cg.rule} value={cg.value} max={cg.max} onChange={g => setCg({ ...cg, rule: g.rule, value: g.value, max: g.max })} />
              <button onClick={addCustom} disabled={!cg.period || cg.value === ''} className={primaryBtn}><Plus className="w-4 h-4" /> Add custom goal</button>
            </div>
          </div>

          <div>
            <div className={`${labelCls} mb-1.5`}>Attach to meeting(s)</div>
            <ul className="border rounded-lg divide-y max-h-48 overflow-y-auto">
              {allMeetings.map(m => (
                <li key={m.id}>
                  <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={kpi.meeting_ids.includes(m.id)} onChange={() => toggleMeeting(m.id)} />
                    {m.name}{m.id === meetingId && <span className="text-xs text-gray-400">(this meeting)</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="flex items-center justify-between px-5 py-3 border-t bg-gray-50">
          <button
            onClick={async () => { if (confirm(`Delete KPI "${kpi.name}" and all its values?`)) { const ok = await run(async () => { await deleteKpi(meetingId, kpi.id); return true }); if (ok) onClose() } }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700"
          ><Trash2 className="w-4 h-4" /> Delete</button>
        </footer>
      </aside>
    </>
  )
}

// ------------------------------------------------------------------ section

export function Metrics({ kpis, values, customGoals, otherMeetings, meetingName, notes = [] }: {
  kpis: Kpi[]; values: KpiValue[]; customGoals: KpiCustomGoal[]; otherMeetings: OtherMeetings; meetingName: string
  notes?: { kpi_id: string; period_start: string; note: string }[]
}) {
  const { meetingId, myId, peopleById } = useMeeting()
  const run = useRun()
  const [cadence, setCadence] = useState<Cadence>('weekly')
  const [openId, setOpenId] = useState<string | null>(null)
  const [view, setView] = useState<'table' | 'chart'>('table')
  const [range, setRange] = useState<Range>({ preset: 'recent', from: '', to: '' })
  const [group, setGroup] = useState<Group>('period')
  const [agg, setAgg] = useState<'avg' | 'sum'>('avg')
  const [chartKpiId, setChartKpiId] = useState('')
  const [draft, setDraft] = useState<{ kind: 'todo' | 'issue'; title: string; details: string } | null>(null)
  const [form, setForm] = useState({ name: '', owner_id: myId, unit_type: 'number' as UnitType, rule: 'gte' as GoalRule, value: '', max: '' })
  const byKey = useMemo(() => new Map(values.map(v => [`${v.kpi_id}|${v.period_start}`, v.value])), [values])
  const serverNotes = useMemo(() => new Map(notes.map(n => [`${n.kpi_id}|${n.period_start}`, n.note])), [notes])
  // A saved note shows straight away; the server's copy takes over once the page has refreshed.
  const notesSig = notes.map(n => `${n.kpi_id}|${n.period_start}|${n.note}`).join('~')
  const [seenNotes, setSeenNotes] = useState(notesSig)
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})
  if (seenNotes !== notesSig) { setSeenNotes(notesSig); setLocalNotes({}) }
  const noteByKey = useMemo(() => {
    const m = new Map(serverNotes)
    for (const [k, v] of Object.entries(localNotes)) { if (v) m.set(k, v); else m.delete(k) }
    return m
  }, [serverNotes, localNotes])
  const [noteEdit, setNoteEdit] = useState<{ kpi: Kpi; start: string; label: string; text: string } | null>(null)
  const [noteBusy, setNoteBusy] = useState(false)
  async function saveNote(text: string) {
    if (!noteEdit) return
    setNoteBusy(true)
    const key = `${noteEdit.kpi.id}|${noteEdit.start}`
    const ok = await run(async () => { await setKpiNote(meetingId, noteEdit.kpi.id, noteEdit.start, text); return true })
    setNoteBusy(false)
    if (ok) { setLocalNotes(prev => ({ ...prev, [key]: text.trim() })); setNoteEdit(null) }
  }
  const periods = useMemo(() => periodsFor(cadence, range), [cadence, range])
  const shown = kpis.filter(k => k.cadence === cadence)
  const open = kpis.find(k => k.id === openId)
  const allMeetings = useMemo(() => [{ id: meetingId, name: meetingName }, ...otherMeetings], [meetingId, meetingName, otherMeetings])
  const customRangeIncomplete = range.preset === 'custom' && (!range.from || !range.to)

  const chartKpi = shown.find(k => k.id === chartKpiId) ?? shown[0]
  const buckets = (() => {
    if (!chartKpi) return []
    const span = resolveRange(range)
    const lo = span ? span.from : periods.length ? parseYmd(periods[0].start) : null
    const hi = span ? span.to : periods.length ? parseYmd(periods[periods.length - 1].start) : null
    const rows = values.filter(v => {
      if (v.kpi_id !== chartKpi.id) return false
      if (!lo || !hi) return true
      const d = parseYmd(v.period_start)
      return d >= lo && d <= hi
    })
    // On the default range, quarter / year views use all recorded history.
    const pool = range.preset === 'recent' && group !== 'period' ? values.filter(v => v.kpi_id === chartKpi.id) : rows
    return bucketValues(pool, group, agg, periods)
  })()

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    const ok = await run(async () => {
      await addKpi(meetingId, {
        name: form.name, cadence, unit_type: form.unit_type, owner_id: form.owner_id,
        goal_rule: form.rule, goal_value: num(form.value), goal_value_max: form.rule === 'between' ? num(form.max) : null,
      })
      return true
    })
    if (ok) setForm({ ...form, name: '', value: '', max: '' })
  }

  // A to-do or issue about one specific KPI number, pre-filled for review.
  function startDraft(kind: 'todo' | 'issue', k: Kpi, p: { start: string; label: string }) {
    const v = byKey.get(`${k.id}|${p.start}`)
    const goal = goalFor(k, p.start, customGoals)
    const hit = evaluateGoal(goal, v)
    const result = hit === null ? '' : hit ? ' (goal met)' : ' (goal missed)'
    const actual = formatKpiValue(v, k.unit_type)
    const goalText = formatGoal(goal, k.unit_type)
    setDraft({
      kind,
      title: kind === 'issue' ? `${k.name}: ${actual} against goal ${goalText}` : `Follow up on KPI: ${k.name}`,
      details: `<p><strong>KPI:</strong> ${esc(k.name)}</p><p><strong>Period:</strong> ${esc(p.label)} (${esc(cadence)})</p><p><strong>Result:</strong> ${esc(actual)}${result}</p><p><strong>Goal:</strong> ${esc(goalText)}</p>`,
    })
  }

  const presets: RangePreset[] = ['recent', 'quarter', 'year', 'lastyear', 'custom']

  return (
    <div>
      <SectionTitle right={<Segmented value={cadence} onChange={setCadence} options={CADENCES.map(c => ({ key: c, label: `${c[0].toUpperCase()}${c.slice(1)} (${kpis.filter(k => k.cadence === c).length})` }))} />}>KPIs</SectionTitle>

      <div className={`${card} p-3 mb-4 flex flex-wrap items-end gap-3`}>
        <Segmented value={view} onChange={setView} options={[{ key: 'table', label: 'Table' }, { key: 'chart', label: 'Chart' }]} />
        <label className="text-xs text-gray-600">
          <span className={`${labelCls} block mb-1`}>Date range</span>
          <select value={range.preset} onChange={e => setRange({ ...range, preset: e.target.value as RangePreset })} className={input} aria-label="Date range">
            {presets.map(p => <option key={p} value={p}>{RANGE_LABEL[p]}</option>)}
          </select>
        </label>
        {range.preset === 'custom' && (
          <>
            <label className="text-xs text-gray-600"><span className={`${labelCls} block mb-1`}>From</span><input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} className={input} aria-label="From date" /></label>
            <label className="text-xs text-gray-600"><span className={`${labelCls} block mb-1`}>To</span><input type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} className={input} aria-label="To date" /></label>
          </>
        )}
        {view === 'chart' && (
          <>
            <label className="text-xs text-gray-600">
              <span className={`${labelCls} block mb-1`}>KPI</span>
              <select value={chartKpi?.id ?? ''} onChange={e => setChartKpiId(e.target.value)} className={input} aria-label="KPI to chart">
                {shown.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              <span className={`${labelCls} block mb-1`}>Group</span>
              <select value={group} onChange={e => setGroup(e.target.value as Group)} className={input} aria-label="Group by">
                {(Object.keys(GROUP_LABEL) as Group[]).map(g => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
              </select>
            </label>
            {group !== 'period' && (
              <label className="text-xs text-gray-600">
                <span className={`${labelCls} block mb-1`}>Total as</span>
                <select value={agg} onChange={e => setAgg(e.target.value as 'avg' | 'sum')} className={input} aria-label="Aggregate">
                  <option value="avg">Average</option><option value="sum">Sum</option>
                </select>
              </label>
            )}
          </>
        )}
        <p className="text-xs text-gray-500 ml-auto self-center">
          {customRangeIncomplete ? 'Pick both dates.' : periods.length ? `${periods[0].label} – ${periods[periods.length - 1].label} · ${periods.length} ${cadence} period${periods.length === 1 ? '' : 's'}` : 'No periods in this range.'}
        </p>
      </div>

      {shown.length === 0 ? (
        <Empty title={`Your ${cadence} KPIs live here`} hint="Track the numbers that tell you how things are trending." />
      ) : view === 'chart' && chartKpi ? (
        <KpiChart
          buckets={buckets}
          unit={chartKpi.unit_type}
          goal={baseGoal(chartKpi)}
          colourByGoal={group === 'period' || agg === 'avg'}
          goalFor={group === 'period' ? key => goalFor(chartKpi, key, customGoals) : undefined}
        />
      ) : (
        <div className={`${card} overflow-auto max-h-[calc(100vh-14rem)]`}>
          {/* Fixed layout: the period columns share whatever width is left, so the value boxes grow with the page. */}
          <table className="w-full text-sm table-fixed" style={{ minWidth: `${22 + periods.length * 3.6}rem` }}>
            <colgroup><col style={{ width: '12rem' }} /><col style={{ width: '5.5rem' }} /><col style={{ width: '4.5rem' }} /><col style={{ width: '4.5rem' }} />{periods.map(p => <col key={p.start} />)}</colgroup>
            <thead className="bg-gray-50">
              {/* The dates stay at the top and the first four columns stay on the left while scrolling. */}
              <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                <th className="text-left px-2 py-1.5 font-semibold sticky top-0 left-0 z-30 bg-gray-50">KPI</th>
                <th className="px-1 py-1.5 font-semibold sticky top-0 left-[12rem] z-30 bg-gray-50">Goal</th>
                <th className="px-1 py-1.5 font-semibold sticky top-0 left-[17.5rem] z-30 bg-gray-50">Sum</th>
                <th className="px-1 py-1.5 font-semibold sticky top-0 left-[22rem] z-30 bg-gray-50 shadow-[inset_-1px_0_0_#e5e7eb]">Avg</th>
                {periods.map(p => <th key={p.start} className="px-1 py-1.5 font-semibold whitespace-nowrap sticky top-0 z-20 bg-gray-50">{p.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map(k => {
                const nums = periods.map(p => byKey.get(`${k.id}|${p.start}`)).filter((v): v is number => v !== null && v !== undefined)
                const sum = nums.reduce((s, v) => s + v, 0)
                const avg = nums.length ? sum / nums.length : null
                return (
                  <tr key={k.id} className="group/row">
                    <td className="px-2 py-1 min-w-[11rem] sticky left-0 z-10 bg-white">
                      <button onClick={() => setOpenId(k.id)} className="flex items-center gap-2 text-left hover:text-blue-700" title="Open KPI details">
                        <Avatar person={peopleById.get(k.owner_id ?? '')} size="sm" />
                        <span className="font-medium">{k.name}</span>
                      </button>
                    </td>
                    <td className="px-1 py-1 text-center text-gray-700 whitespace-nowrap font-medium sticky left-[12rem] z-10 bg-white">{formatGoal(baseGoal(k), k.unit_type)}</td>
                    <td className="px-1 py-1 text-center text-gray-500 tabular-nums sticky left-[17.5rem] z-10 bg-white">{k.unit_type === 'yesno' || nums.length === 0 ? '—' : formatKpiValue(sum, k.unit_type)}</td>
                    <td className="px-1 py-1 text-center text-gray-500 tabular-nums sticky left-[22rem] z-10 bg-white shadow-[inset_-1px_0_0_#e5e7eb]">{k.unit_type === 'yesno' || avg === null ? '—' : formatKpiValue(avg, k.unit_type)}</td>
                    {periods.map(p => (
                      <td key={p.start} className="px-1 py-1 text-center">
                        <KpiCell kpi={k} start={p.start} value={byKey.get(`${k.id}|${p.start}`)} goal={goalFor(k, p.start, customGoals)} onCreate={kind => startDraft(kind, k, p)} note={noteByKey.get(`${k.id}|${p.start}`)} onNote={() => setNoteEdit({ kpi: k, start: p.start, label: p.label, text: noteByKey.get(`${k.id}|${p.start}`) ?? '' })} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {view === 'table' && shown.length > 0 && <p className="text-xs text-gray-500 mt-2 inline-flex flex-wrap items-center gap-1"><Table2 className="w-3.5 h-3.5" /> Hover a number and use its ⋮ corner button to add a note, or create a to-do or issue from it. A small orange corner means it has a note. <BarChart3 className="w-3.5 h-3.5 ml-2" /> Switch to Chart for trends by quarter or year.</p>}

      <form onSubmit={add} className={`${card} p-4 mt-4 space-y-3`}>
        <div className={labelCls}>Add a {cadence} KPI</div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="KPI name" className={input} aria-label="KPI name" />
          <OwnerSelect value={form.owner_id} onChange={v => setForm({ ...form, owner_id: v })} />
          <select value={form.unit_type} onChange={e => setForm({ ...form, unit_type: e.target.value as UnitType })} className={input} aria-label="Units">
            {UNIT_TYPES.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Goal</span>
          <GoalFields rule={form.rule} value={form.value} max={form.max} onChange={g => setForm({ ...form, rule: g.rule, value: g.value, max: g.max })} />
          <button className={`${primaryBtn} ml-auto`}><Plus className="w-4 h-4" /> Add KPI</button>
        </div>
      </form>

      {open && <KpiDrawer key={open.id} kpi={open} custom={customGoals} allMeetings={allMeetings} onClose={() => setOpenId(null)} />}
      {noteEdit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setNoteEdit(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()} role="dialog" aria-label="KPI note">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div>
                <h2 className="font-bold flex items-center gap-1.5"><StickyNote className="w-4 h-4 text-amber-500" /> Note</h2>
                <p className="text-xs text-gray-500">{noteEdit.kpi.name} · {noteEdit.label} · {formatKpiValue(byKey.get(`${noteEdit.kpi.id}|${noteEdit.start}`), noteEdit.kpi.unit_type)}</p>
              </div>
              <button onClick={() => setNoteEdit(null)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5">
              <textarea autoFocus value={noteEdit.text} onChange={e => setNoteEdit({ ...noteEdit, text: e.target.value })} rows={5} maxLength={2000} placeholder="Why the number is what it is, what was agreed…" className={`${input} w-full`} aria-label="Note" />
            </div>
            <div className="flex items-center gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
              {noteByKey.has(`${noteEdit.kpi.id}|${noteEdit.start}`) && (
                <button onClick={() => confirm('Delete this note?') && saveNote('')} disabled={noteBusy} className="text-sm text-red-600 hover:underline mr-auto">Delete note</button>
              )}
              <button onClick={() => setNoteEdit(null)} className="ml-auto px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button onClick={() => saveNote(noteEdit.text)} disabled={noteBusy || !noteEdit.text.trim()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{noteBusy ? 'Saving…' : 'Save note'}</button>
            </div>
          </div>
        </div>
      )}
      {draft && <NewItemDrawer key={draft.title} kind={draft.kind} draft={{ title: draft.title, details: draft.details, owner_id: null, due_date: null }} sourceLabel="Created from a KPI number." onClose={() => setDraft(null)} />}
    </div>
  )
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
