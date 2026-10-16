export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MeetingShell from './MeetingShell'
import { nameOwners, withNameOwners } from '@/lib/owners'
import { PAGE_TYPES, MEETING_TABS, type MeetingTab, type PageType } from '@/lib/meetings'

type SearchParams = { tab?: string; pageType?: string; board?: string }

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Not a uuid -> postgres would throw; treat as not found.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { data: meeting } = await supabase
    .from('mtg_meetings')
    .select('id, name, description, leader_id, schedule, icebreaker_notes')
    .eq('id', id)
    .maybeSingle()
  if (!meeting) notFound()

  const tab: MeetingTab = MEETING_TABS.some(t => t.key === sp.tab) ? (sp.tab as MeetingTab) : 'MEETING'

  // KPIs can be attached to several meetings, so find this meeting's through the link table.
  const { data: kpiLinks } = await supabase.from('mtg_kpi_meetings').select('kpi_id').eq('meeting_id', id)
  const kpiIds = (kpiLinks ?? []).map(l => l.kpi_id as string)

  const [
    { data: attendees }, { data: agenda }, { data: activeRun }, { data: headlines }, { data: todos },
    { data: issues }, { data: goals }, { data: kpis }, { data: summaries }, { data: people },
    { data: access }, { data: settings }, { data: allMeetings },
  ] = await Promise.all([
    supabase.from('mtg_attendees').select('user_id').eq('meeting_id', id),
    supabase.from('mtg_agenda_items').select('id, page_type, title, minutes, position').eq('meeting_id', id).order('position'),
    supabase.from('mtg_runs').select('id, leader_id, started_at, current_page, page_seconds, notes, ratings_revealed, attendance').eq('meeting_id', id).is('ended_at', null).maybeSingle(),
    supabase.from('mtg_headlines').select('id, title, details, owner_id, owner_name, created_at').eq('meeting_id', id).is('archived_at', null).order('created_at'),
    supabase.from('mtg_todos').select('id, title, details, owner_id, owner_name, due_date, done_at, run_id, created_at, status, source_headline_id').eq('meeting_id', id).is('archived_at', null).order('created_at'),
    supabase.from('mtg_issues').select('id, title, details, owner_id, owner_name, status, solved_run_id, created_at, due_date, source_headline_id').eq('meeting_id', id).order('created_at'),
    supabase.from('mtg_goals').select('id, title, details, owner_id, owner_name, status, due_date, milestones, created_at').eq('meeting_id', id).order('created_at'),
    kpiIds.length
      ? supabase.from('mtg_kpis')
          .select('id, name, details, owner_id, owner_name, cadence, unit_type, goal_rule, goal_value, goal_value_max, position, links:mtg_kpi_meetings(meeting_id)')
          .in('id', kpiIds)
          .order('position')
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('mtg_summaries').select('id, run_id, created_at, average_rating, snapshot, emailed_at').eq('meeting_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false).order('full_name'),
    user
      ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle(),
    // Targets for move / copy / escalate.
    supabase.from('mtg_meetings').select('id, name').eq('is_archived', false).neq('id', id).order('name'),
  ])

  const [{ data: kpiValues }, { data: kpiGoals }, { data: ratings }, archive, { data: wsPref }] = await Promise.all([
    kpiIds.length
      ? supabase.from('mtg_kpi_values').select('kpi_id, period_start, value').in('kpi_id', kpiIds)
      : Promise.resolve({ data: [] as any[] }),
    kpiIds.length
      ? supabase.from('mtg_kpi_goals').select('kpi_id, period_start, goal_rule, goal_value, goal_value_max').in('kpi_id', kpiIds)
      : Promise.resolve({ data: [] as any[] }),
    activeRun
      ? supabase.from('mtg_ratings').select('user_id, rating, feedback').eq('run_id', activeRun.id)
      : Promise.resolve({ data: [] as any[] }),
    // The Archive tab browses the whole history (live and archived), so load it
    // only when that tab is open.
    tab === 'ARCHIVE'
      ? Promise.all([
          supabase.from('mtg_headlines').select('id, title, details, owner_id, owner_name, created_at, archived_at').eq('meeting_id', id).order('created_at', { ascending: false }).limit(1000),
          supabase.from('mtg_todos').select('id, title, details, owner_id, owner_name, created_at, due_date, done_at, archived_at, status').eq('meeting_id', id).order('created_at', { ascending: false }).limit(1000),
          supabase.from('mtg_issues').select('id, title, details, owner_id, owner_name, created_at, status, solved_at').eq('meeting_id', id).order('created_at', { ascending: false }).limit(1000),
        ])
      : Promise.resolve(null),
    tab === 'WORKSPACE' && user
      ? supabase.from('mtg_user_prefs').select('value').eq('user_id', user.id).eq('key', `meeting.ws.${id}`).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // The Whiteboard tab: this meeting's boards, and the open one in full.
  let whiteboards: { id: string; title: string }[] = []
  let whiteboard: { id: string; title: string; items: unknown[] } | null = null
  let myName = 'Someone'
  if (tab === 'WHITEBOARD') {
    const { data: boards } = await supabase.from('mtg_whiteboards').select('id, title').eq('meeting_id', id).order('created_at')
    whiteboards = (boards ?? []).map(b => ({ id: b.id as string, title: b.title as string }))
    const wantId = whiteboards.find(b => b.id === sp.board)?.id ?? whiteboards[0]?.id
    if (wantId) {
      const { data: full } = await supabase.from('mtg_whiteboards').select('id, title, data').eq('id', wantId).maybeSingle()
      if (full) whiteboard = { id: full.id as string, title: full.title as string, items: ((full.data as any)?.items ?? []) as unknown[] }
    }
    const { data: me } = user ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : { data: null }
    myName = (me?.full_name as string | null) ?? 'Someone'
  }

  const found = new Set<string>()
  const mHeadlines = nameOwners(headlines as any[], found)
  const mTodos = nameOwners(todos as any[], found)
  const mIssues = nameOwners(issues as any[], found)
  const mGoals = nameOwners(goals as any[], found)
  const mKpis = nameOwners(kpis as any[], found)
  const hist = archive ? { headlines: nameOwners(archive[0].data as any[], found), todos: nameOwners(archive[1].data as any[], found), issues: nameOwners(archive[2].data as any[], found) } : null
  const { data: contactRows } = await supabase.from('mtg_meeting_contacts').select('contact:mtg_contacts(full_name)').eq('meeting_id', id)
  const contactNames = (contactRows ?? []).map((r: any) => r.contact?.full_name as string).filter(Boolean).sort()
  const lastFeedback = ((summaries?.[0]?.snapshot as any)?.ratings ?? []) as { user_id: string; rating: number | null; feedback: string | null }[]
  const pageType: PageType = (PAGE_TYPES as string[]).includes(sp.pageType ?? '') ? (sp.pageType as PageType) : 'CHECK_IN'

  // Until the host reveals ratings, only your own row is visible. The host (who
  // can also enter ratings for others) sees every row.
  const isHost = !!activeRun && activeRun.leader_id === user?.id
  const visibleRatings = (ratings ?? []).filter((r: any) => activeRun?.ratings_revealed || isHost || r.user_id === user?.id)

  return (
    <MeetingShell
      meeting={meeting}
      tab={tab}
      pageType={pageType}
      agenda={(agenda ?? []) as any}
      run={activeRun ? { ...activeRun, page_seconds: (activeRun.page_seconds ?? {}) as any, attendance: (activeRun.attendance ?? {}) as any } : null}
      people={withNameOwners(people ?? [], found)}
      contactNames={contactNames}
      attendeeIds={(attendees ?? []).map(a => a.user_id as string)}
      myId={user?.id ?? ''}
      headlines={mHeadlines as any}
      todos={mTodos as any}
      // Only outstanding issues are listed. An issue solved in the meeting that is running right now stays
      // (struck through) until the meeting ends; anything solved earlier lives in the Archive tab.
      issues={(mIssues as any[]).filter(i => i.status !== 'solved' || (!!activeRun && i.solved_run_id === activeRun.id))}
      goals={mGoals as any}
      kpis={(mKpis as any[]).map(k => ({ ...k, meeting_ids: (k.links ?? []).map((l: any) => l.meeting_id as string) }))}
      kpiValues={(kpiValues ?? []) as any}
      kpiGoals={(kpiGoals ?? []) as any}
      ratings={visibleRatings as any}
      lastFeedback={lastFeedback}
      summaries={(summaries ?? []) as any}
      history={hist as any}
      coreValues={(Array.isArray(settings?.core_values) ? settings.core_values : []) as string[]}
      otherMeetings={allMeetings ?? []}
      isAdmin={access?.role === 'admin'}
      schedule={((meeting as any).schedule ?? null) as any}
      icebreakerNotes={((meeting as any).icebreaker_notes ?? '') as string}
      workspaceLayout={wsPref?.value ?? null}
      whiteboards={whiteboards}
      whiteboard={whiteboard}
      myName={myName}
    />
  )
}
