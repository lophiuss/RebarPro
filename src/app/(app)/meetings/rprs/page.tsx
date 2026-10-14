export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { UserCheck } from 'lucide-react'
import RprsView from './RprsView'

export default async function RprsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: settings }, { data: assessments }, { data: seatPeople }, { data: seats }, { data: people }, { data: access }] = await Promise.all([
    supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle(),
    supabase.from('mtg_rprs').select('id, person_id, assessor_id, assessed_on, core_values, gwc, notes, created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('mtg_seat_people').select('seat_id, user_id'),
    supabase.from('mtg_seats').select('id, title'),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false).order('full_name'),
    user ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle() : Promise.resolve({ data: null }),
  ])

  const seatTitle = new Map((seats ?? []).map(s => [s.id as string, s.title as string]))
  const seatsByPerson: Record<string, string[]> = {}
  for (const sp of seatPeople ?? []) {
    const t = seatTitle.get(sp.seat_id as string)
    if (t) (seatsByPerson[sp.user_id as string] ??= []).push(t)
  }
  const role = access?.role as string | undefined

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><UserCheck className="w-7 h-7 text-blue-600" /> Right Person Right Seat</h1>
      <p className="text-sm text-gray-500 mb-6">Rate each person against your core values, then check Gets it, Wants it and Capacity for their seat. Assessments are private to whoever made them (and Meetings admins).</p>
      <RprsView
        coreValues={(Array.isArray(settings?.core_values) ? settings.core_values : []) as string[]}
        assessments={(assessments ?? []) as any}
        people={people ?? []}
        seatsByPerson={seatsByPerson}
        myId={user?.id ?? ''}
        canAssess={role === 'admin' || role === 'manager'}
      />
    </div>
  )
}
