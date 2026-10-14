'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsManager } from '../guard'
import { insertMeeting } from '../meetingFactory'

// Creates (or returns the existing) quarterly alignment meeting between the
// caller and one of their direct reports.
export async function createQuarterlyAlignment(reportId: string) {
  const { supabase, user } = await requireMeetingsManager()
  if (reportId === user.id) throw new Error('Pick someone else')

  const { data: report } = await supabase.from('profiles').select('full_name').eq('id', reportId).maybeSingle()
  if (!report) throw new Error('Person not found')

  // Reuse an existing QA meeting that has exactly these two attendees.
  const { data: existing } = await supabase
    .from('mtg_meetings')
    .select('id, mtg_attendees(user_id)')
    .eq('meeting_type', 'quarterly_alignment')
    .eq('is_archived', false)
  const found = (existing ?? []).find((m: any) => {
    const ids: string[] = (m.mtg_attendees ?? []).map((a: any) => a.user_id)
    return ids.length === 2 && ids.includes(user.id) && ids.includes(reportId)
  })
  if (found) return found.id as string

  const { data: me } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const id = await insertMeeting(supabase, user.id, {
    name: `Quarterly alignment: ${report.full_name ?? 'Team member'} & ${me?.full_name ?? 'Manager'}`,
    leader_id: user.id,
    attendee_ids: [reportId],
    meeting_type: 'quarterly_alignment',
  })
  revalidatePath('/meetings')
  revalidatePath('/meetings/direct-reports')
  return id
}
