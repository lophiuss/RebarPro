export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { ClipboardList } from 'lucide-react'
import SessionPrepView from './SessionPrepView'

export default async function SessionPrepPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const myId = user?.id ?? ''

  const [{ data: sessions }, { data: responses }, { data: docs }, { data: meetings }, { data: attendance }, { data: access }] = await Promise.all([
    supabase.from('mtg_prep_sessions').select('id, meeting_id, doc_id, due_date, created_by, created_at, meeting:mtg_meetings(name), doc:mtg_prep_docs(name)').order('due_date', { ascending: false }),
    supabase.from('mtg_prep_responses').select('session_id, user_id, submitted_at'),
    supabase.from('mtg_prep_docs').select('id, name, questions').order('name'),
    supabase.from('mtg_meetings').select('id, name').eq('is_archived', false).order('name'),
    supabase.from('mtg_attendees').select('meeting_id, user_id'),
    user ? supabase.from('user_department_access').select('role').eq('user_id', myId).eq('department', 'meetings').maybeSingle() : Promise.resolve({ data: null }),
  ])
  const role = access?.role as string | undefined

  const attendeeCount: Record<string, number> = {}
  const myMeetings = new Set<string>()
  for (const a of attendance ?? []) {
    attendeeCount[a.meeting_id as string] = (attendeeCount[a.meeting_id as string] ?? 0) + 1
    if (a.user_id === myId) myMeetings.add(a.meeting_id as string)
  }
  const submitted: Record<string, number> = {}
  const mySubmitted = new Set<string>()
  for (const r of responses ?? []) {
    if (r.submitted_at) {
      submitted[r.session_id as string] = (submitted[r.session_id as string] ?? 0) + 1
      if (r.user_id === myId) mySubmitted.add(r.session_id as string)
    }
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><ClipboardList className="w-7 h-7 text-blue-600" /> Session prep</h1>
      <p className="text-sm text-gray-500 mb-6">Gather everyone&apos;s thoughts before a meeting so it stays focused and efficient.</p>
      <SessionPrepView
        sessions={((sessions ?? []) as any[]).map(s => ({
          id: s.id, meeting_id: s.meeting_id, due_date: s.due_date, created_by: s.created_by,
          meeting_name: s.meeting?.name ?? '', doc_name: s.doc?.name ?? '',
          submitted: submitted[s.id] ?? 0, total: attendeeCount[s.meeting_id] ?? 0,
          mine: myMeetings.has(s.meeting_id), mySubmitted: mySubmitted.has(s.id),
        }))}
        docs={(docs ?? []) as any}
        meetings={(meetings ?? []).filter(m => myMeetings.has(m.id as string) || role === 'admin')}
        myId={myId}
        canManageDocs={role === 'admin' || role === 'manager'}
      />
    </div>
  )
}
