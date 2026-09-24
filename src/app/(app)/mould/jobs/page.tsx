export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { ClipboardEdit } from 'lucide-react'
import JobsTable from './JobsTable'

export default async function MouldJobsPage() {
  const supabase = await createClient()

  const [{ data: jobs }, { data: moulds }] = await Promise.all([
    supabase
      .from('mould_jobs')
      .select('id, job_no, job_type, cost_center, status, started_on, completed_on, added_steel_kg, material_cost_snapshot, mould:mould_assets(id, name), project:plantpro_projects(name)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('mould_assets').select('id, name, status').neq('status', 'eol').order('name'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><ClipboardEdit className="w-7 h-7 text-teal-600" /> Mould Jobs</h1>
      <JobsTable jobs={(jobs as any) || []} moulds={moulds || []} />
    </div>
  )
}
