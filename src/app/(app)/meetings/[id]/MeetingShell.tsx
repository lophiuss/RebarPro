'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Play, AlertTriangle, Crown, Radio, NotebookPen, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { startMeeting, setRunPage, saveRunNotes } from '../actions'
import { MeetingProvider, type Run } from './context'
import Avatar from '../Avatar'
import {
  CheckIn, Goals, Metrics, Headlines, Todos, Issues, WrapUp,
  type Headline, type Todo, type Issue, type Goal, type Kpi, type KpiValue, type Rating,
} from './Sections'
import { SummaryTab, ArchiveTab, type SummaryRow } from './SummaryArchive'
import {
  MEETING_TABS, PAGE_LABEL, PAGE_TYPES, formatSeconds, type MeetingTab, type PageType, type Person,
} from '@/lib/meetings'

type AgendaItem = { id: string; page_type: PageType; title: string; minutes: number; position: number }

export type ShellProps = {
  meeting: { id: string; name: string; description: string | null; leader_id: string | null }
  tab: MeetingTab
  pageType: PageType
  agenda: AgendaItem[]
  run: Run | null
  people: Person[]
  attendeeIds: string[]
  myId: string
  headlines: Headline[]
  todos: Todo[]
  issues: Issue[]
  goals: Goal[]
  kpis: Kpi[]
  kpiValues: KpiValue[]
  ratings: Rating[]
  lastFeedback: Rating[]
  summaries: SummaryRow[]
  archived: { headlines: Headline[]; todos: Todo[]; issues: Issue[] }
  isAdmin: boolean
}

type LiveState = { current_page: PageType; page_seconds: Record<string, number> }

export default function MeetingShell(props: ShellProps) {
  const { meeting, tab, agenda, run, people, attendeeIds, myId } = props
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])

  const [page, setPage] = useState<PageType>(props.pageType)
  const [live, setLive] = useState<LiveState | null>(run ? { current_page: run.current_page as PageType, page_seconds: run.page_seconds ?? {} } : null)
  const [now, setNow] = useState(() => Date.now())
  const [notes, setNotes] = useState(run?.notes ?? '')
  const [showNotes, setShowNotes] = useState(false)
  const [tangent, setTangent] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const isLeader = !!run && run.leader_id === myId
  const leader = peopleById.get(run?.leader_id ?? meeting.leader_id ?? '')

  // Re-sync local live state when the server says a different run / page
  // (new run started or concluded elsewhere). Adjusting state while rendering,
  // keyed on the server values, is React's recommended alternative to an effect.
  const syncKey = `${run?.id ?? ''}|${run?.current_page ?? ''}`
  const [seenSyncKey, setSeenSyncKey] = useState(syncKey)
  if (seenSyncKey !== syncKey) {
    setSeenSyncKey(syncKey)
    setLive(run ? { current_page: run.current_page as PageType, page_seconds: run.page_seconds ?? {} } : null)
    setNotes(run?.notes ?? '')
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const showPage = useCallback((p: PageType) => {
    setPage(p)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'MEETING')
    url.searchParams.set('pageType', p)
    window.history.replaceState(null, '', url.toString())
  }, [])

  // Realtime: leader's page changes, refresh pings and tangent alerts.
  useEffect(() => {
    const channel = supabase.channel(`mtg:${meeting.id}`, { config: { broadcast: { self: false } } })
    channel
      .on('broadcast', { event: 'page' }, ({ payload }) => {
        setLive({ current_page: payload.page, page_seconds: payload.pageSeconds })
        showPage(payload.page)
      })
      .on('broadcast', { event: 'refresh' }, () => router.refresh())
      .on('broadcast', { event: 'tangent' }, ({ payload }) => {
        setTangent(payload.by)
        setTimeout(() => setTangent(null), 10000)
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel); channelRef.current = null }
  }, [meeting.id, supabase, router, showPage])

  const changed = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} })
    router.refresh()
  }, [router])

  // Seconds spent on a page, including the running time on the current one.
  const pageElapsed = useCallback((p: string, at: number) => {
    if (!live) return 0
    const base = Math.round(live.page_seconds[p] ?? 0)
    const entered = live.page_seconds._entered_at
    if (live.current_page === p && entered) return base + Math.max(0, Math.floor((at - entered) / 1000))
    return base
  }, [live])

  // Snapshot of per-page seconds with the current page's running time folded
  // in, as of `at` (epoch ms). Called from event handlers only.
  const pageSecondsAt = useCallback((at: number) => {
    const out: Record<string, number> = {}
    for (const p of PAGE_TYPES) out[p] = pageElapsed(p, at)
    return out
  }, [pageElapsed])

  async function goTo(p: PageType) {
    if (run && live && isLeader && p !== live.current_page) {
      const at = new Date().getTime()
      const seconds = { ...pageSecondsAt(at), _entered_at: at }
      setLive({ current_page: p, page_seconds: seconds })
      showPage(p)
      channelRef.current?.send({ type: 'broadcast', event: 'page', payload: { page: p, pageSeconds: seconds } })
      try { await setRunPage(run.id, p, seconds) } catch (err: any) { alert('Error: ' + err.message) }
    } else {
      showPage(p)
    }
  }

  async function start() {
    setStarting(true)
    try {
      await startMeeting(meeting.id)
      showPage('CHECK_IN')
      changed()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setStarting(false)
    }
  }

  function sendTangent() {
    const name = peopleById.get(myId)?.full_name ?? 'Someone'
    channelRef.current?.send({ type: 'broadcast', event: 'tangent', payload: { by: name } })
    setTangent(name)
    setTimeout(() => setTangent(null), 10000)
  }

  const elapsed = run ? Math.max(0, Math.floor((now - new Date(run.started_at).getTime()) / 1000)) : 0
  const totalPlanned = agenda.reduce((s, a) => s + a.minutes, 0)
  const ctx = { meetingId: meeting.id, run, people, peopleById, attendeeIds, myId, isLeader, changed }
  // WrapUp calls this when concluding, so the summary records time per section.
  const pageSeconds = () => pageSecondsAt(new Date().getTime())

  return (
    <MeetingProvider value={ctx}>
      <div className="min-h-full flex flex-col">
        <div className="border-b bg-white px-4 md:px-8 pt-5">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/meetings" className="text-sm text-gray-500 hover:text-gray-800">Meetings</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold truncate">{meeting.name}</h1>
            {run && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded"><Radio className="w-3 h-3" /> LIVE</span>}
          </div>
          <nav className="flex gap-1 mt-3 -mb-px">
            {MEETING_TABS.map(t => (
              <Link
                key={t.key}
                href={`/meetings/${meeting.id}?tab=${t.key}${t.key === 'MEETING' ? `&pageType=${page}` : ''}`}
                className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>

        {tangent && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 md:px-8 py-2 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> <b>Tangent alert</b> from {tangent}. Park it as an issue and get back on track.
            <button onClick={() => setTangent(null)} className="ml-auto" aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        )}

        {tab === 'MEETING_SUMMARIES' && <div className="p-4 md:p-8 max-w-5xl w-full mx-auto"><SummaryTab summaries={props.summaries} peopleById={peopleById} /></div>}
        {tab === 'ARCHIVE' && <div className="p-4 md:p-8 max-w-5xl w-full mx-auto"><ArchiveTab archived={props.archived} peopleById={peopleById} /></div>}

        {tab === 'MEETING' && (
          <div className="flex-1 flex flex-col md:flex-row gap-0">
            <aside className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r bg-white p-4 space-y-4">
              {!run ? (
                <button onClick={start} disabled={starting} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
                  <Play className="w-4 h-4" /> {starting ? 'Starting…' : 'Start meeting'}
                </button>
              ) : (
                <div className="rounded-lg bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                  <span className="font-mono text-2xl tabular-nums">{formatSeconds(elapsed)}</span>
                  <span className="text-xs text-slate-400">of {totalPlanned}m planned</span>
                </div>
              )}

              <ol className="space-y-1">
                {agenda.map(a => {
                  const active = page === a.page_type
                  const isCurrent = live?.current_page === a.page_type
                  const spent = run ? pageElapsed(a.page_type, now) : 0
                  const over = run && spent > a.minutes * 60
                  return (
                    <li key={a.id}>
                      <button
                        onClick={() => goTo(a.page_type)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition ${active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-gray-50'}`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {run && isCurrent ? <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" /> : <span className="w-2 shrink-0" />}
                          <span className="truncate">{a.title}</span>
                        </span>
                        <span className={`text-xs tabular-nums shrink-0 ${over ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {run ? `${formatSeconds(spent)} / ${a.minutes}m` : `${a.minutes}m`}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>

              {run && (
                <div className="border-t pt-3 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Avatar person={leader} />
                    <div>
                      <div className="font-semibold flex items-center gap-1"><Crown className="w-3.5 h-3.5 text-amber-500" /> {isLeader ? "You're the leader" : `${leader?.full_name ?? 'Leader'} is leading`}</div>
                      {!isLeader && <div className="text-xs text-gray-500">Your page follows the leader.</div>}
                    </div>
                  </div>
                  <button onClick={sendTangent} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100">
                    <AlertTriangle className="w-4 h-4" /> Tangent alert
                  </button>
                </div>
              )}

              <div className="border-t pt-3">
                <button onClick={() => setShowNotes(s => !s)} className="w-full flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <NotebookPen className="w-4 h-4" /> Meeting notes
                </button>
                {showNotes && (
                  <div className="mt-2">
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      onBlur={() => run && saveRunNotes(run.id, notes).catch(err => alert('Error: ' + err.message))}
                      disabled={!run}
                      rows={6}
                      placeholder={run ? 'Notes are saved when you click away.' : 'Start the meeting to take notes.'}
                      className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                    />
                  </div>
                )}
              </div>

              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Attendees ({attendeeIds.length})</div>
                <div className="flex flex-wrap gap-1">{attendeeIds.map(id => <Avatar key={id} person={peopleById.get(id)} size="sm" />)}</div>
              </div>
            </aside>

            <main className="flex-1 min-w-0 p-4 md:p-8 max-w-4xl w-full">
              {page === 'CHECK_IN' && <CheckIn lastFeedback={props.lastFeedback} />}
              {page === 'GOALS' && <Goals goals={props.goals} />}
              {page === 'METRICS' && <Metrics kpis={props.kpis} values={props.kpiValues} />}
              {page === 'HEADLINES' && <Headlines headlines={props.headlines} />}
              {page === 'TODOS' && <Todos todos={props.todos} />}
              {page === 'ISSUES' && <Issues issues={props.issues} />}
              {page === 'WRAP_UP' && <WrapUp todos={props.todos} issues={props.issues} ratings={props.ratings} pageSeconds={pageSeconds} />}
              <p className="sr-only">{PAGE_LABEL[page]}</p>
            </main>
          </div>
        )}
      </div>
    </MeetingProvider>
  )
}
