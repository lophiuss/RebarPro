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

// This page runs server-side (Vercel), which defaults to UTC — new Date()'s
// local getters would read the SERVER's calendar date, not Malaysia's. Since
// MYT is UTC+8, that's a full day behind during Malaysia's 00:00-08:00, which
// would silently shift the whole 14-day window back a day right when a plant
// is likely mid-shift. Intl with an explicit timeZone sidesteps the server's
// own clock/timezone entirely.
function isoInKL(d: Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(d) }
function addIsoDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

export default async function CementDashboardPage() {
  const supabase = await createClient()

  // "Days of cover" window — the 14 days up to and including today, in
  // Malaysia's calendar (see isoInKL above), not the server's.
  const todayStr = isoInKL(new Date())
  const fourteenDaysAgoStr = addIsoDays(todayStr, -13)

  // The stock calculation (last stock-take + everything since) is done
  // server-side in the cement_silo_stock() function — see supabase_migration_v10_cement_merge.sql's
  // follow-up migration. Doing it client-side would require pulling every
  // weight_in/daily_usage/daily_stock_take row, which this project's PostgREST
  // caps at 1000 rows per request (cement_daily_stock_take alone has 1800+).
  const [{ data, error }, { data: weightIns }, { data: weightOuts }, { data: stockTakes }, { data: recentUsage }] = await Promise.all([
    supabase.rpc('cement_silo_stock'),
    supabase.from('cement_weight_in').select('id, lorry_no, supplier, created_at, cement_plants(name)').order('created_at', { ascending: false }).limit(10),
    supabase.from('cement_weight_in').select('id, lorry_no, weight_out_operator, weight_out_time, cement_plants(name)').not('weight_out_time', 'is', null).order('weight_out_time', { ascending: false }).limit(10),
    supabase.from('cement_daily_stock_take').select('id, take_date, operator, cement_silos(name, cement_plants(name))').order('take_date', { ascending: false }).order('id', { ascending: false }).limit(10),
    supabase.from('cement_daily_usage').select('silo_id, usage').gte('usage_date', fourteenDaysAgoStr).lte('usage_date', todayStr),
  ])

  // Days of cover is a MATERIAL figure, not a per-silo one — a plant often
  // splits one material across several silos, and stock naturally shifts
  // between them (transfers, uneven draw-down) without changing how much
  // of that material the plant actually has on hand. Summing stock and
  // usage across every silo of the same material at the same plant before
  // dividing gives one true figure per material, shown on each of that
  // material's silo cards rather than a misleading number per container.
  const usageSumBySilo = new Map<number, number>()
  for (const u of recentUsage || []) {
    usageSumBySilo.set(u.silo_id, (usageSumBySilo.get(u.silo_id) || 0) + (Number(u.usage) || 0))
  }

  const materialGroups = new Map<string, { stock: number; avgDailyUsage: number }>()
  for (const s of data || []) {
    const key = `${s.plant}::${s.material || ''}`
    const g = materialGroups.get(key) || { stock: 0, avgDailyUsage: 0 }
    g.stock += Number(s.current_stock)
    // Days with no logged usage count as 0 (dividing by a fixed 14, not
    // just the days that happen to have a record) — matches "based on 14
    // days usage" literally.
    g.avgDailyUsage += (usageSumBySilo.get(s.silo_id) || 0) / 14
    materialGroups.set(key, g)
  }

  const siloStocks: SiloStock[] = (data || []).map((s: any) => {
    const group = materialGroups.get(`${s.plant}::${s.material || ''}`)!
    return {
      silo_id: s.silo_id,
      silo: s.silo,
      plant: s.plant,
      material: s.material,
      capacity: s.capacity,
      current_stock: Number(s.current_stock),
      bg_color: s.bg_color || '#ffffff',
      // null = no usage logged for this material (across all its silos at
      // this plant) in the last 14 days — not the same as infinite cover.
      days_of_cover: group.avgDailyUsage > 0 ? group.stock / group.avgDailyUsage : null,
    }
  })

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
