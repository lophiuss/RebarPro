'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, ListChecks, AlertCircle } from 'lucide-react'
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
  card, input, todayStr, Empty, NewBadge, OwnerSelect, ItemTitle, SortSelect, sortByOwner, SectionTitle, Segmented,
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
  const [sort, setSort] = useState<SortKey>('default')
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ kind: 'todo' | 'issue'; headline: Headline } | null>(null)
  const sortedHeadlines = sort === 'owner' ? sortByOwner(headlines, peopleById) : headlines
  const open = headlines.find(h => h.id === openId)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await run(() => addHeadline(meetingId, title, owner))
    setTitle('')
  }

  return (
    <div>
      <SectionTitle right={<SortSelect value={sort} onChange={setSort} />}>Headlines <span className="text-gray-400 font-normal text-base">({headlines.length})</span></SectionTitle>
      {headlines.length === 0 ? (
        <Empty title="No headlines yet" hint="Share customer or employee news in one sentence." />
      ) : (
        <ul className={`${card} divide-y`}>
          {sortedHeadlines.map(h => (
            <li key={h.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar person={peopleById.get(h.owner_id ?? '')} />
              <ItemTitle title={h.title} hasDetails={!!h.details} onOpen={() => setOpenId(h.id)} />
              <div className="flex items-center gap-1 text-xs">
                {todos.some(t => t.source_headline_id === h.id) && <span className="hidden sm:inline text-[10px] font-semibold text-blue-700 bg-blue-50 rounded-full px-1.5 py-0.5">To-do created</span>}
                {issues.some(i => i.source_headline_id === h.id) && <span className="hidden sm:inline text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-1.5 py-0.5">Issue created</span>}
                <button
                  onClick={() => setDraft({ kind: 'todo', headline: h })}
                  title="Create a new to-do from this headline (the headline stays)"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100"
                ><ListChecks className="w-3.5 h-3.5" /> To-do</button>
                <button
                  onClick={() => setDraft({ kind: 'issue', headline: h })}
                  title="Create a new issue from this headline (the headline stays)"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100"
                ><AlertCircle className="w-3.5 h-3.5" /> Issue</button>
              </div>
              <button onClick={() => confirm('Delete this headline?') && run(() => deleteHeadline(meetingId, h.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className={`${card} p-2 mt-3 grid gap-1.5 md:grid-cols-[1fr_auto_auto]`}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a headline" className={input} />
        <OwnerSelect value={owner} onChange={setOwner} />
        <button className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Add</button>
      </form>
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
  const [form, setForm] = useState({ title: '', owner_id: myId, due_date: '' })
  const [showDone, setShowDone] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = todos.find(t => t.id === openId)
  const done = todos.filter(t => t.done_at).length
  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0
  const [sort, setSort] = useState<SortKey>('default')
  const byDue = [...todos].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const sorted = sort === 'owner' ? sortByOwner(byDue, peopleById) : byDue
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
          <SortSelect value={sort} onChange={setSort} defaultLabel="Due date" />
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
                <ItemTitle title={t.title} hasDetails={!!t.details} struck={!!t.done_at} onOpen={() => setOpenId(t.id)} />
                {t.source_headline_id && <span className="hidden sm:inline text-[10px] text-gray-400">from headline</span>}
                <NewBadge createdAt={t.created_at} />
                <span className={`text-xs whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date ?? ''}</span>
                <button onClick={() => confirm('Delete this to-do?') && run(() => deleteTodo(meetingId, t.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={add} className={`${card} p-2 mt-3 grid gap-1.5 md:grid-cols-[1fr_auto_auto_auto]`}>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Add a to-do" className={input} />
        <OwnerSelect value={form.owner_id} onChange={v => setForm({ ...form, owner_id: v })} />
        <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={input} aria-label="Due date" title="Defaults to 7 days from today" />
        <button className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Add</button>
      </form>
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
  // Issues solved in this meeting stay in the short-term list, struck through,
  // so the room can see what was just dealt with.
  const inTab = tab === 'short_term'
    ? [...issues.filter(i => i.status === 'short_term'), ...issues.filter(i => i.status === 'solved')]
    : issues.filter(i => i.status === tab)
  const shown = sort === 'owner' ? sortByOwner(inTab, peopleById) : inTab

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
          options={ISSUE_TABS.map(s => ({ key: s, label: `${ISSUE_STATUS_LABEL[s]} (${issues.filter(i => i.status === s).length})` }))}
        />
      </div>

      {shown.length === 0 ? (
        <Empty title={`No ${ISSUE_STATUS_LABEL[tab].toLowerCase()} issues`} hint="Capture what is worth a real discussion this week." />
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(i => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Avatar person={peopleById.get(i.owner_id ?? '')} size="sm" />
              <ItemTitle title={i.title} hasDetails={!!i.details} struck={i.status === 'solved'} onOpen={() => setOpenId(i.id)} />
              {i.source_headline_id && <span className="hidden sm:inline text-[10px] text-gray-400">from headline</span>}
              <NewBadge createdAt={i.created_at} />
              {i.status !== 'solved' && (
                <div className="flex items-center gap-1.5 text-xs">
                  <button onClick={() => run(() => setIssueStatus(meetingId, i.id, 'solved', liveRun?.id))} className="px-2 py-1 rounded-md bg-green-50 text-green-700 font-semibold hover:bg-green-100">Solved</button>
                  {i.status !== 'short_term' && <button onClick={() => run(() => setIssueStatus(meetingId, i.id, 'short_term'))} className="px-2 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">Short term</button>}
                  {i.status !== 'parking_lot' && <button onClick={() => run(() => setIssueStatus(meetingId, i.id, 'parking_lot'))} className="px-2 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">Park</button>}
                  <button onClick={() => confirm('Delete this issue?') && run(() => deleteIssue(meetingId, i.id))} aria-label="Delete" className="text-gray-300 hover:text-red-500 ml-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className={`${card} p-2 mt-3 grid gap-1.5 md:grid-cols-[1fr_auto_auto]`}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add an issue" className={input} />
        <OwnerSelect value={owner} onChange={setOwner} />
        <button className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Add</button>
      </form>
      {open && <ItemDrawer key={open.id} kind="issue" item={{ ...open, issue_status: open.status }} otherMeetings={otherMeetings} onClose={() => setOpenId(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wrap-up
// ---------------------------------------------------------------------------

// One attendee's rating. Clicking a number saves immediately; feedback saves
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

  if (!editable) {
    const r = existing
    return (
      <li className="flex items-start gap-3 py-2 text-sm">
        <Avatar person={person} size="sm" />
        <span className="w-40 truncate">{person.full_name}</span>
        {r?.rating != null
          ? (revealed ? <span className="font-semibold">{r.rating}{r.feedback ? <span className="font-normal text-gray-600"> — {r.feedback}</span> : null}</span> : <span className="text-gray-400">Rated</span>)
          : <span className="text-gray-400">Waiting…</span>}
      </li>
    )
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-3 mb-2">
        <Avatar person={person} size="sm" />
        <span className="text-sm font-medium truncate">{person.full_name}{!onBehalf && <span className="text-gray-400 font-normal"> (you)</span>}</span>
        {saved && <span className="text-xs text-green-700 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            type="button"
            onClick={() => { setRating(n); persist(n, feedback) }}
            aria-label={`Rate ${n}`}
            className={`w-9 h-9 rounded-lg text-sm font-semibold border ${rating === n ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}
          >{n}</button>
        ))}
      </div>
      <input
        value={feedback}
        onChange={e => { setFeedback(e.target.value); setSaved(false) }}
        onBlur={() => { if (rating !== null && feedback.trim() !== (existing?.feedback ?? '').trim()) persist(rating, feedback) }}
        placeholder="How can we get even better next week? (optional)"
        className={`${input} w-full`}
        aria-label={`Feedback from ${person.full_name}`}
      />
    </li>
  )
}

export function WrapUp({ todos, issues, ratings, pageSeconds }: { todos: Todo[]; issues: Issue[]; ratings: Rating[]; pageSeconds: () => Record<string, number> }) {
  const { run: liveRun, myId, isLeader, people, attendeeIds, peopleById } = useMeeting()
  const run = useRun()
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

  async function conclude() {
    if (!confirm('Conclude this meeting? This saves the summary for everyone.')) return
    setConcluding(true)
    const summaryId = await run(() => concludeMeeting(liveRun!.id, { archiveTodos, archiveHeadlines, pageSeconds: pageSeconds() }))
    if (summaryId && sendEmail) {
      try {
        const r = await emailSummary(summaryId, { includeDetails, includeNotes })
        alert(`Minutes e-mailed to ${r.sent} attendee${r.sent === 1 ? '' : 's'}.`)
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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="text-sm font-semibold">Meeting rating {liveRun.ratings_revealed && avg && <span className="text-blue-700 font-normal">· average {avg}</span>}</div>
          {isLeader && !liveRun.ratings_revealed && <button onClick={() => run(() => revealRatings(liveRun.id))} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50">Reveal ratings and feedback</button>}
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Rate the meeting 1-10. Rating below 8? Add it to the issues list.
          {isLeader ? ' As host you can enter a rating for anyone.' : ' Only you can enter your rating (the host can also enter it for you).'}
        </p>
        <ul className="divide-y">
          {attendees.map(p => (
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
