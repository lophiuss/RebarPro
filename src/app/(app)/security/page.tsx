export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { ShieldCheck, Users, Truck, Building2, DoorClosed } from 'lucide-react'

export default async function SecurityDashboardPage() {
  const supabase = await createClient()

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [
    { count: visitorsIn },
    { count: deliveriesIn },
    { count: inhouseIn },
    { count: todayTotal },
    { data: active },
    { data: posts },
    { data: activeShifts },
  ] = await Promise.all([
    supabase.from('security_entries').select('id', { count: 'exact', head: true }).eq('status', 'in').eq('category', 'visitor'),
    supabase.from('security_entries').select('id', { count: 'exact', head: true }).eq('status', 'in').eq('category', 'delivery'),
    supabase.from('security_entries').select('id', { count: 'exact', head: true }).eq('status', 'in').eq('category', 'inhouse'),
    supabase.from('security_entries').select('id', { count: 'exact', head: true }).gte('time_in', startOfDay.toISOString()),
    supabase.from('security_entries').select('id, category, person_name, company, vehicle_no, time_in').eq('status', 'in').order('time_in', { ascending: false }).limit(20),
    supabase.from('security_guard_posts').select('id, name').order('name'),
    supabase.from('security_post_logs').select('post_name, guard_name, time_in').is('time_out', null),
  ])

  const shiftByPost = new Map((activeShifts || []).map(s => [s.post_name.trim().toLowerCase(), s]))

  const CATEGORY_LABEL: Record<string, string> = { visitor: 'Visitor', delivery: 'Delivery', inhouse: 'In-House' }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-blue-600" /> Security Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1"><Users className="w-3.5 h-3.5" /> Visitors In</div>
          <div className="text-2xl font-extrabold">{visitorsIn ?? 0}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1"><Truck className="w-3.5 h-3.5" /> Deliveries In</div>
          <div className="text-2xl font-extrabold">{deliveriesIn ?? 0}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1"><Building2 className="w-3.5 h-3.5" /> In-House Out</div>
          <div className="text-2xl font-extrabold">{inhouseIn ?? 0}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Today Total</div>
          <div className="text-2xl font-extrabold">{todayTotal ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">Currently On Site</h2></div>
          <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {(active || []).map(e => (
              <div key={e.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.person_name} <span className="text-xs text-gray-400">({CATEGORY_LABEL[e.category] || e.category})</span></div>
                  <div className="text-xs text-gray-500 truncate">{e.company || e.vehicle_no || '-'}</div>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-3">{new Date(e.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
            {(active || []).length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Nobody currently on site.</p>}
          </div>
        </div>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><DoorClosed className="w-4 h-4" /> Guard Post Status</h2></div>
          <div className="divide-y divide-gray-100">
            {(posts || []).map(p => {
              const shift = shiftByPost.get(p.name.trim().toLowerCase())
              return (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <span className="font-medium">{p.name}</span>
                  {shift ? (
                    <span className="text-xs bg-green-50 text-green-700 rounded-full px-2.5 py-1">{shift.guard_name} since {new Date(shift.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-400 rounded-full px-2.5 py-1">Unmanned</span>
                  )}
                </div>
              )
            })}
            {(posts || []).length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">No guard posts configured yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
