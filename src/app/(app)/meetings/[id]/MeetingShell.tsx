'use client'

import { notifyError, confirmDialog } from '../ui/feedback'
import { startFurin } from '@/lib/furin'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Play, AlertTriangle, Ban, Crown, Radio, NotebookPen, Users, X, Settings as SettingsIcon,
  PanelLeftClose, PanelLeftOpen, Minus, Plus, Presentation, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { startMeeting, setRunPage, saveRunNotes, cancelMeeting } from '../actions'
import { MeetingProvider, type Run } from './context'
import Avatar from '../Avatar'
import { CheckIn } from './CheckIn'
import { Goals } from './Priorities'
import { Metrics } from './Kpis'
import {
  Headlines, Todos, Issues, WrapUp,
  type Headline, type Todo, type Issue, type Goal, type Kpi, type KpiValue, type KpiCustomGoal, type Rating,
} from './Sections'
import { SummaryTab, type SummaryRow } from './SummaryArchive'
import { ArchiveTab, type History } from './ArchiveRange'
import { MeetingWorkspace, GrowthPlan } from './Overview'
import MeetingWhiteboard from './MeetingWhiteboard'
import DocumentsView from '../documents/DocumentsView'
import MeetingSettings from './MeetingSettings'
import type { Schedule } from '../WorkspaceBodies'
import { useLocalPref, setAppSidebarCollapsed, readAppSidebarCollapsed } from '../usePref'
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
  kpiGoals: KpiCustomGoal[]
  kpiNotes: { kpi_id: string; period_start: string; note: string }[]
  ratings: Rating[]
  lastFeedback: Rating[]
  summaries: SummaryRow[]
  history: History | null
  coreValues: string[]
  otherMeetings: { id: string; name: string }[]
  isAdmin: boolean
  schedule: Schedule | null
  workspaceLayout: unknown
  icebreakerNotes: string
  // People in the meeting who have no login here (imported); shown by name.
  contactNames: string[]
  // Whiteboard tab
  whiteboards: { id: string; title: string }[]
  whiteboard: { id: string; title: string; items: unknown[] } | null
  myName: string
  // Documents tab
  docs: any[]
  boards: any[]
}

type LiveState = { current_page: PageType; page_seconds: Record<string, number> }

const ZOOM_MIN = 80
const ZOOM_MAX = 200

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
  const [ice, setIce] = useState<{ text: string; label: string; n: number; total: number } | null>(null)
  const [starting, setStarting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Projector / TV display: hide the agenda panel and zoom the content. Both are
  // remembered on this device.
  const [agendaHiddenPref, setAgendaHidden] = useLocalPref('av-agenda-hidden', '0')
  const [zoomPref, setZoomPref] = useLocalPref('av-meeting-zoom', '100')
  const agendaHidden = agendaHiddenPref === '1'
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(zoomPref) || 100))
  const [presenting, setPresenting] = useState(false)
  const before = useRef<{ agenda: string; zoom: string; sidebar: boolean } | null>(null)

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
      .on('broadcast', { event: 'ice' }, ({ payload }) => setIce(payload))
      .on('broadcast', { event: 'tangent' }, ({ payload }) => {
        setTangent(payload.by)
        setTimeout(() => setTangent(null), 10000)
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel); channelRef.current = null }
  }, [meeting.id, supabase, router, showPage])

  // The icebreaker someone just generated appears on everyone's Check-in page.
  const shareIce = useCallback((v: { text: string; label: string; n: number; total: number }) => {
    setIce(v)
    channelRef.current?.send({ type: 'broadcast', event: 'ice', payload: v })
  }, [])

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
      try { await setRunPage(run.id, p, seconds) } catch (err: any) { notifyError(err) }
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
      notifyError(err)
    } finally {
      setStarting(false)
    }
  }

  // The wind chime rings while the tangent banner is up (it closes itself after 10 s, or with its X).
  useEffect(() => {
    if (!tangent) return
    return startFurin()
  }, [tangent])

  async function cancel() {
    if (!run) return
    if (!(await confirmDialog('Cancel this meeting? The timer, check-ins and ratings are thrown away and no summary is saved. To-dos and issues added meanwhile are kept.'))) return
    try {
      await cancelMeeting(run.id)
      showPage('CHECK_IN')
      changed()
    } catch (err: any) {
      notifyError(err)
    }
  }

  function sendTangent() {
    const name = peopleById.get(myId)?.full_name ?? 'Someone'
    channelRef.current?.send({ type: 'broadcast', event: 'tangent', payload: { by: name } })
    setTangent(name)
    setTimeout(() => setTangent(null), 10000)
  }

  // ----- projector controls

  const setZoom = (n: number) => setZoomPref(String(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n))))

  function enterPresentation() {
    before.current = { agenda: agendaHiddenPref, zoom: zoomPref, sidebar: readAppSidebarCollapsed() }
    setAgendaHidden('1')
    setAppSidebarCollapsed(true)
    if (zoom < 125) setZoom(125)
    setPresenting(true)
    document.documentElement.requestFullscreen?.().catch(() => { /* fullscreen is optional */ })
  }

  const exitPresentation = useCallback(() => {
    const b = before.current
    if (b) {
      setAgendaHidden(b.agenda)
      setZoomPref(b.zoom)
      setAppSidebarCollapsed(b.sidebar)
    }
    before.current = null
    setPresenting(false)
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [setAgendaHidden, setZoomPref])

  // Leaving fullscreen with Esc also leaves presentation mode.
  useEffect(() => {
    if (!presenting) return
    const onChange = () => { if (!document.fullscreenElement) exitPresentation() }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [presenting, exitPresentation])

  const elapsed = run ? Math.max(0, Math.floor((now - new Date(run.started_at).getTime()) / 1000)) : 0
  const totalPlanned = agenda.reduce((s, a) => s + a.minutes, 0)
  const ctx = { meetingId: meeting.id, run, people, peopleById, attendeeIds, myId, isLeader, changed }
  // WrapUp calls this when concluding, so the summary records time per section.
  const pageSeconds = () => pageSecondsAt(new Date().getTime())

  const pageIndex = agenda.findIndex(a => a.page_type === page)
  const currentItem = agenda[pageIndex]
  const stepTo = (delta: number) => {
    const next = agenda[pageIndex + delta]
    if (next) goTo(next.page_type)
  }

  const zoomStyle = zoom === 100 ? undefined : ({ zoom: zoom / 100 } as React.CSSProperties)
  const pad = 'p-4 md:p-6 xl:p-8'

  return (
    <MeetingProvider value={ctx}>
      <div className="min-h-full flex flex-col">
        <div className="border-b bg-white px-4 md:px-8 pt-5 pb-3 print:hidden">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/meetings" className="text-sm text-gray-500 hover:text-gray-800">Meetings</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-2xl font-bold truncate">{meeting.name}</h1>
            {run && <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><Radio className="w-3 h-3" /> LIVE</span>}

            <div className="ml-auto flex items-center gap-2">
              {/* Zoom for a TV or projector */}
              <div className="inline-flex items-center rounded-lg border bg-white text-sm overflow-hidden" role="group" aria-label="Zoom">
                <button onClick={() => setZoom(zoom - 10)} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out" title="Zoom out" className="px-2 py-1.5 hover:bg-gray-50 disabled:opacity-40"><Minus className="w-4 h-4" /></button>
                <button onClick={() => setZoom(100)} title="Reset zoom" className="px-2 tabular-nums w-14 text-center text-xs font-semibold hover:bg-gray-50">{zoom}%</button>
                <button onClick={() => setZoom(zoom + 10)} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in" title="Zoom in" className="px-2 py-1.5 hover:bg-gray-50 disabled:opacity-40"><Plus className="w-4 h-4" /></button>
              </div>
              {tab === 'MEETING' && (
                <button
                  onClick={() => setAgendaHidden(agendaHidden ? '0' : '1')}
                  title={agendaHidden ? 'Show the agenda panel' : 'Hide the agenda panel (more room on a TV or projector)'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50"
                >
                  {agendaHidden ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                  <span className="hidden sm:inline">{agendaHidden ? 'Show agenda' : 'Hide agenda'}</span>
                </button>
              )}
              <button
                onClick={presenting ? exitPresentation : enterPresentation}
                title="Presentation mode: full screen, no side panels, larger text"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${presenting ? 'bg-slate-900 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                <Presentation className="w-4 h-4" /> <span className="hidden sm:inline">{presenting ? 'Exit' : 'Present'}</span>
              </button>
              <button onClick={() => setShowSettings(true)} aria-label="Meeting settings" title="Meeting settings" className="text-gray-500 hover:text-blue-600 p-1"><SettingsIcon className="w-5 h-5" /></button>
            </div>
          </div>

          <nav className="inline-flex flex-wrap gap-0.5 rounded-lg bg-gray-100 p-1 text-sm mt-3" aria-label="Meeting views">
            {MEETING_TABS.map(t => (
              <Link
                key={t.key}
                href={`/meetings/${meeting.id}?tab=${t.key}${t.key === 'MEETING' ? `&pageType=${page}` : ''}`}
                className={`px-3.5 py-1.5 rounded-md font-medium transition ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>

        {tangent && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 md:px-8 py-2 text-sm flex items-center gap-2 print:hidden">
            <AlertTriangle className="w-4 h-4" /> <b>Tangent alert</b> from {tangent}. Park it as an issue and get back on track.
            <button onClick={() => setTangent(null)} className="ml-auto" aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex-1 flex flex-col" style={zoomStyle}>
          {tab === 'WORKSPACE' && (
            <div className={`${pad} w-full`}>
              <MeetingWorkspace meetingName={meeting.name} schedule={props.schedule} layout={props.workspaceLayout} coreValues={props.coreValues} otherMeetings={props.otherMeetings} headlines={props.headlines} todos={props.todos} issues={props.issues} goals={props.goals} kpis={props.kpis} kpiValues={props.kpiValues} kpiGoals={props.kpiGoals} summaries={props.summaries} />
            </div>
          )}
          {tab === 'WHITEBOARD' && <MeetingWhiteboard meetingId={meeting.id} boards={props.whiteboards} board={props.whiteboard} myName={props.myName} />}
          {tab === 'DOCUMENTS' && (
            <div className={`${pad} w-full`}>
              <DocumentsView docs={props.docs} boards={props.boards} meetings={[{ id: meeting.id, name: meeting.name }]} people={Object.fromEntries(props.people.map(p => [p.id, p.full_name ?? '']))} myId={props.myId} isManager={props.isAdmin} lockedMeetingId={meeting.id} />
            </div>
          )}
          {tab === 'GROWTH_PLAN' && (
            <div className={`${pad} w-full`}>
              <GrowthPlan goals={props.goals} kpis={props.kpis} kpiValues={props.kpiValues} kpiGoals={props.kpiGoals} coreValues={props.coreValues} />
            </div>
          )}
          {tab === 'MEETING_SUMMARIES' && <div className={`${pad} w-full`}><SummaryTab summaries={props.summaries} peopleById={peopleById} meetingName={meeting.name} /></div>}
          {tab === 'ARCHIVE' && <div className={`${pad} w-full`}><ArchiveTab history={props.history} peopleById={peopleById} meetingName={meeting.name} /></div>}

          {tab === 'MEETING' && (
            <div className="flex-1 flex flex-col md:flex-row gap-0">
              {!agendaHidden && (
                <aside className="md:w-80 shrink-0 border-b md:border-b-0 md:border-r bg-white p-4 space-y-4">
                  {!run ? (
                    <button onClick={start} disabled={starting} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
                      <Play className="w-4 h-4" /> {starting ? 'Starting…' : 'Start meeting'}
                    </button>
                  ) : (
                    <div className="rounded-lg bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                      <span suppressHydrationWarning className="font-mono text-2xl tabular-nums">{formatSeconds(elapsed)}</span>
                      <span className="text-xs text-slate-400">of {totalPlanned}m planned</span>
                    </div>
                  )}
                  {run && isLeader && (
                    <button onClick={cancel} className="w-full -mt-2 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600"><Ban className="w-3.5 h-3.5" /> Cancel meeting (started by mistake)</button>
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
                            <span suppressHydrationWarning className={`text-xs tabular-nums shrink-0 ${over ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
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
                          onBlur={() => run && saveRunNotes(run.id, notes).catch(notifyError)}
                          disabled={!run}
                          rows={6}
                          placeholder={run ? 'Notes are saved when you click away.' : 'Start the meeting to take notes.'}
                          className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                        />
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Attendees ({attendeeIds.length + props.contactNames.length})</div>
                    <div className="flex flex-wrap gap-1">{attendeeIds.map(id => <Avatar key={id} person={peopleById.get(id)} size="sm" />)}{props.contactNames.map(n => <Avatar key={n} person={{ id: 'name:' + n, full_name: n }} size="sm" />)}</div>
                    {props.contactNames.length > 0 && <p className="text-xs text-gray-500 mt-1.5" title={props.contactNames.join(', ')}>{props.contactNames.length} without a login here: {props.contactNames.slice(0, 3).join(', ')}{props.contactNames.length > 3 ? '…' : ''}</p>}
                  </div>
                </aside>
              )}

              <main className={`flex-1 min-w-0 w-full ${pad}`}>
                {/* With the agenda panel hidden, keep the essentials on screen. */}
                {agendaHidden && (
                  <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border bg-white shadow-sm px-4 py-2.5 print:hidden">
                    {!run ? (
                      <button onClick={start} disabled={starting} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"><Play className="w-4 h-4" /> {starting ? 'Starting…' : 'Start meeting'}</button>
                    ) : (
                      <span suppressHydrationWarning className="font-mono text-lg tabular-nums bg-slate-900 text-white rounded-md px-2.5 py-0.5">{formatSeconds(elapsed)}</span>
                    )}
                    <div className="text-sm">
                      <span className="font-semibold">{currentItem?.title ?? PAGE_LABEL[page]}</span>
                      {run && currentItem && (
                        <span suppressHydrationWarning className={`ml-2 tabular-nums text-xs ${pageElapsed(page, now) > currentItem.minutes * 60 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {formatSeconds(pageElapsed(page, now))} / {currentItem.minutes}m
                        </span>
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => stepTo(-1)} disabled={pageIndex <= 0} aria-label="Previous section" className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                      <span className="text-xs text-gray-500 tabular-nums px-1">{pageIndex + 1}/{agenda.length}</span>
                      <button onClick={() => stepTo(1)} disabled={pageIndex < 0 || pageIndex >= agenda.length - 1} aria-label="Next section" className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                    {run && <button onClick={sendTangent} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100"><AlertTriangle className="w-4 h-4" /> Tangent</button>}
                    {run && isLeader && <button onClick={cancel} title="Cancel meeting (started by mistake)" aria-label="Cancel meeting" className="p-1.5 rounded-lg border text-gray-500 hover:text-red-600 hover:bg-red-50"><Ban className="w-4 h-4" /></button>}
                  </div>
                )}

                {page === 'CHECK_IN' && <CheckIn lastFeedback={props.lastFeedback} ice={ice} onIce={shareIce} notes={props.icebreakerNotes} />}
                {page === 'GOALS' && <Goals goals={props.goals} otherMeetings={props.otherMeetings} />}
                {page === 'METRICS' && <Metrics kpis={props.kpis} values={props.kpiValues} customGoals={props.kpiGoals} notes={props.kpiNotes} otherMeetings={props.otherMeetings} meetingName={meeting.name} />}
                {page === 'HEADLINES' && <Headlines headlines={props.headlines} todos={props.todos} issues={props.issues} otherMeetings={props.otherMeetings} />}
                {page === 'TODOS' && <Todos todos={props.todos} otherMeetings={props.otherMeetings} />}
                {page === 'ISSUES' && <Issues issues={props.issues} otherMeetings={props.otherMeetings} />}
                {page === 'WRAP_UP' && <WrapUp todos={props.todos} issues={props.issues} ratings={props.ratings} pageSeconds={pageSeconds} />}
                <p className="sr-only">{PAGE_LABEL[page]}</p>
              </main>
            </div>
          )}
        </div>
      </div>
      {showSettings && (
        <MeetingSettings
          schedule={props.schedule}
          meeting={meeting}
          agenda={agenda.map(a => ({ id: a.id, title: a.title, minutes: a.minutes }))}
          people={people}
          attendeeIds={attendeeIds}
          onClose={() => setShowSettings(false)}
          onSaved={changed}
        />
      )}
    </MeetingProvider>
  )
}
