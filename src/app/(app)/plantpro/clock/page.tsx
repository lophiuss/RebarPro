import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { redirect } from 'next/navigation'
import ClockClient from './ClockClient'

export const dynamic = 'force-dynamic'

export default async function ClockPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'plantpro' })
  if (!hasAccess) redirect('/')

  const [{ data: isStaff }, { data: myWorkerId }] = await Promise.all([
    supabase.rpc('plantpro_is_staff'),
    supabase.rpc('plantpro_my_worker_id'),
  ])

  const todayIso = new Date().toISOString().slice(0, 10)

  const [
    { data: workers },
    { data: sites },
    { data: projects },
    { data: activeSessions },
  ] = await Promise.all([
    supabase.from('plantpro_workers').select('id, worker_no, name, line, supervisor_id').neq('status', 'Inactive').order('name'),
    supabase.from('plantpro_clock_sites').select('id, name, latitude, longitude, radius_meters').eq('is_active', true),
    supabase.from('plantpro_projects').select('id, name').eq('status', 'Active').eq('archived', false).order('name'),
    supabase.from('plantpro_attendance_sessions')
      .select('id, worker_id, work_date, clock_in_at, clock_out_at, in_method, is_outstation, outstation_location, in_distance_m, in_photo_drive_id')
      .eq('work_date', todayIso)
      .is('clock_out_at', null),
  ])

  return (
    <ClockClient
      workers={workers || []}
      sites={sites || []}
      projects={projects || []}
      myWorkerId={myWorkerId ? Number(myWorkerId) : null}
      isStaff={!!isStaff}
      initialActiveSessions={activeSessions || []}
    />
  )
}
