'use client'

import { notify, confirmDialog } from '../ui/feedback'
import { useState } from 'react'
import { Plus, Trash2, Check, ListChecks, AlertCircle } from 'lucide-react'
import { AddAttendeeDialog } from './AddAttendee'
import { OwnersSelect } from './OwnersSelect'
import {
  addHeadline, deleteHeadline, addTodo, setTodoDone, deleteTodo, addIssue, setIssueStatus, deleteIssue,
  saveRating, revealRatings, concludeMeeting,
} from '../actions'
import { useMeeting, useRun } from './context'
import { emailSummary } from './emailSummary'
import ItemDrawer from './ItemDrawer'
import NewItemDrawer from './NewItemDrawer'
import Avatar from '../Avatar'
import {
  card, input, todayStr, Empty, NewBadge, OwnerSelect, ItemTitle, SortSelect, sortByOwner, sortNewest, SectionTitle, Segmented,
  type Headline, type Todo, type Issue, type Rating, type OtherMeetings, type SortKey,
} from './shared'
import { ISSUE_STATUS_LABEL, type IssueStatus } from '@/lib/meetings'

export type { Headline, Todo, Issue, Goal, Kpi, KpiValue, Rating, KpiCustomGoal, Milestone, OtherMeetings } from './shared'

// ---------------------------------------------------------------------------
// Headlines
// ---------------------------------------------------------------------------

export function Headlines({ headlines, todos, issues, otherMeetings }: { headlines: Headline[]; todos: Todo[]; issues: Issue[]; otherMeetings: OtherMeetings }) {
  const { meetingId, myId, peopleById } = useMeeting()
  const run = useRun()
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(myId)
  const [sort, setSort] = useState<SortKey>('owner')
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ kind: 'todo' | 'issue'; headline: Headline } | null>(null)
  const sortedHeadlines = sort === 'owner' ? sortByOwner(headlines, peopleById) : sort === 'newest' ? sortNewest(headlines) : headlines
  const open = headlines.find(h => h.id === openId)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await run(() => addHeadline(meetingId, title, owner))
    setTitle('')
  }

  return (
    <div>
      <SectionTitle right={<SortSelect value={sort} onChange={setSort} />}>Headlines <span className="text-gray-500 font-normal text-base">({headlines.length})</span></SectionTitle>
      <form onSubmit={add} className={`${card} p-2 mb-3 grid gap-1.5 md:grid-cols-[auto_1fr_auto]`}>
        <OwnerSelect value={owner} onChange={setOwner} />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a headline" className={input} />
        <button className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Add</button>
      </form>
      {headlines.length === 0 ? (
        <Empty title="No headlines yet" hint="Share customer or employee news in one sentence." />
      ) : (
        <ul className={`${card} divide-y`}>
          {sortedHeadlines.map(h => (
            <li key={h.id} className="flex items-start sm:items-center justify-between gap-2 px-3 py-2 sm:py-2.5">
              <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                <div className="shrink-0 pt-0.5 sm:pt-0">
                  <Avatar person={peopleById.get(h.owner_id ?? '')} size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <ItemTitle title={h.title} hasDetails={!!h.details} onOpen={() => setOpenId(h.id)} lineClamp={2} />
                  <div className="flex flex-wrap gap-1 mt-0.5 sm:hidden">
                    {todos.some(t => t.source_headline_id === h.id) && <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 rounded px-1">To-do created</span>}
                    {issues.some(i => i.source_headline_id === h.id) && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded px-1">Issue created</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs shrink-0 self-center">
                {todos.some(t => t.source_headline_id === h.id) && <span className="hidden sm:inline text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-1.5 py-0.5">To-do created</span>}
                {issues.some(i => i.source_headline_id === h.id) && <span className="hidden sm:inline text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-1.5 py-0.5">Issue created</span>}
                <button
                  onClick={() => setDraft({ kind: 'todo', headline: h })}
                  title="Create a new to-do from this headline"
                  className="inline-flex items-center gap-0.5 px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 text-xs"
                ><ListChecks className="w-3.5 h-3.5" /> <span className="hidden sm:inline">To-do</span></button>
                <button
                  onClick={() => setDraft({ kind: 'issue', headline: h })}
                  title="Create a new issue from this headline"
                  className="inline-flex items-center gap-0.5 px-2 py-1 rounded bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 text-xs"
                ><AlertCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Issue</span></button>
                <button onClick={async () => { if (await confirmDialog('Delete this headline?')) { await (run(() => deleteHeadline(meetingId, h.id))) } }} aria-label="Delete" className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && <ItemDrawer key={open.id} kind="headline" item={open} otherMeetings={otherMeetings} onClose={() => setOpenId(null)} onCreateFrom={to => { setOpenId(null); setDraft({ kind: to, headline: open }) }} />}
      {draft && (
        <NewItemDrawer
          key={`${draft.kind}-${draft.headline.id}`}
          kind={draft.kind}
          headlineId={draft.headline.id}
          otherMeetings={otherMeetings}
          draft={{ title: draft.headline.title, details: draft.headline.details, owner_id: draft.headline.owner_id, due_date: null }}
          sourceLabel={`Copied from the headline “${draft.headline.title}”.`}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

export function Todos({ todos, otherMeetings }: { todos: Todo[]; otherMeetings: OtherMeetings }) {
  const { meetingId, myId, run: liveRun, peopleById } = useMeeting()
  const run = useRun()
  const [form, setForm] = useState({ title: '', owner_ids: [myId], due_date: '' })
  const [showDone, setShowDone] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = todos.find(t => t.id === openId)
  // Ticks show at once; the saved state takes over when the page refreshes (a failed save puts it back).
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({})
  const doneSig = todos.map(t => `${t.id}:${t.done_at ? 1 : 0}`).join('|')
  const [seenDone, setSeenDone] = useState(doneSig)
  if (seenDone !== doneSig) {
    setSeenDone(doneSig)
    setLocalDone(prev => Object.fromEntries(Object.entries(prev).filter(([id, v]) => !!todos.find(t => t.id === id)?.done_at !== v)))
  }
  const isDone = (t: Todo) => localDone[t.id] ?? !!t.done_at
  async function toggleDone(t: Todo) {
    const next = !isDone(t)
    setLocalDone(prev => ({ ...prev, [t.id]: next }))
    const ok = await run(async () => { await setTodoDone(meetingId, t.id, next); return true })
    if (!ok) setLocalDone(prev => { const n = { ...prev }; delete n[t.id]; return n })
  }
  const done = todos.filter(isDone).length
  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0
  const [sort, setSort] = useState<SortKey>('owner')
  const byDue = [...todos].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const sorted = sort === 'owner' ? sortByOwner(todos, peopleById) : sort === 'newest' ? sortNewest(todos) : byDue
  const shown = sorted.filter(t => showDone || !isDone(t))

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    if (form.owner_ids.length === 0) return
    await run(() => addTodo(meetingId, { title: form.title, owner_id: form.owner_ids[0], owner_ids: form.owner_ids, due_date: form.due_date || null, run_id: liveRun?.id ?? null }))
    setForm({ ...form, title: '', due_date: '' })
  }

  return (
    <div>
      <SectionTitle right={
        <div className="flex items-center gap-4 text-sm">
          <SortSelect value={sort} onChange={setSort} defaultLabel="Due date" />
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show completed</label>
          <span className="font-semibold text-blue-700">{pct}% completed</span>
        </div>
      }>To-dos <span className="text-gray-500 font-normal text-base">({todos.length})</span></SectionTitle>
      <div className="h-2 rounded-full bg-gray-200 mb-4 overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} /></div>
      <form onSubmit={add} className={`${card} p-2 mb-3 grid gap-1.5 md:grid-cols-[auto_1fr_auto_auto]`}>
        <OwnersSelect value={form.owner_ids} onChange={ids => setForm({ ...form, owner_ids: ids })} />
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={form.owner_ids.length > 1 ? `Add a to-do for ${form.owner_ids.length} people` : 'Add a to-do'} className={input} />
        <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={input} aria-label="Due date" title="Defaults to 7 days from today" />
        <button className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Add</button>
      </form>


      {shown.length === 0 ? (
        <Empty title="No to-dos" hint="Commitments made in the meeting end up here. Aim for a 7-day deadline." />
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(t => {
            const tDone = isDone(t)
            const overdue = !tDone && t.due_date && t.due_date < todayStr()
            return (
              <li key={t.id} className={`flex items-start sm:items-center justify-between gap-2.5 px-3 py-2 sm:py-2.5 transition-colors ${tDone ? 'bg-gray-50/60' : ''}`}>
                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <button
                    onClick={() => toggleDone(t)}
                    aria-label={tDone ? 'Mark not done' : 'Mark done'}
                    aria-pressed={tDone}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 shrink-0 inline-flex items-center justify-center transition duration-150 active:scale-90 mt-0.5 sm:mt-0 ${tDone ? 'bg-blue-600 border-blue-600 text-white scale-100' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'}`}
                  >
                    {tDone && <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={3} />}
                  </button>
                  <div className="shrink-0 pt-0.5 sm:pt-0">
                    <Avatar person={peopleById.get(t.owner_id ?? '')} size="sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <ItemTitle title={t.title} hasDetails={!!t.details} struck={tDone} onOpen={() => setOpenId(t.id)} lineClamp={2} />
                    {t.source_headline_id && <span className="block sm:inline text-[10px] sm:text-xs text-gray-400">from headline</span>}
                  </div>
                  <NewBadge createdAt={t.created_at} />
                </div>
                <div className="flex items-center gap-2 shrink-0 self-center">
                  <span className={`text-[11px] sm:text-xs whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date ?? ''}</span>
                  <button onClick={async () => { if (await confirmDialog('Delete this to-do?')) { await (run(() => deleteTodo(meetingId, t.id))) } }} aria-label="Delete" className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {open && <ItemDrawer key={open.id} kind="todo" item={{ ...open, todo_status: open.status }} otherMeetings={otherMeetings} onClose={() => setOpenId(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

const ISSUE_TABS: IssueStatus[] = ['short_term', 'parking_lot', 'solved', 'sent']

export function Issues({ issues, otherMeetings }: { issues: Issue[]; otherMeetings: OtherMeetings }) {
  const { meetingId, myId, run: liveRun, peopleById } = useMeeting()
  const run = useRun()
  const [openId, setOpenId] = useState<string | null>(null)
  const open = issues.find(i => i.id === openId)
  const [tab, setTab] = useState<IssueStatus>('short_term')
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(myId)
  const [sort, setSort] = useState<SortKey>('default')
  // A status change shows at once; the saved state takes over when the page refreshes.
  const [localStatus, setLocalStatus] = useState<Record<string, IssueStatus>>({})
  const statusSig = issues.map(i => `${i.id}:${i.status}`).join('|')
  const [seenStatus, setSeenStatus] = useState(statusSig)
  if (seenStatus !== statusSig) {
    setSeenStatus(statusSig)
    setLocalStatus(prev => Object.fromEntries(Object.entries(prev).filter(([id, v]) => issues.find(i => i.id === id)?.status !== v)))
  }
  const statusOf = (i: Issue): IssueStatus => localStatus[i.id] ?? i.status
  async function move(i: Issue, status: IssueStatus) {
    setLocalStatus(prev => ({ ...prev, [i.id]: status }))
    const ok = await run(async () => { await setIssueStatus(meetingId, i.id, status, status === 'solved' ? liveRun?.id : null); return true })
    if (!ok) setLocalStatus(prev => { const n = { ...prev }; delete n[i.id]; return n })
  }
  // Issues solved in this meeting stay in the short-term list, struck through,
  // so the room can see what was just dealt with.
  const inTab = tab === 'short_term'
    ? [...issues.filter(i => statusOf(i) === 'short_term'), ...issues.filter(i => statusOf(i) === 'solved')]
    : issues.filter(i => statusOf(i) === tab)
  const shown = sort === 'owner' ? sortByOwner(inTab, peopleById) : sort === 'newest' ? sortNewest(inTab) : inTab

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await run(() => addIssue(meetingId, title, owner))
    setTitle('')
  }

  return (
    <div>
      <SectionTitle right={<SortSelect value={sort} onChange={setSort} />}>Issues</SectionTitle>
      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={ISSUE_TABS.map(s => ({ key: s, label: `${ISSUE_STATUS_LABEL[s]} (${issues.filter(i => statusOf(i) === s).length})` }))}
        />
      </div>

      <form onSubmit={add} className={`${card} p-2 mb-3 grid gap-1.5 md:grid-cols-[auto_1fr_auto]`}>
        <OwnerSelect value={owner} onChange={setOwner} />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add an issue" className={input} />
        <button className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Add</button>
      </form>

      {shown.length === 0 ? (
        <Empty title={`No ${ISSUE_STATUS_LABEL[tab].toLowerCase()} issues`} hint="Capture what is worth a real discussion this week." />
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(i => {
            const st = statusOf(i)
            return (
            <li key={i.id} className={`flex items-start sm:items-center justify-between gap-2 px-3 py-2 sm:py-2.5 transition-colors ${st === 'solved' ? 'bg-green-50/50' : ''}`}>
              <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                <div className="shrink-0 pt-0.5 sm:pt-0">
                  <Avatar person={peopleById.get(i.owner_id ?? '')} size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <ItemTitle title={i.title} hasDetails={!!i.details} struck={st === 'solved'} onOpen={() => setOpenId(i.id)} lineClamp={2} />
                  {i.source_headline_id && <span className="block sm:inline text-[10px] sm:text-xs text-gray-400">from headline</span>}
                </div>
                <NewBadge createdAt={i.created_at} />
              </div>

              <div className="flex items-center gap-1 text-xs shrink-0 self-center">
                {st === 'solved' ? (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 text-xs">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      <span className="hidden sm:inline">Solved</span>
                    </span>
                    <button onClick={() => move(i, 'short_term')} className="px-2 py-0.5 rounded border bg-white text-gray-600 hover:bg-gray-50 text-xs">Reopen</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button onClick={() => move(i, 'solved')} title="Mark solved" className="inline-flex items-center gap-0.5 px-2 py-1 rounded bg-green-50 text-green-700 font-semibold hover:bg-green-100 active:scale-95 transition text-xs">
                      <Check className="w-3.5 h-3.5" />
                      <span>Solve</span>
                    </button>
                    {st !== 'short_term' && <button onClick={() => move(i, 'short_term')} className="px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition text-xs">Short</button>}
                    {st !== 'parking_lot' && <button onClick={() => move(i, 'parking_lot')} title="Move to KIV / parking lot" className="px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition text-xs">KIV</button>}
                    <button onClick={async () => { if (await confirmDialog('Delete this issue?')) { await (run(() => deleteIssue(meetingId, i.id))) } }} aria-label="Delete" className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                  </div>
                )}
              </div>
            </li>
            )
          })}
        </ul>
      )}

      {open && <ItemDrawer key={open.id} kind="issue" item={{ ...open, issue_status: open.status }} otherMeetings={otherMeetings} onClose={() => setOpenId(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wrap-up
// ---------------------------------------------------------------------------

// One attendee's rating, on one line: name, 1-10, feedback. Clicking a number saves immediately; feedback saves
// when you click away. Shown read-only to people who can't enter it.
function RatingRow({ person, existing, editable, onBehalf, revealed, runId }: {
  person: { id: string; full_name: string | null }
  existing: Rating | undefined
  editable: boolean
  onBehalf: boolean
  revealed: boolean
  runId: string
}) {
  const run = useRun()
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null)
  const [feedback, setFeedback] = useState(existing?.feedback ?? '')
  const [saved, setSaved] = useState(false)

  async function persist(nextRating: number | null, nextFeedback: string) {
    setSaved(false)
    const ok = await run(async () => { await saveRating(runId, nextRating, nextFeedback, onBehalf ? person.id : undefined); return true })
    if (ok) setSaved(true)
  }

  const name = (
    <div className="flex items-center gap-2 min-w-0 md:w-44 shrink-0">
      <Avatar person={person} size="sm" />
      <span className="text-sm font-medium truncate">{person.full_name}{editable && !onBehalf && <span className="text-gray-500 font-normal"> (you)</span>}</span>
    </div>
  )

  if (!editable) {
    const r = existing
    return (
      <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        {name}
        {r?.rating != null
          ? (revealed
            ? <span className="text-xs sm:text-sm"><span className={`inline-flex w-6 h-6 sm:w-7 sm:h-7 items-center justify-center rounded-md font-bold mr-2 ${r.rating < 8 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{r.rating}</span>{r.feedback && <span className="text-gray-600 text-xs sm:text-sm">{r.feedback}</span>}</span>
            : <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Rated</span>)
          : <span className="text-xs text-gray-500">Waiting…</span>}
      </li>
    )
  }

  return (
    <li className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-3 py-2.5">
      <div className="flex items-center justify-between w-full md:w-auto">
        {name}
        {saved && <span className="md:hidden text-xs text-emerald-600 font-medium inline-flex items-center gap-0.5"><Check className="w-3.5 h-3.5" /> Saved</span>}
      </div>

      {/* 10 Rating Buttons: use grid on mobile so 100% fits within screen width! */}
      <div className="grid grid-cols-10 gap-1 w-full max-w-sm md:w-auto shrink-0" role="radiogroup" aria-label={`Rating for ${person.full_name}`}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            onClick={() => { setRating(n); persist(n, feedback) }}
            aria-label={`Rate ${n}`}
            className={`h-7 sm:h-7 rounded-md text-xs font-semibold border transition active:scale-90 flex items-center justify-center ${rating === n ? (n < 8 ? 'bg-amber-500 border-amber-500 text-white' : 'bg-blue-600 border-blue-600 text-white') : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >{n}</button>
        ))}
      </div>

      <div className="flex items-center gap-2 w-full flex-1 min-w-0">
        <input
          value={feedback}
          onChange={e => { setFeedback(e.target.value); setSaved(false) }}
          onBlur={() => { if (rating !== null && feedback.trim() !== (existing?.feedback ?? '').trim()) persist(rating, feedback) }}
          placeholder={rating !== null && rating < 8 ? 'What would make it an 8+? (optional)' : 'Feedback (optional)'}
          className={`${input} flex-1 min-w-0 text-xs sm:text-sm py-1.5`}
          aria-label={`Feedback from ${person.full_name}`}
        />
        <span className="hidden md:inline-block w-4 shrink-0" aria-live="polite">{saved && <Check className="w-4 h-4 text-emerald-600" aria-label="Saved" />}</span>
      </div>
    </li>
  )
}

export function WrapUp({ todos, issues, ratings, pageSeconds }: { todos: Todo[]; issues: Issue[]; ratings: Rating[]; pageSeconds: () => Record<string, number> }) {
  const { run: liveRun, myId, isLeader, people, attendeeIds, peopleById } = useMeeting()
  const run = useRun()
  const [archiveTodos, setArchiveTodos] = useState(true)
  const [archiveHeadlines, setArchiveHeadlines] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)
  const [includeDetails, setIncludeDetails] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [concluding, setConcluding] = useState(false)
  const [adding, setAdding] = useState(false)

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
  // Only the people checked in on the Check-in page rate the meeting.
  const attendance = (liveRun.attendance ?? {}) as Record<string, boolean>
  const present = attendees.filter(p => attendance[p.id])
  const absent = attendees.length - present.length
  const rated = ratings.filter(r => r.rating != null && present.some(p => p.id === r.user_id))
  const avg = rated.length ? (rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length).toFixed(1) : null

  async function conclude() {
    if (!(await confirmDialog('Conclude this meeting? This saves the summary for everyone.'))) return
    setConcluding(true)
    const summaryId = await run(() => concludeMeeting(liveRun!.id, { archiveTodos, archiveHeadlines, pageSeconds: pageSeconds() }))
    if (summaryId && sendEmail) {
      try {
        // No recipient list = every attendee of the meeting, absent ones included.
        const r = await emailSummary(summaryId, { includeDetails, includeNotes })
        notify(`Minutes e-mailed to ${r.sent} attendee${r.sent === 1 ? '' : 's'}.`, 'success')
      } catch (err: any) {
        notify('The meeting was concluded, but the summary email failed: ' + err.message + '\n\nYou can retry from the Summary tab.', 'error')
      }
    }
    setConcluding(false)
  }

  return (
    <div className="space-y-3">
      <SectionTitle>Wrap-up</SectionTitle>

      {/* What this meeting produced */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className={`${card} p-3`}>
          <div className="flex items-center gap-2 text-sm font-semibold mb-1.5"><ListChecks className="w-4 h-4 text-blue-600" /> New to-dos <span className="ml-auto text-xs font-bold bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">{newTodos.length}</span></div>
          {newTodos.length === 0 ? <p className="text-xs text-gray-500">None created in this meeting.</p> : (
            <ul className="space-y-1.5 max-h-36 overflow-y-auto">{newTodos.map(t => <li key={t.id} className="text-xs sm:text-sm flex items-center gap-2"><Avatar person={peopleById.get(t.owner_id ?? '')} size="sm" /><span className="truncate flex-1 min-w-0">{t.title}</span><span className="ml-auto text-xs text-gray-500 shrink-0">{t.due_date}</span></li>)}</ul>
          )}
        </div>
        <div className={`${card} p-3`}>
          <div className="flex items-center gap-2 text-sm font-semibold mb-1.5"><AlertCircle className="w-4 h-4 text-emerald-600" /> Issues solved <span className="ml-auto text-xs font-bold bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">{solved.length}</span></div>
          {solved.length === 0 ? <p className="text-xs text-gray-500">None solved in this meeting.</p> : (
            <ul className="space-y-1.5 max-h-36 overflow-y-auto">{solved.map(i => <li key={i.id} className="text-xs sm:text-sm flex items-center gap-2"><Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" /><span className="truncate flex-1 min-w-0">{i.title}</span></li>)}</ul>
          )}
        </div>
      </div>

      {/* Ratings */}
      <div className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 border-b bg-gray-50">
          <div className="text-sm font-semibold">Rate this meeting</div>
          <span className="text-xs text-gray-500">{rated.length} of {present.length} rated{absent > 0 ? ` · ${absent} not checked in` : ''}</span>
          {liveRun.ratings_revealed && avg && <span className="text-xs font-bold bg-blue-600 text-white rounded-full px-2.5 py-0.5">Average {avg}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50" title="Someone joined during the meeting"><Plus className="w-3.5 h-3.5" /> Attendee</button>
            {isLeader && !liveRun.ratings_revealed && <button onClick={() => run(() => revealRatings(liveRun.id))} disabled={rated.length === 0} className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40">Reveal</button>}
          </div>
        </div>
        {present.length === 0 ? (
          <p className="px-3 py-6 text-sm text-gray-500 text-center">Nobody is checked in. Tick people on the Check-in page, or add someone with <b>+ Attendee</b>.</p>
        ) : (
          <ul className="divide-y">
            {present.map(p => (
              <RatingRow
                key={p.id}
                person={p}
                existing={ratings.find(x => x.user_id === p.id)}
                editable={p.id === myId || isLeader}
                onBehalf={p.id !== myId}
                revealed={liveRun.ratings_revealed}
                runId={liveRun.id}
              />
            ))}
          </ul>
        )}
        <p className="px-3 py-2 border-t text-xs text-gray-500">1-10. Below 8? Add the reason to the issues list.{isLeader ? ' As host you can rate for anyone.' : ''}</p>
      </div>

      {/* Conclude */}
      {isLeader ? (
        <div className={`${card} p-3`}>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-x-5 text-xs sm:text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={archiveTodos} onChange={e => setArchiveTodos(e.target.checked)} /> Archive done to-dos</label>
            <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={archiveHeadlines} onChange={e => setArchiveHeadlines(e.target.checked)} /> Archive headlines</label>
            <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} /> E-mail minutes to all {attendees.length} attendees{absent > 0 ? ` (incl. ${absent} absent)` : ''}</label>
          </div>
          {sendEmail && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-x-5 mt-2 pl-4 sm:pl-6 text-xs sm:text-sm text-gray-600">
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={includeDetails} onChange={e => setIncludeDetails(e.target.checked)} /> Headline and to-do details</label>
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={includeNotes} onChange={e => setIncludeNotes(e.target.checked)} /> Meeting notes</label>
            </div>
          )}
          <div className="flex items-center justify-end mt-3">
            <button onClick={conclude} disabled={concluding} className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">{concluding ? 'Concluding…' : 'Conclude meeting'}</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">The meeting leader concludes the meeting and sends the minutes.</p>
      )}

      {adding && <AddAttendeeDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
