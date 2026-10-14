import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PAGE_TYPES } from '@/lib/meetings'

// Creates a meeting, its attendees and a copy of the default agenda. Shared by
// the Meetings list ("New meeting") and Direct reports ("Create a quarterly
// alignment meeting"). The creator and the leader are always attendees.
export async function insertMeeting(
  supabase: SupabaseClient,
  creatorId: string,
  input: {
    name: string
    description?: string | null
    leader_id: string | null
    attendee_ids: string[]
    meeting_type?: 'weekly' | 'quarterly_alignment'
  },
) {
  const name = input.name.trim()
  if (!name) throw new Error('Meeting name is required')

  const leaderId = input.leader_id || creatorId
  const { data: meeting, error } = await supabase
    .from('mtg_meetings')
    .insert({
      name,
      description: input.description?.trim() || null,
      leader_id: leaderId,
      created_by: creatorId,
      // Only sent when it differs from the column default, so plain weekly
      // meetings keep working on a database that predates v47.
      ...(input.meeting_type && input.meeting_type !== 'weekly' ? { meeting_type: input.meeting_type } : {}),
    })
    .select('id')
    .single()
  if (error) throw error

  const attendeeIds = Array.from(new Set([creatorId, leaderId, ...input.attendee_ids]))
  const { error: attErr } = await supabase
    .from('mtg_attendees')
    .insert(attendeeIds.map(user_id => ({ meeting_id: meeting.id, user_id })))
  if (attErr) throw attErr

  const { data: settings } = await supabase.from('mtg_settings').select('default_agenda').eq('id', 1).maybeSingle()
  const agenda: { page_type: string; title: string; minutes: number }[] = Array.isArray(settings?.default_agenda) ? settings.default_agenda : []
  const rows = agenda
    .filter(a => (PAGE_TYPES as string[]).includes(a.page_type))
    .map((a, i) => ({ meeting_id: meeting.id, page_type: a.page_type, title: a.title, minutes: a.minutes, position: i }))
  if (rows.length) {
    const { error: agErr } = await supabase.from('mtg_agenda_items').insert(rows)
    if (agErr) throw agErr
  }
  return meeting.id as string
}
