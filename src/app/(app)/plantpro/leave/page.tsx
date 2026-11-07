import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { redirect } from 'next/navigation'
import LeaveClient from './LeaveClient'

export const dynamic = 'force-dynamic'

export default async function LeavePage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'plantpro' })
  if (!hasAccess) redirect('/')

  const [{ data: isStaff }, { data: myWorkerId }] = await Promise.all([
    supabase.rpc('plantpro_is_staff'),
    supabase.rpc('plantpro_my_worker_id'),
  ])

  const [
    { data: workers },
    { data: leaveTypes },
    { data: requests },
  ] = await Promise.all([
    supabase.from('plantpro_workers').select('id, name, worker_no, line').neq('status', 'Inactive').order('name'),
    supabase.from('plantpro_leave_types').select('id, code, name, is_paid, requires_attachment, color').order('sort_order'),
    supabase.from('plantpro_leave_requests').select('*, worker:plantpro_workers(name, line), leave_type:plantpro_leave_types(name, code, is_paid, color)').order('created_at', { ascending: false }).limit(80),
  ])

  return (
    <LeaveClient
      workers={workers || []}
      leaveTypes={leaveTypes || []}
      initialRequests={(requests || []) as any}
      myWorkerId={myWorkerId ? Number(myWorkerId) : null}
      isStaff={!!isStaff}
    />
  )
}
