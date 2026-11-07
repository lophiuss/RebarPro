import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { redirect } from 'next/navigation'
import OtLiveClient from './OtLiveClient'

export const dynamic = 'force-dynamic'

export default async function OtLivePage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'plantpro' })
  if (!hasAccess) redirect('/')

  const [{ data: isStaff }, { data: myWorkerId }, { data: isOtApprover }] = await Promise.all([
    supabase.rpc('plantpro_is_staff'),
    supabase.rpc('plantpro_my_worker_id'),
    supabase.rpc('plantpro_is_ot_approver'),
  ])

  const [
    { data: workers },
    { data: taskTypes },
    { data: projects },
    { data: sessions },
  ] = await Promise.all([
    supabase.from('plantpro_workers').select('id, name, worker_no, line, supervisor_id').neq('status', 'Inactive').order('name'),
    supabase.from('plantpro_ot_task_types').select('id, name, category, requires_start_photo, requires_finish_photo').eq('is_active', true).order('name'),
    supabase.from('plantpro_projects').select('id, name').eq('status', 'Active').eq('archived', false).order('name'),
    supabase.from('plantpro_ot_sessions').select('*, task_type:plantpro_ot_task_types(name), project:plantpro_projects(name)').order('created_at', { ascending: false }).limit(60),
  ])

  return (
    <OtLiveClient
      workers={workers || []}
      taskTypes={taskTypes || []}
      projects={projects || []}
      initialSessions={(sessions || []) as any}
      myWorkerId={myWorkerId ? Number(myWorkerId) : null}
      isStaff={!!isStaff}
      isManager={!!isOtApprover}
    />
  )
}
