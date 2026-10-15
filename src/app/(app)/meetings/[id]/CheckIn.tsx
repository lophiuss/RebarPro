'use client'

import { useState } from 'react'
import { Lightbulb, MessageSquareQuote, Shuffle, ArrowLeft, NotebookPen } from 'lucide-react'
import { setAttendance, saveIcebreakerNotes } from '../actions'
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
  const { meetingId, run: liveRun, people, attendeeIds, peopleById } = useMeeting()
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

  const isPresent = (id: string) => local[id] ?? !!liveRun?.attendance?.[id]
  const presentCount = attendees.filter(p => isPresent(p.id)).length

  async function toggle(id: string, present: boolean) {
    if (!liveRun) return
    setLocal(prev => ({ ...prev, [id]: present }))
    const ok = await run(async () => { await setAttendance(liveRun.id, id, present); return true })
    if (!ok) setLocal(prev => { const next = { ...prev }; delete next[id]; return next })
  }

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
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className={labelCls}>Attendance</div>
            {liveRun && attendees.length > 0 && (
              <button
                onClick={() => attendees.filter(p => !isPresent(p.id)).forEach(p => toggle(p.id, true))}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >Mark everyone present</button>
            )}
          </div>
          <ul className="space-y-1.5">
            {attendees.map(p => (
              <li key={p.id}>
                <label className={`flex items-center gap-2 text-sm ${liveRun ? 'cursor-pointer' : 'opacity-60'}`}>
                  <input type="checkbox" disabled={!liveRun} checked={isPresent(p.id)} onChange={e => toggle(p.id, e.target.checked)} />
                  <Avatar person={p} size="sm" /> {p.full_name}
                </label>
              </li>
            ))}
          </ul>
          <div className="text-xs text-gray-500 mt-3">
            {liveRun ? `${presentCount} of ${attendees.length} present` : 'Start the meeting to take attendance.'}
          </div>
        </div>

        <div className="space-y-4">
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
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 mt-1">{ice.label} · {ice.n} of {ice.total}</p>
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
