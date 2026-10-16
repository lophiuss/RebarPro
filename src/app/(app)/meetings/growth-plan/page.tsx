export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { Target } from 'lucide-react'
import GrowthPlanView from './GrowthPlanView'
import type { GrowthPlanContent } from '@/lib/meetings'
import { nameOwners, withNameOwners } from '@/lib/owners'

export default async function GrowthPlanPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)

  const [{ data: plan }, { data: settings }, { data: goals }, { data: parked }, { data: access }, { data: people }] = await Promise.all([
    supabase.from('mtg_growth_plan').select('content, updated_at, updated_by').eq('id', 1).maybeSingle(),
    supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle(),
    supabase.from('mtg_goals').select('id, title, status, due_date, owner_id, owner_name, milestones, meeting:mtg_meetings(name)').neq('status', 'done').order('created_at'),
    supabase.from('mtg_issues').select('id, title, owner_id, owner_name').eq('status', 'parking_lot').order('created_at'),
    user ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('profiles').select('id, full_name').neq('is_active', false),
  ])

  const role = access?.role as string | undefined
  const found = new Set<string>()
  const goalRows = nameOwners(goals as any[], found)
  const parkedRows = nameOwners(parked as any[], found)

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Target className="w-7 h-7 text-blue-600" /> Growth Plan</h1>
      <GrowthPlanView
        initial={(plan?.content ?? {}) as GrowthPlanContent}
        // updated_by is only set by a real save; the row's creation time is not "saved".
        savedAt={plan?.updated_by ? plan.updated_at : null}
        coreValues={(Array.isArray(settings?.core_values) ? settings.core_values : []) as string[]}
        goals={goalRows as any}
        parked={parkedRows as any}
        people={withNameOwners(people ?? [], found)}
        canEdit={role === 'admin' || role === 'manager'}
      />
    </div>
  )
}
