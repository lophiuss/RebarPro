export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { MessagesSquare } from 'lucide-react'
import OneOnOneList from './OneOnOneList'

export default async function OneOnOnePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: sessions }, { data: people }, { data: access }] = await Promise.all([
    supabase.from('mtg_one_on_ones').select('id, manager_id, report_id, quarter, status, updated_at').order('quarter', { ascending: false }).order('updated_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false).order('full_name'),
    user ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle() : Promise.resolve({ data: null }),
  ])
  const role = access?.role as string | undefined

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><MessagesSquare className="w-7 h-7 text-blue-600" /> Quarterly 1:1</h1>
      <p className="text-sm text-gray-500 mb-6">A structured conversation between a manager and a team member each quarter. Both people answer the same questions, then compare. Only the two participants (and Meetings admins) can see it.</p>
      <OneOnOneList sessions={(sessions ?? []) as any} people={people ?? []} myId={user?.id ?? ''} canCreate={role === 'admin' || role === 'manager'} />
    </div>
  )
}
