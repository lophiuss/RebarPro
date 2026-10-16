export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import PrepSessionView from './PrepSessionView'

export default async function PrepSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const user = await getSignedInUser(supabase)

  const { data: session } = await supabase
    .from('mtg_prep_sessions')
    .select('id, meeting_id, due_date, meeting:mtg_meetings(name), doc:mtg_prep_docs(name, questions)')
    .eq('id', id)
    .maybeSingle()
  if (!session) notFound()

  const [{ data: attendees }, { data: responses }, { data: people }] = await Promise.all([
    supabase.from('mtg_attendees').select('user_id').eq('meeting_id', session.meeting_id),
    supabase.from('mtg_prep_responses').select('user_id, answers, submitted_at').eq('session_id', id),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false),
  ])

  const s = session as any
  return (
    <PrepSessionView
      sessionId={id}
      meetingId={session.meeting_id as string}
      meetingName={s.meeting?.name ?? ''}
      docName={s.doc?.name ?? ''}
      questions={s.doc?.questions ?? []}
      dueDate={session.due_date as string}
      attendeeIds={(attendees ?? []).map(a => a.user_id as string)}
      responses={(responses ?? []) as any}
      people={people ?? []}
      myId={user?.id ?? ''}
    />
  )
}
