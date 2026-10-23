export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { LayoutDashboard } from 'lucide-react'
import WorkspaceTiles from './WorkspaceTiles'

export default async function MeetingsWorkspacePage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  const myId = user?.id ?? ''

  const [
    { data: attendance }, { data: todos }, { data: goals }, { data: kpis }, { data: settings },
    { data: notes }, { data: profile }, { data: people }, { data: allMeetings }, { data: pref }, { data: issues }, { data: personalTodos },
  ] = await Promise.all([
    supabase.from('mtg_attendees').select('meeting_id, meeting:mtg_meetings(id, name, is_archived, schedule)').eq('user_id', myId),
    supabase.from('mtg_todos')
      .select('id, title, details, due_date, done_at, status, meeting_id, owner_id, created_at')
      .eq('owner_id', myId).is('archived_at', null).order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('mtg_goals')
      .select('id, title, details, status, due_date, milestones, meeting_id, owner_id, created_at, meeting:mtg_meetings(name)')
      .eq('owner_id', myId).order('created_at'),
    supabase.from('mtg_kpis')
      .select('id, name, details, owner_id, cadence, unit_type, goal_rule, goal_value, goal_value_max, meeting_id')
      .eq('owner_id', myId).order('cadence').order('position'),
    supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle(),
    supabase.from('mtg_private_notes').select('id, body, updated_at, color').order('updated_at', { ascending: false }),
    supabase.from('profiles').select('full_name').eq('id', myId).maybeSingle(),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false).order('full_name'),
    supabase.from('mtg_meetings').select('id, name').eq('is_archived', false).order('name'),
    supabase.from('mtg_user_prefs').select('value').eq('user_id', myId).eq('key', 'workspace.layout.v2').maybeSingle(),
    supabase.from('mtg_issues')
      .select('id, title, details, owner_id, status, created_at, due_date, meeting_id')
      .eq('owner_id', myId).in('status', ['short_term', 'parking_lot']).order('created_at'),
    supabase.from('mtg_personal_todos').select('id, title, due_date, done_at, status, created_at').order('created_at', { ascending: false }),
  ])

  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 400)
  const since = sinceDate.toISOString().slice(0, 10)

  const kpiIds = (kpis ?? []).map(k => k.id as string)

  const meetings = (attendance ?? [])
    .map((a: any) => a.meeting)
    .filter((m: any) => m && !m.is_archived)
    .map((m: any) => ({ id: m.id as string, name: m.name as string }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  // Meetings that were actually held, for the calendar (about four months either side). Fetched in
  // the same round as the KPI history, since both only need the first round's answers.
  const meetingIds = meetings.map((m: any) => m.id as string)
  const heldSince = new Date(); heldSince.setDate(heldSince.getDate() - 130)
  const [{ data: values }, { data: kpiGoals }, { data: runs }] = await Promise.all([
    kpiIds.length ? supabase.from('mtg_kpi_values').select('kpi_id, period_start, value').in('kpi_id', kpiIds).gte('period_start', since) : Promise.resolve({ data: [] as any[] }),
    kpiIds.length ? supabase.from('mtg_kpi_goals').select('kpi_id, period_start, goal_rule, goal_value, goal_value_max').in('kpi_id', kpiIds) : Promise.resolve({ data: [] as any[] }),
    meetingIds.length ? supabase.from('mtg_runs').select('meeting_id, started_at').in('meeting_id', meetingIds).gte('started_at', heldSince.toISOString()) : Promise.resolve({ data: [] as any[] }),
  ])
  const nameById = new Map(meetings.map((m: any) => [m.id as string, m.name as string]))
  const calHeld = (runs ?? []).map((r: any) => ({
    meeting_id: r.meeting_id as string,
    name: nameById.get(r.meeting_id) ?? 'Meeting',
    date: new Date(r.started_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }),
  }))
  const calMeetings = (attendance ?? [])
    .map((a: any) => a.meeting)
    .filter((m: any) => m && !m.is_archived)
    .map((m: any) => ({ id: m.id as string, name: m.name as string, schedule: m.schedule ?? null }))
  const calItems = [
    ...(todos ?? []).filter((t: any) => t.due_date).map((t: any) => ({ id: t.id, kind: 'todo' as const, title: t.title, date: t.due_date, done: !!t.done_at, meeting_id: t.meeting_id, meetingName: nameById.get(t.meeting_id) })),
    ...(issues ?? []).filter((i: any) => i.due_date).map((i: any) => ({ id: i.id, kind: 'issue' as const, title: i.title, date: i.due_date, done: false, meeting_id: i.meeting_id, meetingName: nameById.get(i.meeting_id) })),
  ]

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1800px] mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
        <LayoutDashboard className="w-7 h-7 text-blue-600" /> My Workspace
      </h1>
      <p className="text-sm text-gray-500 mb-5">{profile?.full_name ? `${profile.full_name}'s` : 'Your'} to-dos, issues, KPIs you own and priorities from every meeting you attend, with a calendar of what is due.</p>
      <WorkspaceTiles
        myId={myId}
        meetings={meetings}
        allMeetings={allMeetings ?? []}
        people={people ?? []}
        todos={(todos ?? []) as any}
        goals={(goals ?? []) as any}
        issues={(issues ?? []) as any}
        kpis={(kpis ?? []).map((k: any) => ({ ...k, meeting: { name: (allMeetings ?? []).find((m: any) => m.id === k.meeting_id)?.name ?? '' } })) as any}
        kpiValues={(values ?? []) as any}
        kpiGoals={(kpiGoals ?? []) as any}
        coreValues={(Array.isArray(settings?.core_values) ? settings.core_values : []) as string[]}
        notes={(notes ?? []) as any}
        savedLayout={(pref?.value ?? null) as any}
        calMeetings={calMeetings}
        calHeld={calHeld}
        calItems={calItems}
        personalTodos={(personalTodos ?? []) as any}
      />
    </div>
  )
}
