export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Users } from 'lucide-react'
import AllocationForm from './AllocationForm'

interface SearchParams { date?: string }

export default async function MouldAllocationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { date } = await searchParams
  const workDate = date || new Date().toISOString().slice(0, 10)
  const supabase = await createClient()

  // Mould department workers aren't tagged as such anywhere in the migrated
  // PlantPro data (the "line" field is free-text timecard department/task
  // text, not a clean category) — the mould supervisor is the reliable
  // signal instead: only LEONG's workers show up in the allocation dropdown.
  const { data: mouldSupervisor } = await supabase.from('plantpro_supervisors').select('id').eq('name', 'LEONG').maybeSingle()

  const [{ data: workers }, { data: activities }, { data: openJobs }, { data: projects }, { data: entries }, { data: lock }] = await Promise.all([
    supabase.from('plantpro_workers').select('id, worker_no, name').eq('status', 'Active').eq('supervisor_id', mouldSupervisor?.id ?? -1).order('name'),
    supabase.from('mould_activities').select('code, label, cost_target').eq('is_active', true).order('sort_order'),
    supabase.from('mould_jobs').select('id, job_type, mould:mould_assets(name)').neq('status', 'completed').neq('status', 'cancelled').order('id', { ascending: false }),
    supabase.from('plantpro_projects').select('id, name').eq('status', 'Active').order('name'),
    supabase
      .from('mould_time_entries')
      .select('id, worker_id, hours, activity_code, cost_target, labour_cost, worker:plantpro_workers(name), job:mould_jobs(mould:mould_assets(name)), project:plantpro_projects(name)')
      .eq('work_date', workDate)
      .order('id', { ascending: false }),
    supabase.from('mould_month_locks').select('status').eq('period', workDate.slice(0, 7)).maybeSingle(),
  ])

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Users className="w-7 h-7 text-teal-600" /> Time Allocation</h1>
      <AllocationForm
        workDate={workDate}
        workers={workers || []}
        activities={activities || []}
        openJobs={(openJobs as any) || []}
        projects={projects || []}
        entries={(entries as any) || []}
        isLocked={lock?.status === 'locked'}
      />
    </div>
  )
}
