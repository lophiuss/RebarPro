'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, Check, Lightbulb, MessageSquareQuote } from 'lucide-react'
import {
  addHeadline, deleteHeadline, addTodo, setTodoDone, deleteTodo, addIssue, setIssueStatus, deleteIssue,
  addGoal, setGoalStatus, toggleGoalMilestone, deleteGoal, addKpi, setKpiValue, deleteKpi,
  saveRating, revealRatings, concludeMeeting,
} from '../actions'
import { useMeeting, useRun } from './context'
import { emailSummary } from './emailSummary'
import Avatar from '../Avatar'
import {
  CADENCES, CHECK_IN_PROMPTS, TIPS, ISSUE_STATUS_LABEL, ymd, type Cadence, type IssueStatus,
} from '@/lib/meetings'

export type Headline = { id: string; title: string; owner_id: string | null; created_at: string }
export type Todo = { id: string; title: string; owner_id: string | null; due_date: string | null; done_at: string | null; run_id: string | null; created_at: string }
export type Issue = { id: string; title: string; owner_id: string | null; status: IssueStatus; solved_run_id: string | null; created_at: string }
export type Goal = { id: string; title: string; owner_id: string | null; status: 'on' | 'off' | 'done'; due_date: string | null; milestones: { title: string; done: boolean }[] }
export type Kpi = { id: string; name: string; owner_id: string | null; cadence: Cadence; target: number | null; unit: string | null }
export type KpiValue = { kpi_id: string; period_start: string; value: number | null }
export type Rating = { user_id: string; rating: number | null; feedback: string | null }

const card = 'border rounded-xl bg-white'
const input = 'border rounded-lg px-3 py-2 text-sm bg-white'

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="border border-dashed rounded-xl p-8 text-center bg-white">
      <div className="font-semibold text-slate-700">{title}</div>
      <div className="text-sm text-gray-500 mt-1">{hint}</div>
    </div>
  )
}

function OwnerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { people, attendeeIds } = useMeeting()
  const options = people.filter(p => attendeeIds.includes(p.id))
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={input} aria-label="Owner">
      {options.map(p => <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</option>)}
    </select>
  )
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-bold text-slate-900">{children}</h2>
      {right}
    </div>
  )
}

const todayStr = () => ymd(new Date())

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export function CheckIn({ lastFeedback }: { lastFeedback: Rating[] }) {
  const { people, attendeeIds, peopleById } = useMeeting()
  const [style, setStyle] = useState('traditional')
  const [present, setPresent] = useState<Record<string, boolean>>({})
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  const attendees = people.filter(p => attendeeIds.includes(p.id))
  const prompt = style === 'traditional' ? CHECK_IN_PROMPTS[0] : style === 'highlight' ? CHECK_IN_PROMPTS[1] : CHECK_IN_PROMPTS[2]
  const feedback = lastFeedback.filter(f => f.feedback)

  return (
    <div>
      <SectionTitle>Check-in</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <div className={`${card} p-4`}>
          <div className="text-sm font-semibold mb-2">Attendance</div>
          <ul className="space-y-1.5">
            {attendees.map(p => (
              <li key={p.id}>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!present[p.id]} onChange={e => setPresent({ ...present, [p.id]: e.target.checked })} />
                  <Avatar person={p} size="sm" /> {p.full_name}
                </label>
              </li>
            ))}
          </ul>
          <div className="text-xs text-gray-500 mt-3">{Object.values(present).filter(Boolean).length} of {attendees.length} present</div>
        </div>

        <div className="space-y-4">
          <div className={`${card} p-4`}>
            <label className="text-sm font-semibold flex items-center gap-2">
              Style
              <select value={style} onChange={e => setStyle(e.target.value)} className={`${input} font-normal`}>
                <option value="traditional">Traditional check-in</option>
                <option value="highlight">Highlight of the week</option>
                <option value="blocker">Biggest blocker</option>
              </select>
            </label>
            <p className="mt-3 text-slate-800 italic">&ldquo;{prompt}&rdquo;</p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
            <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-900">Tip of the week</div>
              <div className="text-sm text-amber-900/90">{tip}</div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${card} p-4 mt-4`}>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2"><MessageSquareQuote className="w-4 h-4 text-blue-600" /> Last meeting&apos;s feedback</div>
        {feedback.length === 0 ? (
          <p className="text-sm text-gray-500">Feedback added in the wrap-up of the last meeting appears here.</p>
        ) : (
          <ul className="space-y-1.5">
            {feedback.map((f, i) => (
              <li key={i} className="text-sm flex gap-2">
                <Avatar person={peopleById.get(f.user_id)} size="sm" /> <span>{f.feedback}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quarterly priorities
// ---------------------------------------------------------------------------

const GOAL_STATUS_STYLE: Record<string, string> = {
  on: 'bg-green-100 text-green-700',
  off: 'bg-red-100 text-red-700',
  done: 'bg-blue-100 text-blue-700',
}

export function Goals({ goals }: { goals: Goal[] }) {
  const { meetingId, myId, peopleById } = useMeeting()
  const run = useRun()
  const [expand, setExpand] = useState(false)
  const [mine, setMine] = useState(false)
  const [form, setForm] = useState({ title: '', owner_id: myId, due_date: '', milestones: '' })
  const shown = goals.filter(g => !mine || g.owner_id === myId)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    await run(() => addGoal(meetingId, {
      title: form.title, owner_id: form.owner_id, due_date: form.due_date || null,
      milestones: form.milestones.split('\n'),
    }))
    setForm({ ...form, title: '', due_date: '', milestones: '' })
  }

  return (
    <div>
      <SectionTitle right={
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Mine only</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={expand} onChange={e => setExpand(e.target.checked)} /> Expand milestones</label>
        </div>
      }>Quarterly Priorities <span className="text-gray-400 font-normal text-base">({shown.length})</span></SectionTitle>

      {shown.length === 0 ? (
        <Empty title="Your quarterly priorities live here" hint="Set the few projects that matter most this quarter." />
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(g => (
            <li key={g.id} className="p-3">
              <div className="flex items-center gap-3">
                <Avatar person={peopleById.get(g.owner_id ?? '')} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{g.title}</div>
                  {g.due_date && <div className="text-xs text-gray-500">Due {g.due_date}</div>}
                </div>
                <select
                  value={g.status}
                  onChange={e => run(() => setGoalStatus(meetingId, g.id, e.target.value as any))}
                  className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 ${GOAL_STATUS_STYLE[g.status]}`}
                  aria-label="Status"
                >
                  <option value="on">On track</option>
                  <option value="off">Off track</option>
                  <option value="done">Done</option>
                </select>
                <button onClick={() => confirm('Delete this priority?') && run(() => deleteGoal(meetingId, g.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
              {(expand && g.milestones.length > 0) && (
                <ul className="mt-2 ml-11 space-y-1">
                  {g.milestones.map((m, i) => (
                    <li key={i}>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={m.done} onChange={() => run(() => toggleGoalMilestone(meetingId, g.id, i))} />
                        <span className={m.done ? 'line-through text-gray-400' : ''}>{m.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className={`${card} p-3 mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]`}>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Add a quarterly priority" className={input} />
        <OwnerSelect value={form.owner_id} onChange={v => setForm({ ...form, owner_id: v })} />
        <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={input} aria-label="Due date" />
        <button className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"><Plus className="w-4 h-4" /> Add</button>
        <textarea value={form.milestones} onChange={e => setForm({ ...form, milestones: e.target.value })} placeholder="Milestones, one per line (optional)" rows={2} className={`${input} md:col-span-4`} />
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

function periodsFor(cadence: Cadence) {
  const out: { start: string; label: string }[] = []
  const now = new Date()
  if (cadence === 'daily') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      out.push({ start: ymd(d), label: `${d.getMonth() + 1}/${d.getDate()}` })
    }
  } else if (cadence === 'weekly') {
    const monday = new Date(now); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    for (let i = 7; i >= 0; i--) {
      const d = new Date(monday); d.setDate(d.getDate() - i * 7)
      out.push({ start: ymd(d), label: `${d.getMonth() + 1}/${d.getDate()}` })
    }
  } else if (cadence === 'monthly') {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push({ start: ymd(d), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) })
    }
  } else {
    const q = Math.floor(now.getMonth() / 3)
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getFullYear(), (q - i) * 3, 1)
      out.push({ start: ymd(d), label: `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}` })
    }
  }
  return out
}

function KpiCell({ kpi, start, value }: { kpi: Kpi; start: string; value: number | null | undefined }) {
  const { meetingId } = useMeeting()
  const run = useRun()
  const hit = value != null && kpi.target != null ? value >= kpi.target : null
  return (
    <input
      key={`${start}-${value ?? ''}`}
      type="number"
      step="any"
      defaultValue={value ?? ''}
      onBlur={e => {
        const raw = e.target.value.trim()
        const next = raw === '' ? null : Number(raw)
        if (next === (value ?? null)) return
        run(() => setKpiValue(meetingId, kpi.id, start, next))
      }}
      className={`w-20 text-center border rounded-md px-1 py-1 text-sm ${hit === null ? 'bg-white' : hit ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'}`}
    />
  )
}

export function Metrics({ kpis, values }: { kpis: Kpi[]; values: KpiValue[] }) {
  const { meetingId, myId } = useMeeting()
  const run = useRun()
  const [cadence, setCadence] = useState<Cadence>('weekly')
  const [form, setForm] = useState({ name: '', target: '', unit: '', owner_id: myId })
  const byKey = useMemo(() => new Map(values.map(v => [`${v.kpi_id}|${v.period_start}`, v.value])), [values])
  const periods = useMemo(() => periodsFor(cadence), [cadence])
  const shown = kpis.filter(k => k.cadence === cadence)
  const { peopleById } = useMeeting()

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    await run(() => addKpi(meetingId, { name: form.name, cadence, target: form.target === '' ? null : Number(form.target), unit: form.unit, owner_id: form.owner_id }))
    setForm({ ...form, name: '', target: '', unit: '' })
  }

  return (
    <div>
      <SectionTitle>KPIs</SectionTitle>
      <div className="flex gap-1 border-b mb-4 overflow-x-auto">
        {CADENCES.map(c => (
          <button key={c} onClick={() => setCadence(c)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize whitespace-nowrap ${cadence === c ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {c} ({kpis.filter(k => k.cadence === c).length})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty title={`Your ${cadence} KPIs live here`} hint="Track the numbers that tell you how things are trending." />
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">KPI</th>
                <th className="px-2 py-2 font-semibold">Target</th>
                {periods.map(p => <th key={p.start} className="px-2 py-2 font-semibold whitespace-nowrap">{p.label}</th>)}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map(k => (
                <tr key={k.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar person={peopleById.get(k.owner_id ?? '')} size="sm" />
                      <span className="font-medium">{k.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center text-gray-600 whitespace-nowrap">{k.target ?? '—'}{k.unit ? ` ${k.unit}` : ''}</td>
                  {periods.map(p => (
                    <td key={p.start} className="px-2 py-2 text-center"><KpiCell kpi={k} start={p.start} value={byKey.get(`${k.id}|${p.start}`)} /></td>
                  ))}
                  <td className="px-2"><button onClick={() => confirm(`Delete KPI "${k.name}" and its values?`) && run(() => deleteKpi(meetingId, k.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={add} className={`${card} p-3 mt-4 grid gap-2 md:grid-cols-[1fr_8rem_6rem_auto_auto]`}>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={`Add a ${cadence} KPI`} className={input} />
        <input type="number" step="any" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} placeholder="Target" className={input} />
        <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Unit" className={input} />
        <OwnerSelect value={form.owner_id} onChange={v => setForm({ ...form, owner_id: v })} />
        <button className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"><Plus className="w-4 h-4" /> Add</button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Headlines
// ---------------------------------------------------------------------------

export function Headlines({ headlines }: { headlines: Headline[] }) {
  const { meetingId, myId, peopleById } = useMeeting()
  const run = useRun()
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(myId)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await run(() => addHeadline(meetingId, title, owner))
    setTitle('')
  }

  return (
    <div>
      <SectionTitle>Headlines <span className="text-gray-400 font-normal text-base">({headlines.length})</span></SectionTitle>
      {headlines.length === 0 ? (
        <Empty title="No headlines yet" hint="Share customer or employee news in one sentence." />
      ) : (
        <ul className={`${card} divide-y`}>
          {headlines.map(h => (
            <li key={h.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar person={peopleById.get(h.owner_id ?? '')} />
              <span className="flex-1 min-w-0">{h.title}</span>
              <button onClick={() => run(() => deleteHeadline(meetingId, h.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className={`${card} p-3 mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]`}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a headline" className={input} />
        <OwnerSelect value={owner} onChange={setOwner} />
        <button className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"><Plus className="w-4 h-4" /> Add</button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

export function Todos({ todos }: { todos: Todo[] }) {
  const { meetingId, myId, run: liveRun, peopleById } = useMeeting()
  const run = useRun()
  const [form, setForm] = useState({ title: '', owner_id: myId, due_date: '' })
  const [showDone, setShowDone] = useState(true)
  const done = todos.filter(t => t.done_at).length
  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0
  const sorted = [...todos].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const shown = sorted.filter(t => showDone || !t.done_at)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    await run(() => addTodo(meetingId, { title: form.title, owner_id: form.owner_id, due_date: form.due_date || null, run_id: liveRun?.id ?? null }))
    setForm({ ...form, title: '', due_date: '' })
  }

  return (
    <div>
      <SectionTitle right={
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show completed</label>
          <span className="font-semibold text-blue-700">{pct}% completed</span>
        </div>
      }>To-dos <span className="text-gray-400 font-normal text-base">({todos.length})</span></SectionTitle>
      <div className="h-2 rounded-full bg-gray-200 mb-4 overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} /></div>

      {shown.length === 0 ? (
        <Empty title="No to-dos" hint="Commitments made in the meeting end up here. Aim for a 7-day deadline." />
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(t => {
            const overdue = !t.done_at && t.due_date && t.due_date < todayStr()
            return (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  onClick={() => run(() => setTodoDone(meetingId, t.id, !t.done_at))}
                  aria-label={t.done_at ? 'Mark not done' : 'Mark done'}
                  className={`w-5 h-5 rounded-full border-2 shrink-0 inline-flex items-center justify-center ${t.done_at ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 hover:border-blue-500'}`}
                >
                  {t.done_at && <Check className="w-3 h-3" />}
                </button>
                <Avatar person={peopleById.get(t.owner_id ?? '')} size="sm" />
                <span className={`flex-1 min-w-0 ${t.done_at ? 'line-through text-gray-400' : ''}`}>{t.title}</span>
                <span className={`text-xs whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date ?? ''}</span>
                <button onClick={() => run(() => deleteTodo(meetingId, t.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={add} className={`${card} p-3 mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]`}>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Add a to-do" className={input} />
        <OwnerSelect value={form.owner_id} onChange={v => setForm({ ...form, owner_id: v })} />
        <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={input} aria-label="Due date" title="Defaults to 7 days from today" />
        <button className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"><Plus className="w-4 h-4" /> Add</button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

const ISSUE_TABS: IssueStatus[] = ['short_term', 'parking_lot', 'solved', 'sent']

export function Issues({ issues }: { issues: Issue[] }) {
  const { meetingId, myId, run: liveRun, peopleById } = useMeeting()
  const run = useRun()
  const [tab, setTab] = useState<IssueStatus>('short_term')
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(myId)
  const shown = issues.filter(i => i.status === tab)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await run(() => addIssue(meetingId, title, owner))
    setTitle('')
  }

  return (
    <div>
      <SectionTitle>Issues</SectionTitle>
      <div className="flex gap-1 border-b mb-4 overflow-x-auto">
        {ISSUE_TABS.map(s => (
          <button key={s} onClick={() => setTab(s)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === s ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {ISSUE_STATUS_LABEL[s]} ({issues.filter(i => i.status === s).length})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty title={`No ${ISSUE_STATUS_LABEL[tab].toLowerCase()} issues`} hint="Capture what is worth a real discussion this week." />
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(i => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Avatar person={peopleById.get(i.owner_id ?? '')} size="sm" />
              <span className={`flex-1 min-w-[10rem] ${i.status === 'solved' ? 'line-through text-gray-400' : ''}`}>{i.title}</span>
              <div className="flex items-center gap-1.5 text-xs">
                {i.status !== 'solved' && <button onClick={() => run(() => setIssueStatus(meetingId, i.id, 'solved', liveRun?.id))} className="px-2 py-1 rounded-md bg-green-50 text-green-700 font-semibold hover:bg-green-100">Solved</button>}
                {i.status !== 'short_term' && <button onClick={() => run(() => setIssueStatus(meetingId, i.id, 'short_term'))} className="px-2 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">Short term</button>}
                {i.status !== 'parking_lot' && i.status !== 'solved' && <button onClick={() => run(() => setIssueStatus(meetingId, i.id, 'parking_lot'))} className="px-2 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">Park</button>}
                {i.status !== 'sent' && i.status !== 'solved' && <button onClick={() => run(() => setIssueStatus(meetingId, i.id, 'sent'))} className="px-2 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">Send</button>}
                <button onClick={() => confirm('Delete this issue?') && run(() => deleteIssue(meetingId, i.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500 ml-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className={`${card} p-3 mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]`}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add an issue" className={input} />
        <OwnerSelect value={owner} onChange={setOwner} />
        <button className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"><Plus className="w-4 h-4" /> Add</button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wrap-up
// ---------------------------------------------------------------------------

export function WrapUp({ todos, issues, ratings, pageSeconds }: { todos: Todo[]; issues: Issue[]; ratings: Rating[]; pageSeconds: () => Record<string, number> }) {
  const { run: liveRun, myId, isLeader, people, attendeeIds, peopleById } = useMeeting()
  const run = useRun()
  const mine = ratings.find(r => r.user_id === myId)
  const [rating, setRating] = useState<number | null>(mine?.rating ?? null)
  const [feedback, setFeedback] = useState(mine?.feedback ?? '')
  const [saved, setSaved] = useState(false)
  const [archiveTodos, setArchiveTodos] = useState(true)
  const [archiveHeadlines, setArchiveHeadlines] = useState(true)
  const [sendEmail, setSendEmail] = useState(false)
  const [includeDetails, setIncludeDetails] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [concluding, setConcluding] = useState(false)

  if (!liveRun) {
    return (
      <div>
        <SectionTitle>Wrap-up</SectionTitle>
        <Empty title="Start the meeting to wrap up" hint="Ratings, feedback and the meeting summary are available while a meeting is running." />
      </div>
    )
  }

  const newTodos = todos.filter(t => t.run_id === liveRun.id)
  const solved = issues.filter(i => i.solved_run_id === liveRun.id)
  const attendees = people.filter(p => attendeeIds.includes(p.id))
  const rated = ratings.filter(r => r.rating != null)
  const avg = rated.length ? (rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length).toFixed(1) : null

  async function save() {
    await run(() => saveRating(liveRun!.id, rating, feedback))
    setSaved(true)
  }

  async function conclude() {
    if (!confirm('Conclude this meeting? This saves the summary for everyone.')) return
    setConcluding(true)
    const summaryId = await run(() => concludeMeeting(liveRun!.id, { archiveTodos, archiveHeadlines, pageSeconds: pageSeconds() }))
    if (summaryId && sendEmail) {
      try {
        const n = await emailSummary(summaryId, { includeDetails, includeNotes })
        alert(`Summary emailed to ${n} attendee${n === 1 ? '' : 's'}.`)
      } catch (err: any) {
        alert('The meeting was concluded, but the summary email failed: ' + err.message + '\n\nYou can retry from the Summary tab.')
      }
    }
    setConcluding(false)
  }

  return (
    <div className="space-y-4">
      <SectionTitle>Wrap-up</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <div className={`${card} p-4`}>
          <div className="text-sm font-semibold mb-1">To-dos created in this meeting</div>
          <div className="text-sm text-gray-600 mb-2">Your team committed to {newTodos.length} new to-do{newTodos.length === 1 ? '' : 's'}.</div>
          <ul className="space-y-1">{newTodos.map(t => <li key={t.id} className="text-sm flex items-center gap-2"><Avatar person={peopleById.get(t.owner_id ?? '')} size="sm" />{t.title}<span className="ml-auto text-xs text-gray-500">{t.due_date}</span></li>)}</ul>
        </div>
        <div className={`${card} p-4`}>
          <div className="text-sm font-semibold mb-1">Issues solved</div>
          <div className="text-sm text-gray-600 mb-2">You and your teammates solved {solved.length} issue{solved.length === 1 ? '' : 's'} today.</div>
          <ul className="space-y-1">{solved.map(i => <li key={i.id} className="text-sm flex items-center gap-2"><Check className="w-4 h-4 text-green-600" />{i.title}</li>)}</ul>
        </div>
      </div>

      <div className={`${card} p-4`}>
        <div className="text-sm font-semibold">Meeting rating</div>
        <p className="text-sm text-gray-500 mb-3">Rate the meeting 1-10. Rating below 8? Add it to the issues list.</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => { setRating(n); setSaved(false) }} className={`w-9 h-9 rounded-lg text-sm font-semibold border ${rating === n ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>{n}</button>
          ))}
        </div>
        <textarea value={feedback} onChange={e => { setFeedback(e.target.value); setSaved(false) }} rows={2} placeholder="How can we get even better next week? (optional)" className={`${input} w-full`} />
        <div className="flex items-center gap-3 mt-2">
          <button onClick={save} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">Save my rating</button>
          {saved && <span className="text-sm text-green-700">Saved</span>}
        </div>

        <div className="mt-4 border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Ratings {liveRun.ratings_revealed && avg && <span className="text-blue-700">· average {avg}</span>}</div>
            {isLeader && !liveRun.ratings_revealed && <button onClick={() => run(() => revealRatings(liveRun.id))} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50">Reveal ratings and feedback</button>}
          </div>
          <ul className="space-y-1.5">
            {attendees.map(p => {
              const r = ratings.find(x => x.user_id === p.id)
              const visible = liveRun.ratings_revealed || p.id === myId
              return (
                <li key={p.id} className="flex items-start gap-2 text-sm">
                  <Avatar person={p} size="sm" />
                  <span className="w-36 truncate">{p.full_name}</span>
                  {r?.rating != null ? (visible ? <span className="font-semibold">{r.rating}{r.feedback ? <span className="font-normal text-gray-600"> — {r.feedback}</span> : null}</span> : <span className="text-gray-400">Rated</span>) : <span className="text-gray-400">Waiting…</span>}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {isLeader ? (
        <div className={`${card} p-4`}>
          <div className="text-sm font-semibold">Concluding actions</div>
          <p className="text-sm text-gray-500 mb-3">Save the summary and archive completed items for the next meeting.</p>
          <label className="flex items-center gap-2 text-sm mb-1.5"><input type="checkbox" checked={archiveTodos} onChange={e => setArchiveTodos(e.target.checked)} /> Archive completed to-dos</label>
          <label className="flex items-center gap-2 text-sm mb-1.5"><input type="checkbox" checked={archiveHeadlines} onChange={e => setArchiveHeadlines(e.target.checked)} /> Archive headlines</label>
          <label className="flex items-center gap-2 text-sm mb-1.5"><input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} /> Email the summary to all attendees</label>
          {sendEmail && (
            <div className="ml-6 mb-4 space-y-1.5">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeDetails} onChange={e => setIncludeDetails(e.target.checked)} /> Include headlines and to-do details</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeNotes} onChange={e => setIncludeNotes(e.target.checked)} /> Include meeting notes</label>
            </div>
          )}
          {!sendEmail && <div className="mb-3" />}
          <button onClick={conclude} disabled={concluding} className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">{concluding ? 'Concluding…' : 'Conclude meeting'}</button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">The meeting leader concludes the meeting.</p>
      )}
    </div>
  )
}
