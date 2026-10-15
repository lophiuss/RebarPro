export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { UserPlus } from 'lucide-react'
import PeopleView from './PeopleView'

export default async function PeoplePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: access } = user
    ? await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle()
    : { data: null }
  const isAdmin = access?.role === 'admin'

  const [{ data: contacts }, { data: seatLinks }, { data: meetingLinks }, { data: todos }, { data: loginProfiles }] = await Promise.all([
    supabase.from('mtg_contacts').select('id, full_name, email, user_id').order('full_name'),
    supabase.from('mtg_seat_contacts').select('contact_id'),
    supabase.from('mtg_meeting_contacts').select('contact_id'),
    supabase.from('mtg_todos').select('owner_name').is('owner_id', null).not('owner_name', 'is', null).is('done_at', null).is('archived_at', null),
    supabase.from('profiles').select('id, full_name'),
  ])
  const count = (rows: { contact_id: string }[] | null) => {
    const m: Record<string, number> = {}
    for (const r of rows ?? []) m[r.contact_id] = (m[r.contact_id] ?? 0) + 1
    return m
  }
  const seats = count(seatLinks), meetings = count(meetingLinks)
  const openTodos: Record<string, number> = {}
  for (const t of todos ?? []) openTodos[t.owner_name as string] = (openTodos[t.owner_name as string] ?? 0) + 1
  const nameOf = new Map((loginProfiles ?? []).map(p => [p.id as string, p.full_name as string]))

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><UserPlus className="w-7 h-7 text-blue-600" /> People &amp; invitations</h1>
      <p className="text-sm text-gray-500 mb-6">People from your old system who do not have a login yet. Add their e-mail, then invite them: each person gets an e-mail with a one-time link to choose their own password, access to the Meetings module, and everything that was assigned to them.</p>
      <PeopleView
        isAdmin={isAdmin}
        people={(contacts ?? []).map(c => ({
          id: c.id as string, name: c.full_name as string, email: (c.email as string | null) ?? '',
          login: c.user_id ? (nameOf.get(c.user_id as string) ?? 'Has a login') : null,
          seats: seats[c.id as string] ?? 0, meetings: meetings[c.id as string] ?? 0, todos: openTodos[c.full_name as string] ?? 0,
        }))}
      />
    </div>
  )
}
