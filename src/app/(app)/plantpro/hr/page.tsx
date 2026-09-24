export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Users } from 'lucide-react'
import HRClient from './HRClient'

export default async function PlantproHrPage() {
  const supabase = await createClient()

  const [
    { data: workers }, { data: supervisors }, { data: projects },
    { data: payColumns }, { data: allocations }, { data: payValues },
  ] = await Promise.all([
    supabase.from('plantpro_workers').select('id, worker_no, name, line, designation, supervisor_id, status, remarks, nationality, date_of_birth, date_joined').order('name'),
    supabase.from('plantpro_supervisors').select('id, name').eq('status', 'Active').order('name'),
    supabase.from('plantpro_projects').select('id, name').eq('status', 'Active').order('name'),
    supabase.from('plantpro_pay_columns').select('id, key, label, type, include_in_gross, include_in_net_deduct').order('sort_order'),
    supabase.from('plantpro_worker_allocations').select('worker_id, project_id, percentage'),
    // RLS-gated: empty for a supervisor-tier viewer, by design (this page
    // isn't even in a supervisor's nav, but the guard is enforced here too).
    supabase.from('plantpro_worker_pay_values').select('worker_id, pay_column_id, value'),
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
      />
    </div>
  )
}
