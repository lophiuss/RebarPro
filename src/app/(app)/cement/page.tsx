export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import CementSiloGrid, { type SiloStock } from '@/components/CementSiloGrid'

export default async function CementDashboardPage() {
  const supabase = await createClient()

  // The stock calculation (last stock-take + everything since) is done
  // server-side in the cement_silo_stock() function — see supabase_migration_v10_cement_merge.sql's
  // follow-up migration. Doing it client-side would require pulling every
  // weight_in/daily_usage/daily_stock_take row, which this project's PostgREST
  // caps at 1000 rows per request (cement_daily_stock_take alone has 1800+).
  const { data, error } = await supabase.rpc('cement_silo_stock')

  const siloStocks: SiloStock[] = (data || []).map((s: any) => ({
    silo_id: s.silo_id,
    silo: s.silo,
    plant: s.plant,
    material: s.material,
    capacity: s.capacity,
    current_stock: Number(s.current_stock),
    bg_color: s.bg_color || '#ffffff',
  }))

  const byPlant = new Map<string, SiloStock[]>()
  for (const s of siloStocks) {
    if (!byPlant.has(s.plant)) byPlant.set(s.plant, [])
    byPlant.get(s.plant)!.push(s)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Current Stock</h1>
      {error && <p className="text-red-600 text-sm mb-4">Error loading silo stock: {error.message}</p>}
      {siloStocks.length === 0 && !error ? (
        <p className="text-gray-500">No active silos found.</p>
      ) : (
        <CementSiloGrid silosByPlant={Array.from(byPlant.entries())} />
      )}
    </div>
  )
}
