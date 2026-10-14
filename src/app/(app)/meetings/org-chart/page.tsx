export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Network } from 'lucide-react'
import OrgChartView from './OrgChartView'

export default async function OrgChartPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: seats }, { data: seatPeople }, { data: people }, { data: access }] = await Promise.all([
    supabase.from('mtg_seats').select('id, parent_id, title, subtitle, roles, position').order('position'),
    supabase.from('mtg_seat_people').select('seat_id, user_id'),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false).order('full_name'),
    user ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle() : Promise.resolve({ data: null }),
  ])
  const role = access?.role as string | undefined

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2 print:hidden"><Network className="w-7 h-7 text-blue-600" /> Organizational Chart</h1>
      <OrgChartView
        seats={(seats ?? []) as any}
        seatPeople={seatPeople ?? []}
        people={people ?? []}
        canEdit={role === 'admin' || role === 'manager'}
      />
    </div>
  )
}
