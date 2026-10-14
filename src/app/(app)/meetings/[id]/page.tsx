export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MeetingShell from './MeetingShell'
import { PAGE_TYPES, MEETING_TABS, type MeetingTab, type PageType } from '@/lib/meetings'

type SearchParams = { tab?: string; pageType?: string }

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
    .select('id, name, description, leader_id')
    .eq('id', id)
    .maybeSingle()
  if (!meeting) notFound()

  const tab: MeetingTab = MEETING_TABS.some(t => t.key === sp.tab) ? (sp.tab as MeetingTab) : 'MEETING'

  const [
    { data: attendees }, { data: agenda }, { data: activeRun }, { data: headlines }, { data: todos },
    { data: issues }, { data: goals }, { data: kpis }, { data: summaries }, { data: people },
    { data: archivedHeadlines }, { data: archivedTodos }, { data: access }, { data: settings },
  ] = await Promise.all([
    supabase.from('mtg_attendees').select('user_id').eq('meeting_id', id),
    supabase.from('mtg_agenda_items').select('id, page_type, title, minutes, position').eq('meeting_id', id).order('position'),
    supabase.from('mtg_runs').select('id, leader_id, started_at, current_page, page_seconds, notes, ratings_revealed').eq('meeting_id', id).is('ended_at', null).maybeSingle(),
    supabase.from('mtg_headlines').select('id, title, owner_id, created_at').eq('meeting_id', id).is('archived_at', null).order('created_at'),
    supabase.from('mtg_todos').select('id, title, owner_id, due_date, done_at, run_id, created_at').eq('meeting_id', id).is('archived_at', null).order('created_at'),
    supabase.from('mtg_issues').select('id, title, owner_id, status, solved_run_id, created_at').eq('meeting_id', id).order('created_at'),
    supabase.from('mtg_goals').select('id, title, owner_id, status, due_date, milestones').eq('meeting_id', id).order('created_at'),
    supabase.from('mtg_kpis').select('id, name, owner_id, cadence, target, unit').eq('meeting_id', id).order('position'),
    supabase.from('mtg_summaries').select('id, run_id, created_at, average_rating, snapshot, emailed_at').eq('meeting_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false).order('full_name'),
    supabase.from('mtg_headlines').select('id, title, owner_id, created_at').eq('meeting_id', id).not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(100),
    supabase.from('mtg_todos').select('id, title, owner_id, due_date, done_at, run_id, created_at').eq('meeting_id', id).not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(100),
    user
      ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle()
      : Promise.resolve({ data: null }),
    // core_values arrives with v46; until then the query errors and we show none.
    supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle(),
  ])

  const kpiIds = (kpis ?? []).map(k => k.id as string)
  const [{ data: kpiValues }, { data: ratings }] = await Promise.all([
    kpiIds.length
      ? supabase.from('mtg_kpi_values').select('kpi_id, period_start, value').in('kpi_id', kpiIds)
      : Promise.resolve({ data: [] as any[] }),
    activeRun
      ? supabase.from('mtg_ratings').select('user_id, rating, feedback').eq('run_id', activeRun.id)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const lastFeedback = ((summaries?.[0]?.snapshot as any)?.ratings ?? []) as { user_id: string; rating: number | null; feedback: string | null }[]
  const allIssues = (issues ?? []) as any[]
  // Archive shows issues solved in meetings that have since concluded.
  const archivedIssues = allIssues.filter(i => i.status === 'solved' && i.solved_run_id && i.solved_run_id !== activeRun?.id)
  const pageType: PageType = (PAGE_TYPES as string[]).includes(sp.pageType ?? '') ? (sp.pageType as PageType) : 'CHECK_IN'

  // Until the leader has revealed ratings, only your own row is visible.
  const visibleRatings = (ratings ?? []).filter((r: any) => activeRun?.ratings_revealed || r.user_id === user?.id)

  return (
    <MeetingShell
      meeting={meeting}
      tab={tab}
      pageType={pageType}
      agenda={(agenda ?? []) as any}
      run={activeRun ? { ...activeRun, page_seconds: (activeRun.page_seconds ?? {}) as any } : null}
      people={people ?? []}
      attendeeIds={(attendees ?? []).map(a => a.user_id as string)}
      myId={user?.id ?? ''}
      headlines={(headlines ?? []) as any}
      todos={(todos ?? []) as any}
      issues={allIssues.filter(i => !archivedIssues.includes(i))}
      goals={(goals ?? []) as any}
      kpis={(kpis ?? []) as any}
      kpiValues={(kpiValues ?? []) as any}
      ratings={visibleRatings as any}
      lastFeedback={lastFeedback}
      summaries={(summaries ?? []) as any}
      archived={{ headlines: (archivedHeadlines ?? []) as any, todos: (archivedTodos ?? []) as any, issues: archivedIssues }}
      coreValues={(Array.isArray(settings?.core_values) ? settings.core_values : []) as string[]}
      isAdmin={access?.role === 'admin'}
    />
  )
}
