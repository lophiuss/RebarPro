export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Building2 } from 'lucide-react'
import HostelClient from './HostelClient'

export default async function PlantproHostelPage() {
  const supabase = await createClient()

  const [
    { data: hostels }, { data: workers }, { data: stays }, { data: itemTypes }, { data: bills },
  ] = await Promise.all([
    supabase.from('plantpro_hostels').select('*').order('name'),
    supabase.from('plantpro_workers').select('id, name').neq('status', 'Inactive').order('name'),
    supabase.from('plantpro_hostel_stays').select('id, worker_id, hostel_id, move_in_date, move_out_date').order('move_in_date', { ascending: false }),
    supabase.from('plantpro_hostel_bill_item_types').select('*').order('sort_order'),
    supabase.from('plantpro_hostel_utility_bills').select('id, hostel_id, month, applied_at, line_items:plantpro_hostel_bill_line_items(item_type_id, amount)'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Building2 className="w-7 h-7 text-indigo-600" /> Hostel Management</h1>
      <HostelClient
        hostels={hostels || []}
        workers={workers || []}
        stays={stays || []}
        itemTypes={itemTypes || []}
        bills={(bills as any) || []}
      />
    </div>
  )
}
