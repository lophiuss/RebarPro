export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { FileText } from 'lucide-react'
import ClaimsClient from './ClaimsClient'

export default async function PlantproClaimsPage() {
  const supabase = await createClient()

  const [{ data: projects }, { data: claims }] = await Promise.all([
    supabase.from('plantpro_projects').select('id, name, status').order('name'),
    supabase.from('plantpro_claims').select('*').order('date', { ascending: false }),
  ])

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><FileText className="w-7 h-7 text-indigo-600" /> Claims &amp; Monthly Reports</h1>
      <ClaimsClient projects={projects || []} claims={claims || []} />
    </div>
  )
}
