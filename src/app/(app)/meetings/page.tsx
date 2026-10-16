export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { CalendarDays } from 'lucide-react'
import MeetingsList from './MeetingsList'

export default async function MeetingsPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)

  const [{ data: meetings }, { data: attendees }, { data: people }, { data: activeRuns }, { data: doneRuns }] = await Promise.all([
    supabase.from('mtg_meetings').select('id, name, description, leader_id, meeting_type').eq('is_archived', false).order('name'),
    supabase.from('mtg_attendees').select('meeting_id, user_id, is_favourite'),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false).order('full_name'),
    supabase.from('mtg_runs').select('meeting_id').is('ended_at', null),
    supabase.from('mtg_runs').select('meeting_id, started_at, ended_at').not('ended_at', 'is', null).order('ended_at', { ascending: false }).limit(5000),
  ])
  // Most recent concluded meeting per meeting
  const lastRun: Record<string, string> = {}
  for (const r of doneRuns ?? []) {
    const when = (r.started_at ?? r.ended_at) as string
    if (!lastRun[r.meeting_id as string] || when > lastRun[r.meeting_id as string]) lastRun[r.meeting_id as string] = when
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <CalendarDays className="w-7 h-7 text-blue-600" /> Meetings
      </h1>
      <MeetingsList
        meetings={meetings ?? []}
        attendees={attendees ?? []}
        people={people ?? []}
        liveMeetingIds={(activeRuns ?? []).map(r => r.meeting_id as string)}
        lastRun={lastRun}
        myId={user?.id ?? ''}
      />
    </div>
  )
}
