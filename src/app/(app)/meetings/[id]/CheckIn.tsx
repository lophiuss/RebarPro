'use client'

import { useRef, useState } from 'react'
import { Lightbulb, MessageSquareQuote, Shuffle, ArrowLeft, NotebookPen, Check, UserCheck, Users, Crown, Plus } from 'lucide-react'
import { setAttendanceBulk, saveIcebreakerNotes } from '../actions'
import { AddAttendeeDialog } from './AddAttendee'
import { useMeeting, useRun } from './context'
import Avatar from '../Avatar'
import { card, input, labelCls, SectionTitle, type Rating } from './shared'
import { TIPS } from '@/lib/meetings'
import { QUESTIONS, ACTIONS, FUN, ICEBREAKER_LABEL, type IcebreakerKind } from '@/lib/icebreakers'

type Shown = { text: string; label: string; n: number; total: number }

const KINDS: IcebreakerKind[] = ['questions', 'actions', 'fun', 'notepad', 'mix']

function shuffle<T>(items: T[]): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function CheckIn({ lastFeedback, ice, onIce, notes }: { lastFeedback: Rating[]; ice: Shown | null; onIce: (v: Shown) => void; notes: string }) {
  const { meetingId, run: liveRun, people, attendeeIds, peopleById, myId } = useMeeting()
  const run = useRun()
  // Shows a tick instantly; the saved value (from the live run) takes over after refresh.
  const [local, setLocal] = useState<Record<string, boolean>>({})
  // Not random: a random pick differs between the server render and the browser
  // and breaks hydration. Meeting id + UTC week gives the same tip on both sides
  // and rotates it weekly.
  const [tip] = useState(() => {
    let h = 0
    for (let i = 0; i < meetingId.length; i++) h = (h * 31 + meetingId.charCodeAt(i)) >>> 0
    const utcWeek = Math.floor(new Date().getTime() / (7 * 86400000))
    return TIPS[(h + utcWeek) % TIPS.length]
  })
  const attendees = people.filter(p => attendeeIds.includes(p.id))
  const feedback = lastFeedback.filter(f => f.feedback)

  // What the server has saved. Ticks show at once (`local`) and are sent in one batch a moment later,
  // so rapid clicking and "Mark everyone present" can never overwrite each other.
  const serverAttendance = (liveRun?.attendance ?? {}) as Record<string, boolean>
  const serverSig = JSON.stringify(serverAttendance)
  const [seenSig, setSeenSig] = useState(serverSig)
  if (seenSig !== serverSig) {
    // The saved copy arrived: drop the instant ticks it now agrees with.
    setSeenSig(serverSig)
    setLocal(prev => Object.fromEntries(Object.entries(prev).filter(([id, v]) => !!serverAttendance[id] !== v)))
  }
  const isPresent = (id: string) => local[id] ?? !!serverAttendance[id]
  const presentCount = attendees.filter(p => isPresent(p.id)).length
  const pct = attendees.length ? Math.round((presentCount / attendees.length) * 100) : 0

  const queue = useRef<Record<string, boolean>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const runId = liveRun?.id

  function setMany(changes: Record<string, boolean>) {
    if (!runId) return
    setLocal(prev => ({ ...prev, ...changes }))
    Object.assign(queue.current, changes)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const batch = queue.current
      queue.current = {}
      chain.current = chain.current.then(async () => {
        const ok = await run(async () => { await setAttendanceBulk(runId, batch); return true })
        if (!ok) setLocal(prev => { const next = { ...prev }; for (const id of Object.keys(batch)) delete next[id]; return next })
      })
    }, 150)
  }
  const toggle = (id: string) => setMany({ [id]: !isPresent(id) })
  const markAll = (present: boolean) => setMany(Object.fromEntries(attendees.map(p => [p.id, present])))
  const hostId = liveRun?.leader_id ?? null

  // "+" tile: bring in someone who is not on the meeting's list (and tick them present if the meeting is running).
  const [adding, setAdding] = useState(false)

  // ----- icebreaker: a shuffled deck per set, so nothing repeats until it is used up
  const [kind, setKind] = useState<IcebreakerKind>('questions')
  const [draft, setDraft] = useState(notes)
  const [savedNotes, setSavedNotes] = useState(notes)
  const [deck, setDeck] = useState<{ key: string; items: string[]; next: number }>({ key: '', items: [], next: 0 })
  const [past, setPast] = useState<Shown[]>([])

  const notepadLines = savedNotes.split('\n').map(l => l.trim()).filter(Boolean)
  const pool = (k: IcebreakerKind): string[] =>
    k === 'questions' ? QUESTIONS : k === 'actions' ? ACTIONS : k === 'fun' ? FUN : k === 'notepad' ? notepadLines : [...QUESTIONS, ...ACTIONS, ...FUN, ...notepadLines]
  const poolSize = pool(kind).length

  function generate() {
    const items = pool(kind)
    if (items.length === 0) return
    const key = `${kind}:${items.length}:${items[0]}`
    let d = deck
    if (d.key !== key || d.next >= d.items.length) d = { key, items: shuffle(items), next: 0 }
    const text = d.items[d.next]
    setDeck({ ...d, next: d.next + 1 })
    if (ice) setPast(p => [...p.slice(-20), ice])
    onIce({ text, label: ICEBREAKER_LABEL[kind], n: d.next + 1, total: d.items.length })
  }

  function back() {
    const prev = past[past.length - 1]
    if (!prev) return
    setPast(past.slice(0, -1))
    onIce(prev)
  }

  async function saveNotes() {
    if (draft.trim() === savedNotes.trim()) return
    const ok = await run(async () => { await saveIcebreakerNotes(meetingId, draft); return true })
    if (ok) setSavedNotes(draft)
  }

  return (
    <div>
      <SectionTitle>Check-in</SectionTitle>
      <div className={`${card} p-4 md:p-5 mb-4`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-4">
          <div className="flex items-center gap-3">
            <span className={`w-11 h-11 rounded-full inline-flex items-center justify-center ${presentCount === attendees.length && attendees.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-600'}`}><Users className="w-5 h-5" /></span>
            <div>
              <div className="text-xl font-bold leading-tight tabular-nums">{presentCount} <span className="text-gray-500 font-medium">of {attendees.length} here</span></div>
              <div className="text-xs text-gray-500">{liveRun ? 'Tap a name to check them in or out.' : 'Start the meeting to check people in.'}</div>
            </div>
          </div>
          <div className="flex-1 min-w-[10rem] max-w-xs" aria-hidden="true">
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} /></div>
            <div className="text-xs text-gray-500 mt-1">{pct}% present</div>
          </div>
          {liveRun && attendees.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => markAll(true)} disabled={presentCount === attendees.length} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-95 transition disabled:opacity-40"><UserCheck className="w-4 h-4" /> Everyone is here</button>
              <button onClick={() => markAll(false)} disabled={presentCount === 0} className="px-3 py-2 rounded-lg border bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition disabled:opacity-40">Clear</button>
            </div>
          )}
        </div>
        {attendees.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-500">Nobody has been added to this meeting yet. Add attendees with the + button or in the meeting settings.</p>
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600"><Plus className="w-4 h-4" /> Add person</button>
          </div>
        ) : (
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr))]">
            {attendees.map(p => {
              const here = isPresent(p.id)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={here}
                    aria-label={`${p.full_name}: ${here ? 'present' : 'not here yet'}`}
                    disabled={!liveRun}
                    onClick={() => toggle(p.id)}
                    className={`group w-full rounded-2xl border-2 px-2 pt-4 pb-3 flex flex-col items-center gap-2 text-center select-none transition duration-150 active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                      here ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-dashed border-gray-300 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                    } ${liveRun ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                  >
                    <span className="relative">
                      <span className={`block rounded-full p-1 transition duration-150 ${here ? 'bg-emerald-500' : 'bg-transparent'}`}>
                        <span className={`block transition duration-150 ${here ? '' : 'grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100'}`}><Avatar person={p} size="xl" /></span>
                      </span>
                      <span className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 border-white inline-flex items-center justify-center transition duration-150 ${here ? 'bg-emerald-600 text-white scale-100' : 'bg-gray-200 text-transparent scale-90 group-hover:bg-blue-100 group-hover:text-blue-500'}`}><Check className="w-4 h-4" strokeWidth={3} /></span>
                    </span>
                    <span className={`text-sm leading-tight line-clamp-2 break-words ${here ? 'font-semibold text-emerald-900' : 'font-medium text-gray-700'}`}>{p.full_name}</span>
                    <span className="h-4 flex items-center gap-1 text-xs font-semibold">
                      {p.id === hostId ? <span className="inline-flex items-center gap-1 text-amber-600"><Crown className="w-3 h-3" /> Host</span> : p.id === myId ? <span className="text-blue-600">You</span> : null}
                    </span>
                  </button>
                </li>
              )
            })}
            <li>
              <button type="button" onClick={() => setAdding(true)} aria-label="Add a person to this meeting" title="Add a person"
                className="w-full h-full min-h-[10rem] rounded-2xl border-2 border-dashed border-gray-300 bg-white px-2 py-4 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-600 active:scale-95 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">
                <span className="w-14 h-14 rounded-full border-2 border-current inline-flex items-center justify-center"><Plus className="w-7 h-7" /></span>
                <span className="text-sm font-medium">Add person</span>
              </button>
            </li>
          </ul>
        )}
        {adding && <AddAttendeeDialog onClose={() => setAdding(false)} />}
      </div>

      <div>
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <div className={`${card} p-4`}>
            <div className={`${labelCls} mb-2`}>Icebreaker</div>
            <div className="flex flex-wrap gap-1 mb-3">
              {KINDS.map(k => {
                const n = k === 'questions' ? QUESTIONS.length : k === 'actions' ? ACTIONS.length : k === 'fun' ? FUN.length : k === 'notepad' ? notepadLines.length : QUESTIONS.length + ACTIONS.length + FUN.length + notepadLines.length
                return (
                  <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${kind === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{ICEBREAKER_LABEL[k]} ({n})</button>
                )
              })}
            </div>
            <div className="min-h-[5.5rem] rounded-lg bg-slate-50 border px-4 py-3 flex items-center">
              {ice ? (
                <div>
                  <p className="text-xl text-slate-800 leading-snug">&ldquo;{ice.text}&rdquo;</p>
                  <p className="text-xs uppercase tracking-wide text-gray-500 mt-1">{ice.label} · {ice.n} of {ice.total}</p>
                </div>
              ) : <p className="text-sm text-gray-500">Press “Generate next” to pick an icebreaker. Everyone in the meeting sees it.</p>}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={generate} disabled={poolSize === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                <Shuffle className="w-4 h-4" /> Generate next
              </button>
              <button onClick={back} disabled={past.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-sm hover:bg-gray-50 disabled:opacity-40"><ArrowLeft className="w-4 h-4" /> Back</button>
              {poolSize === 0 && <span className="text-xs text-gray-500">Your notepad is empty. Add ideas below.</span>}
            </div>
          </div>

          <div className={`${card} p-4`}>
            <label className={`${labelCls} flex items-center gap-1.5 mb-1.5`}><NotebookPen className="w-3.5 h-3.5" /> Our notepad: special icebreakers</label>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={saveNotes}
              rows={4}
              placeholder={'One idea per line, e.g.\nShare your most embarrassing work moment\nWho brought the best snack this week?'}
              className={`${input} w-full text-sm`}
              aria-label="Icebreaker notepad"
            />
            <p className="text-xs text-gray-500 mt-1">Saved for this meeting when you click away. The generator draws from these lines too ({notepadLines.length} saved).</p>
          </div>

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex gap-3 lg:col-span-2">
            <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-900">Tip of the week</div>
              <div className="text-sm text-amber-900/90">{tip}</div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${card} p-4 mt-4`}>
        <div className={`${labelCls} mb-2 flex items-center gap-2`}><MessageSquareQuote className="w-4 h-4 text-blue-600" /> Last meeting&apos;s feedback</div>
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
