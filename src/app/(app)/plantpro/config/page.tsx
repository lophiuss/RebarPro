export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Settings } from 'lucide-react'
import ConfigClient from './ConfigClient'

export default async function PlantproConfigPage() {
  const supabase = await createClient()

  const [{ data: projects }, { data: projectTypes }, { data: supervisors }, { data: payColumns }, { data: payColumnBases }] = await Promise.all([
    supabase.from('plantpro_projects').select('id, name, type_id, status').order('name'),
    supabase.from('plantpro_project_types').select('id, name').order('name'),
    supabase.from('plantpro_supervisors').select('id, name, status').order('name'),
    supabase.from('plantpro_pay_columns').select('id, key, label, type, sort_order, include_in_gross, include_in_net_deduct, compute_mode, multiplier_percent').order('sort_order'),
    supabase.from('plantpro_pay_column_bases').select('column_id, base_column_id'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Settings className="w-7 h-7 text-indigo-600" /> Configuration</h1>
      <ConfigClient
        projects={projects || []}
        projectTypes={projectTypes || []}
        supervisors={supervisors || []}
        payColumns={payColumns || []}
        payColumnBases={payColumnBases || []}
      />
    </div>
  )
}
