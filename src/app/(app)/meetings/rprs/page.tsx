export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { UserCheck } from 'lucide-react'
import RprsView from './RprsView'
import { downline, everyone, seatsBelow } from './scope'

export default async function RprsPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)

  const [{ data: settings }, { data: assessments }, { data: seatPeople }, { data: seats }, { data: people }, { data: access }, { data: criteria }] = await Promise.all([
    supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle(),
    supabase.from('mtg_rprs').select('id, person_id, assessor_id, assessed_on, core_values, gwc, notes, created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('mtg_seat_people').select('seat_id, user_id'),
    supabase.from('mtg_seats').select('id, parent_id, title, roles, gwc_pass_score'),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false).order('full_name'),
    user ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('mtg_gwc_criteria').select('id, seat_id, dimension, label, position').order('position'),
  ])

  const role = access?.role as string | undefined
  const isBoss = role === 'admin'
  const canAssess = isBoss || role === 'manager'
  // Managers see the people below their own seat; the boss (admin) sees everyone in a seat.
  const scope = canAssess
    ? (isBoss ? everyone : downline)((seats ?? []) as any, (seatPeople ?? []) as any, user?.id ?? '')
    : new Map()
  const scopeObj: Record<string, { level: number; seats: string[]; seat_ids: string[]; roles: string[] }> = {}
  for (const [id, e] of scope) scopeObj[id] = { ...e, roles: Array.from(new Set(e.roles)) }
  const mySeats = (seatPeople ?? []).filter(sp => sp.user_id === user?.id).length

  // A superior writes the criteria for the seats below theirs; the boss for any seat.
  const below = seatsBelow((seats ?? []) as any, (seatPeople ?? []) as any, user?.id ?? '')
  const seatInfo: Record<string, { title: string; pass_score: number | null; can_edit: boolean }> = {}
  for (const s of seats ?? []) {
    seatInfo[s.id as string] = { title: s.title as string, pass_score: (s.gwc_pass_score as number | null) ?? null, can_edit: canAssess && (isBoss || below.has(s.id as string)) }
  }
  const criteriaBySeat: Record<string, { id: string; dimension: string; label: string }[]> = {}
  for (const c of criteria ?? []) (criteriaBySeat[c.seat_id as string] ??= []).push({ id: c.id as string, dimension: c.dimension as string, label: c.label as string })

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1600px] mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><UserCheck className="w-7 h-7 text-blue-600" /> Right Person Right Seat</h1>
      <p className="text-sm text-gray-500 mb-6">For managers and the boss. First write what Gets it, Wants it and Capacity mean for each seat below yours and the score needed to pass. Then score the person against it: good (2), so-so (1), no (0). Assessments are private to whoever made them (and Meetings admins).</p>
      <RprsView
        coreValues={(Array.isArray(settings?.core_values) ? settings.core_values : []) as string[]}
        assessments={(assessments ?? []) as any}
        people={people ?? []}
        scope={scopeObj}
        seatInfo={seatInfo}
        criteriaBySeat={criteriaBySeat}
        myId={user?.id ?? ''}
        canAssess={canAssess}
        isBoss={isBoss}
        mySeats={mySeats}
      />
    </div>
  )
}
