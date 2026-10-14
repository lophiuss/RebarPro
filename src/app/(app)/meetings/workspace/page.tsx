export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { LayoutDashboard } from 'lucide-react'
import WorkspaceTiles from './WorkspaceTiles'

export default async function MeetingsWorkspacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const myId = user?.id ?? ''

  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 70)
  const since = sinceDate.toISOString().slice(0, 10)

  const [{ data: attendance }, { data: todos }, { data: goals }, { data: kpis }, { data: settings }, { data: notes }, { data: profile }] = await Promise.all([
    supabase.from('mtg_attendees').select('meeting_id, meeting:mtg_meetings(id, name, is_archived)').eq('user_id', myId),
    supabase.from('mtg_todos').select('id, title, due_date, done_at, meeting_id, meeting:mtg_meetings(name)').eq('owner_id', myId).is('archived_at', null).order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('mtg_goals').select('id, title, status, due_date, milestones, meeting_id, meeting:mtg_meetings(name)').eq('owner_id', myId).order('created_at'),
    supabase.from('mtg_kpis').select('id, name, target, unit, cadence, meeting_id, meeting:mtg_meetings(name)').eq('owner_id', myId).eq('cadence', 'weekly').order('position'),
    // core_values / private notes come from v46; a missing column/table just yields empty data.
    supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle(),
    supabase.from('mtg_private_notes').select('id, body, updated_at').order('updated_at', { ascending: false }),
    supabase.from('profiles').select('full_name').eq('id', myId).maybeSingle(),
  ])

  const kpiIds = (kpis ?? []).map(k => k.id as string)
  const { data: values } = kpiIds.length
    ? await supabase.from('mtg_kpi_values').select('kpi_id, period_start, value').in('kpi_id', kpiIds).gte('period_start', since)
    : { data: [] as any[] }

  const meetings = (attendance ?? [])
    .map((a: any) => a.meeting)
    .filter((m: any) => m && !m.is_archived)
    .map((m: any) => ({ id: m.id as string, name: m.name as string }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  const coreValues = (Array.isArray(settings?.core_values) ? settings.core_values : []) as string[]

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
        <LayoutDashboard className="w-7 h-7 text-blue-600" /> My Workspace
      </h1>
      <p className="text-sm text-gray-500 mb-6">{profile?.full_name ? `${profile.full_name}'s` : 'Your'} to-dos, KPIs and priorities from every meeting you attend.</p>
      <WorkspaceTiles
        meetings={meetings}
        todos={(todos ?? []) as any}
        goals={(goals ?? []) as any}
        kpis={(kpis ?? []) as any}
        kpiValues={(values ?? []) as any}
        coreValues={coreValues}
        notes={(notes ?? []) as any}
      />
    </div>
  )
}
