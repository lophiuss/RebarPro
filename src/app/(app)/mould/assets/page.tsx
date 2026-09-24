export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Hammer } from 'lucide-react'
import AssetsTable from './AssetsTable'

export default async function MouldAssetsPage() {
  const supabase = await createClient()

  const [{ data: assets }, { data: projects }] = await Promise.all([
    supabase
      .from('mould_assets')
      .select('id, mould_code, name, mould_type, status, product_weight_kg, steel_weight_kg, owning_project_id, current_project_id, owning:mould_projects!mould_assets_owning_project_id_fkey(name), current:mould_projects!mould_assets_current_project_id_fkey(name)')
      .order('name'),
    supabase.from('mould_projects').select('id, name').eq('status', 'active').order('name'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Hammer className="w-7 h-7 text-teal-600" /> Moulds</h1>
      <AssetsTable assets={(assets as any) || []} projects={projects || []} />
    </div>
  )
}
