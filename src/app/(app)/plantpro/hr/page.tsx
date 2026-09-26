export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Users } from 'lucide-react'
import HRClient from './HRClient'
import RestrictedNotice from '../RestrictedNotice'

export default async function PlantproHrPage() {
  const supabase = await createClient()
  const { data: canSeeWages } = await supabase.rpc('plantpro_can_see_wages')
  if (!canSeeWages) return <RestrictedNotice what="This page" />

  const [
    { data: workers }, { data: supervisors }, { data: projects },
    { data: payColumns }, { data: allocations }, { data: payValues },
    { data: movements }, { data: allSupervisors },
  ] = await Promise.all([
    supabase.from('plantpro_workers').select('id, worker_no, name, line, designation, supervisor_id, status, remarks, nationality, date_of_birth, date_joined').order('name'),
    supabase.from('plantpro_supervisors').select('id, name').eq('status', 'Active').order('name'),
    supabase.from('plantpro_projects').select('id, name').eq('status', 'Active').order('name'),
    supabase.from('plantpro_pay_columns').select('id, key, label, type, include_in_gross, include_in_net_deduct').order('sort_order'),
    supabase.from('plantpro_worker_allocations').select('worker_id, project_id, percentage'),
    // RLS-gated: empty for a supervisor-tier viewer, by design (this page
    // isn't even in a supervisor's nav, but the guard is enforced here too).
    supabase.from('plantpro_worker_pay_values').select('worker_id, pay_column_id, value'),
    supabase.from('plantpro_worker_movements').select('id, worker_id, effective_date, from_supervisor_id, to_supervisor_id, from_line, to_line, changed_by, created_at').order('effective_date'),
    supabase.from('plantpro_supervisors').select('id, name'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Users className="w-7 h-7 text-indigo-600" /> HR Manpower Database</h1>
      <HRClient
        workers={workers || []}
        supervisors={supervisors || []}
        projects={projects || []}
        payColumns={payColumns || []}
        allocations={allocations || []}
        payValues={payValues || []}
        movements={movements || []}
        supervisorNames={Object.fromEntries((allSupervisors || []).map(s => [s.id, s.name]))}
      />
    </div>
  )
}
