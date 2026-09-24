export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Target } from 'lucide-react'
import TargetsClient from './TargetsClient'

export default async function PlantproTargetsPage() {
  const supabase = await createClient()

  const [
    { data: projects }, { data: projectTypes }, { data: targets }, { data: claims },
  ] = await Promise.all([
    supabase.from('plantpro_projects').select('id, name, status, type_id').order('name'),
    supabase.from('plantpro_project_types').select('id, name'),
    supabase.from('plantpro_monthly_targets').select('*'),
    supabase.from('plantpro_claims').select('id, project_id, type, volume_or_trips, date'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Target className="w-7 h-7 text-indigo-600" /> Production, Delivery &amp; General Targets</h1>
      <TargetsClient
        projects={projects || []}
        projectTypes={projectTypes || []}
        targets={targets || []}
        claims={claims || []}
      />
    </div>
  )
}
