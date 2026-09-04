export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import CementSiloGrid, { type SiloStock } from '@/components/CementSiloGrid'
import ShoutoutBoard from '@/components/ShoutoutBoard'
import { ClipboardCheck, Truck, TruckElectric } from 'lucide-react'

type Activity = { key: string; icon: 'in' | 'out' | 'stock'; text: string; sub: string; at: string; preciseTime: boolean }

function timeAgo(iso: string, preciseTime: boolean) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (preciseTime) {
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.round(hours / 24)
    return `${days}d ago`
  }
  // Stock takes only carry a date, not a time — say "on <date>" rather than
  // implying false precision with a relative time.
  return `on ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export default async function CementDashboardPage() {
  const supabase = await createClient()

  // The stock calculation (last stock-take + everything since) is done
  // server-side in the cement_silo_stock() function — see supabase_migration_v10_cement_merge.sql's
  // follow-up migration. Doing it client-side would require pulling every
  // weight_in/daily_usage/daily_stock_take row, which this project's PostgREST
  // caps at 1000 rows per request (cement_daily_stock_take alone has 1800+).
  const [{ data, error }, { data: weightIns }, { data: weightOuts }, { data: stockTakes }] = await Promise.all([
    supabase.rpc('cement_silo_stock'),
    supabase.from('cement_weight_in').select('id, lorry_no, supplier, created_at, cement_plants(name)').order('created_at', { ascending: false }).limit(10),
    supabase.from('cement_weight_in').select('id, lorry_no, weight_out_operator, weight_out_time, cement_plants(name)').not('weight_out_time', 'is', null).order('weight_out_time', { ascending: false }).limit(10),
    supabase.from('cement_daily_stock_take').select('id, take_date, operator, cement_silos(name, cement_plants(name))').order('take_date', { ascending: false }).order('id', { ascending: false }).limit(10),
  ])

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

  const activity: Activity[] = [
    ...(weightIns || []).map((w: any): Activity => ({
      key: `in-${w.id}`, icon: 'in',
      text: `Truck ${w.lorry_no} weighed in`,
      sub: `${w.supplier || 'Unknown supplier'} · ${w.cement_plants?.name || '-'}`,
      at: w.created_at, preciseTime: true,
    })),
    ...(weightOuts || []).map((w: any): Activity => ({
      key: `out-${w.id}`, icon: 'out',
      text: `Truck ${w.lorry_no} weighed out`,
      sub: `${w.weight_out_operator || 'Unknown operator'} · ${w.cement_plants?.name || '-'}`,
      at: w.weight_out_time, preciseTime: true,
    })),
    ...(stockTakes || []).map((s: any): Activity => ({
      key: `st-${s.id}`, icon: 'stock',
      text: `Stock take recorded — ${s.cement_silos?.name || 'Unknown silo'}`,
      sub: `${s.operator || 'Unknown operator'} · ${s.cement_silos?.cement_plants?.name || '-'}`,
      at: s.take_date, preciseTime: false,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 15)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-6">Current Stock</h1>
        <ShoutoutBoard department="cement" />
        {error && <p className="text-red-600 text-sm mb-4">Error loading silo stock: {error.message}</p>}
        {siloStocks.length === 0 && !error ? (
          <p className="text-gray-500">No active silos found.</p>
        ) : (
          <CementSiloGrid silosByPlant={Array.from(byPlant.entries())} />
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">Recent Activity</h2>
        <div className="bg-white border rounded-xl shadow-sm divide-y divide-gray-100">
          {activity.length === 0 && <p className="p-4 text-sm text-gray-400">No recent activity.</p>}
          {activity.map(a => (
            <div key={a.key} className="flex items-center gap-3 px-4 py-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                a.icon === 'in' ? 'bg-blue-50 text-blue-600' : a.icon === 'out' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}>
                {a.icon === 'in' ? <Truck className="w-4 h-4" /> : a.icon === 'out' ? <TruckElectric className="w-4 h-4" /> : <ClipboardCheck className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{a.text}</p>
                <p className="text-xs text-gray-500 truncate">{a.sub}</p>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(a.at, a.preciseTime)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
