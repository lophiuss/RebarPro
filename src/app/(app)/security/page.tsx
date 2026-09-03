'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck, Users, Truck, Building2, DoorClosed, DoorOpen, X, LogOut, Activity } from 'lucide-react'
import PhotoLightbox from '@/components/PhotoLightbox'
import ActivityLogFeed from '@/components/ActivityLogFeed'
import { buildActivityLog, ActivityEvent } from '@/lib/security/activityLog'

type Category = 'visitor' | 'delivery' | 'inhouse'
type Entry = {
  id: number; category: Category; person_name: string; company: string | null; purpose: string | null
  vehicle_no: string | null; badge_no: string | null; reference_no: string | null; notes: string | null
  photo_drive_id: string | null; time_in: string; created_by: string | null
}
type Gate = { id: number; name: string; pos_x: number; pos_y: number; status: 'locked' | 'open' }
type Post = { id: number; name: string }
type Shift = { post_name: string; guard_name: string; time_in: string }

const CATEGORY_LABEL: Record<Category, string> = { visitor: 'Visitor', delivery: 'Delivery', inhouse: 'In-House' }
const CATEGORY_ICON: Record<Category, string> = { visitor: '🧑', delivery: '🚚', inhouse: '🏭' }

export default function SecurityDashboardPage() {
  const supabase = createClient()
  const [counts, setCounts] = useState({ visitors: 0, deliveries: 0, inhouse: 0, today: 0 })
  const [active, setActive] = useState<Entry[]>([])
  const [gates, setGates] = useState<Gate[]>([])
  const [layout, setLayout] = useState<{ photo_drive_id: string | null; photo_url: string | null } | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [detail, setDetail] = useState<Entry | null>(null)
  const [mapCollapsed, setMapCollapsed] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
    const startOfDayISO = startOfDay.toISOString()
    const [
      { count: visitors }, { count: deliveries }, { count: inhouse }, { count: today },
      { data: activeRows }, { data: gateRows }, { data: layoutRow }, { data: postRows }, { data: shiftRows },
      { data: dayEntries }, { data: dayPostLogs }, { data: dayGateEvents }, { data: dayPanics }, { data: dayIncidents },
    ] = await Promise.all([
      supabase.from('security_entries').select('id', { count: 'exact', head: true }).eq('status', 'in').eq('category', 'visitor'),
      supabase.from('security_entries').select('id', { count: 'exact', head: true }).eq('status', 'in').eq('category', 'delivery'),
      supabase.from('security_entries').select('id', { count: 'exact', head: true }).eq('status', 'in').eq('category', 'inhouse'),
      supabase.from('security_entries').select('id', { count: 'exact', head: true }).gte('time_in', startOfDayISO),
      supabase.from('security_entries').select('*').eq('status', 'in').order('time_in', { ascending: false }).limit(40),
      supabase.from('security_gates').select('id, name, pos_x, pos_y, status').order('id'),
      supabase.from('security_layout').select('photo_drive_id, photo_url').order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('security_guard_posts').select('id, name').order('name'),
      supabase.from('security_post_logs').select('post_name, guard_name, time_in').is('time_out', null),
      supabase.from('security_entries').select('id, category, person_name, company, vehicle_no, time_in, time_out').gte('time_in', startOfDayISO),
      supabase.from('security_post_logs').select('id, guard_name, post_name, time_in, time_out').gte('time_in', startOfDayISO),
      supabase.from('security_gate_events').select('id, gate_name, action, username, created_at').gte('created_at', startOfDayISO),
      supabase.from('security_panic_logs').select('id, triggered_by, remark, created_at').gte('created_at', startOfDayISO),
      supabase.from('security_incidents').select('id, type, description, severity, reported_by, created_at').gte('created_at', startOfDayISO),
    ])
    setCounts({ visitors: visitors ?? 0, deliveries: deliveries ?? 0, inhouse: inhouse ?? 0, today: today ?? 0 })
    setActive(activeRows || [])
    setGates(gateRows || [])
    setLayout(layoutRow)
    setPosts(postRows || [])
    setShifts(shiftRows || [])
    setActivity(buildActivityLog({
      entries: dayEntries || [], postLogs: dayPostLogs || [], gateEvents: dayGateEvents || [],
      panicLogs: dayPanics || [], incidents: dayIncidents || [],
    }))
  }

  // Both actions below update local state directly instead of re-running the
  // full 14-query load() — these are the two most frequent things done from
  // this page, and neither one needs the gates/layout/posts/etc. data that
  // load() also refetches every time.
  async function toggleGate(gate: Gate) {
    const { data: { user } } = await supabase.auth.getUser()
    const newStatus = gate.status === 'locked' ? 'open' : 'locked'
    const now = new Date().toISOString()
    const { error } = await supabase.from('security_gates').update({ status: newStatus, updated_at: now }).eq('id', gate.id)
    if (error) { alert('Error: ' + error.message); return }
    await supabase.from('security_gate_events').insert([{ gate_id: gate.id, gate_name: gate.name, action: newStatus, username: user?.email || null }])
    setGates(prev => prev.map(g => g.id === gate.id ? { ...g, status: newStatus } : g))
    setActivity(prev => [{
      id: `gate-${gate.id}-${now}`, time: now,
      icon: newStatus === 'locked' ? '🔒' : '🔓',
      label: `Gate ${newStatus === 'locked' ? 'Closed' : 'Opened'}: ${gate.name}`,
      detail: user?.email || '', tone: newStatus === 'locked' ? 'default' : 'warn',
    }, ...prev])
  }

  async function checkout(id: number) {
    const now = new Date().toISOString()
    const { error } = await supabase.from('security_entries').update({ status: 'out', time_out: now }).eq('id', id).eq('status', 'in')
    if (error) { alert('Error: ' + error.message); return }
    const entry = active.find(e => e.id === id)
    setDetail(null)
    setActive(prev => prev.filter(e => e.id !== id))
    if (entry) {
      setCounts(prev => ({
        ...prev,
        visitors: entry.category === 'visitor' ? Math.max(0, prev.visitors - 1) : prev.visitors,
        deliveries: entry.category === 'delivery' ? Math.max(0, prev.deliveries - 1) : prev.deliveries,
        inhouse: entry.category === 'inhouse' ? Math.max(0, prev.inhouse - 1) : prev.inhouse,
      }))
      setActivity(prev => [{
        id: `entry-out-${id}`, time: now,
        icon: CATEGORY_ICON[entry.category], label: `${CATEGORY_LABEL[entry.category]} Out: ${entry.person_name}`,
        detail: entry.company || entry.vehicle_no || '', tone: 'default',
      }, ...prev])
    }
  }

  // A post can end up with more than one "still open" shift (a guard double
  // clocks in without properly closing the previous one) — always show the
  // most recently started one, not whichever the query happens to return
  // first, or the dashboard can get stuck displaying a stale/closed-in-the-
  // legacy-app shift.
  const shiftByPost = new Map<string, Shift>()
  for (const s of shifts) {
    const key = s.post_name.trim().toLowerCase()
    const existing = shiftByPost.get(key)
    if (!existing || new Date(s.time_in) > new Date(existing.time_in)) {
      shiftByPost.set(key, s)
    }
  }
  const now = Date.now()

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-blue-600" /> Security Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1"><Users className="w-3.5 h-3.5" /> Visitors Inside</div>
          <div className="text-2xl font-extrabold">{counts.visitors}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1"><Truck className="w-3.5 h-3.5" /> Deliveries In</div>
          <div className="text-2xl font-extrabold">{counts.deliveries}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1"><Building2 className="w-3.5 h-3.5" /> In-House In</div>
          <div className="text-2xl font-extrabold">{counts.inhouse}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Trailers / Total In</div>
          <div className="text-2xl font-extrabold">{counts.deliveries + counts.inhouse}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Today Total</div>
          <div className="text-2xl font-extrabold">{counts.today}</div>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Live Post Status</h2>
        <div className="flex flex-wrap gap-3">
          {posts.map(p => {
            const shift = shiftByPost.get(p.name.trim().toLowerCase())
            const hrs = shift ? (now - new Date(shift.time_in).getTime()) / 3600000 : 0
            const overdue = !!shift && hrs > 14
            return (
              <div
                key={p.id}
                className={`flex-1 min-w-[200px] rounded-lg border p-3 ${!shift ? 'bg-red-50 border-red-200' : overdue ? 'bg-amber-50 border-amber-200 border-l-4 border-l-amber-500' : 'bg-green-50 border-green-200'}`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-800">
                  <span className={`w-2.5 h-2.5 rounded-full ${!shift ? 'bg-red-500' : overdue ? 'bg-amber-500' : 'bg-green-500'}`} />
                  {p.name}
                  {overdue && <span className="text-[10px] font-bold bg-amber-500 text-white rounded px-1.5 py-0.5">OVERDUE</span>}
                </div>
                <div className="text-xs text-gray-500 pl-4.5 mt-1">
                  {shift ? <>🧑 {shift.guard_name}<br />🕐 Since {new Date(shift.time_in).toLocaleString()} <span className={`font-semibold ${overdue ? 'text-amber-600' : 'text-blue-600'}`}>({hrs.toFixed(1)} hrs)</span></> : <em>Vacant</em>}
                </div>
              </div>
            )
          })}
          {posts.length === 0 && <p className="text-sm text-gray-400">No posts configured. Go to Settings to add them.</p>}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700">🗺️ Site Layout</h2>
          <button onClick={() => setMapCollapsed(c => !c)} className="text-xs text-blue-600 hover:underline">{mapCollapsed ? 'Expand' : 'Collapse'}</button>
        </div>
        {!mapCollapsed && (
          <div className="relative w-full aspect-video bg-gray-100 border rounded-xl overflow-hidden">
            {(() => {
              const src = layout?.photo_url || (layout?.photo_drive_id && layout.photo_drive_id !== 'PENDING' ? `/api/security/photo/${layout.photo_drive_id}` : null)
              return src ? (
                <img src={src} className="w-full h-full object-contain cursor-zoom-in" onClick={() => setZoomSrc(src)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">No site layout uploaded yet</div>
              )
            })()}
            {gates.map(g => (
              <button
                key={g.id}
                onClick={() => toggleGate(g)}
                title={`${g.name}: ${g.status}`}
                style={{ left: `${g.pos_x}%`, top: `${g.pos_y}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md ${g.status === 'locked' ? 'bg-red-500' : 'bg-green-500'}`}>
                  {g.status === 'locked' ? <DoorClosed className="w-4 h-4 text-white" /> : <DoorOpen className="w-4 h-4 text-white" />}
                </span>
                <span className="text-[10px] font-semibold bg-white/90 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">{g.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">🔴 Currently Inside</h2>
          <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 font-semibold">{active.length}</span>
        </div>
        {active.length > 0 && (
          <div className="flex flex-wrap gap-3 p-4 border-b">
            {active.map(e => (
              <button
                key={e.id}
                onClick={() => setDetail(e)}
                className="w-28 border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition text-left flex-shrink-0"
              >
                <div className="relative">
                  {e.photo_drive_id ? (
                    <img
                      src={`/api/security/photo/${e.photo_drive_id}`}
                      className="w-full h-[85px] object-cover cursor-zoom-in"
                      onClick={ev => { ev.stopPropagation(); setZoomSrc(`/api/security/photo/${e.photo_drive_id}`) }}
                    />
                  ) : (
                    <div className="w-full h-[85px] bg-gray-100 flex items-center justify-center text-3xl text-gray-300">{CATEGORY_ICON[e.category]}</div>
                  )}
                  <span className="absolute top-1 right-1 bg-black/55 text-white text-[9px] px-1.5 py-0.5 rounded">{CATEGORY_LABEL[e.category]} {CATEGORY_ICON[e.category]}</span>
                </div>
                <div className="px-2 py-1.5">
                  <div className="text-xs font-bold text-slate-800 truncate" title={e.person_name}>{e.person_name}</div>
                  <div className="text-[10px] text-gray-500">{new Date(e.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
          {active.map(e => (
            <div key={e.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{e.person_name} <span className="text-xs text-gray-400">({CATEGORY_LABEL[e.category]})</span></div>
                <div className="text-xs text-gray-500 truncate">{e.company || e.vehicle_no || '-'}</div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 ml-3">{new Date(e.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
          {active.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Nobody currently on site.</p>}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" /> Today's Activity Log</h2>
          <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1 font-semibold">{activity.length}</span>
        </div>
        <ActivityLogFeed events={activity} emptyLabel="No activity yet today." />
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{detail.person_name}</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-4 flex-wrap mb-4">
              {detail.photo_drive_id ? (
                <img
                  src={`/api/security/photo/${detail.photo_drive_id}`}
                  className="w-32 h-32 rounded-xl object-cover border flex-shrink-0 cursor-zoom-in"
                  onClick={() => setZoomSrc(`/api/security/photo/${detail.photo_drive_id}`)}
                />
              ) : (
                <div className="w-32 h-32 rounded-xl bg-gray-100 flex items-center justify-center text-4xl flex-shrink-0">{CATEGORY_ICON[detail.category]}</div>
              )}
              <div className="flex-1 min-w-[180px] text-sm">
                <span className="inline-block bg-blue-50 text-blue-700 text-xs font-bold uppercase rounded-full px-2.5 py-1 mb-2">{CATEGORY_LABEL[detail.category]}</span>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div><strong>Company:</strong> {detail.company || '-'}</div>
                  <div><strong>Purpose:</strong> {detail.purpose || '-'}</div>
                  <div><strong>Vehicle:</strong> {detail.vehicle_no || '-'}</div>
                  <div><strong>Badge:</strong> {detail.badge_no || '-'}</div>
                  <div><strong>Ref/DO:</strong> {detail.reference_no || '-'}</div>
                  <div><strong>In:</strong> {new Date(detail.time_in).toLocaleString()}</div>
                </div>
              </div>
            </div>
            {detail.notes && <div className="text-sm bg-gray-50 border rounded-lg px-3 py-2 mb-4"><strong>Notes:</strong> {detail.notes}</div>}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Attended by: {detail.created_by || '-'}</span>
              <button onClick={() => checkout(detail.id)} className="flex items-center gap-1.5 bg-green-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-green-700"><LogOut className="w-3.5 h-3.5" /> Check-out</button>
            </div>
          </div>
        </div>
      )}

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
