'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ShieldCheck,
  Users,
  Truck,
  Building2,
  DoorClosed,
  DoorOpen,
  X,
  LogOut,
  Activity,
  Navigation,
  ClipboardEdit,
  Radio,
  KeyRound,
  Siren,
  ArrowRight,
} from 'lucide-react'
import PhotoLightbox from '@/components/PhotoLightbox'
import ActivityLogFeed from '@/components/ActivityLogFeed'
import ShoutoutBoard from '@/components/ShoutoutBoard'
import { buildActivityLog, ActivityEvent } from '@/lib/security/activityLog'
import { useLang } from '@/lib/i18n/useLang'
import { makeT } from '@/lib/i18n/languages'
import { securityDict } from '@/lib/i18n/dict/security'
import LanguageSwitcher from '@/components/LanguageSwitcher'

type Category = 'visitor' | 'delivery' | 'inhouse'
type Entry = {
  id: number; category: Category; person_name: string; company: string | null; purpose: string | null
  vehicle_no: string | null; badge_no: string | null; reference_no: string | null; notes: string | null
  photo_drive_id: string | null; time_in: string; time_out?: string | null; status?: string | null
  created_by: string | null
}
type Gate = { id: number; name: string; pos_x: number; pos_y: number; status: 'locked' | 'open' }
type Post = { id: number; name: string }
type Shift = { post_name: string; guard_name: string; time_in: string }

const CATEGORY_ICON: Record<Category, string> = { visitor: '🧑', delivery: '🚚', inhouse: '🏭' }

export default function SecurityDashboardPage() {
  const supabase = createClient()
  const [counts, setCounts] = useState({ visitors: 0, deliveries: 0, inhouse: 0, today: 0 })
  const [active, setActive] = useState<Entry[]>([])
  const [checkedOut, setCheckedOut] = useState<Entry[]>([])
  const [gates, setGates] = useState<Gate[]>([])
  const [layout, setLayout] = useState<{ photo_drive_id: string | null; photo_url: string | null } | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [detail, setDetail] = useState<Entry | null>(null)
  const [mapCollapsed, setMapCollapsed] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [lang, setLang] = useLang()
  const t = makeT(securityDict, lang)
  const categoryLabel = (c: Category) => t(`category.${c}`)

  useEffect(() => { load() }, [])

  async function load() {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
    const startOfDayISO = startOfDay.toISOString()
    const [
      { count: visitors }, { count: deliveries }, { count: inhouse }, { count: today },
      { data: activeRows }, { data: outRows }, { data: gateRows }, { data: layoutRow }, { data: postRows }, { data: shiftRows },
      { data: dayEntries }, { data: dayPostLogs }, { data: dayGateEvents }, { data: dayPanics }, { data: dayIncidents },
    ] = await Promise.all([
      supabase.from('security_entries').select('id', { count: 'exact', head: true }).eq('status', 'in').eq('category', 'visitor'),
      supabase.from('security_entries').select('id', { count: 'exact', head: true }).eq('status', 'in').eq('category', 'delivery'),
      supabase.from('security_entries').select('id', { count: 'exact', head: true }).eq('status', 'in').eq('category', 'inhouse'),
      supabase.from('security_entries').select('id', { count: 'exact', head: true }).gte('time_in', startOfDayISO),
      supabase.from('security_entries').select('*').eq('status', 'in').order('time_in', { ascending: false }).limit(40),
      supabase.from('security_entries').select('*').eq('status', 'out').gte('time_out', startOfDayISO).order('time_out', { ascending: false }).limit(50),
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
    setCheckedOut(outRows || [])
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
      setCheckedOut(prev => [{ ...entry, status: 'out', time_out: now }, ...prev])
      setCounts(prev => ({
        ...prev,
        visitors: entry.category === 'visitor' ? Math.max(0, prev.visitors - 1) : prev.visitors,
        deliveries: entry.category === 'delivery' ? Math.max(0, prev.deliveries - 1) : prev.deliveries,
        inhouse: entry.category === 'inhouse' ? Math.max(0, prev.inhouse - 1) : prev.inhouse,
      }))
      setActivity(prev => [{
        id: `entry-out-${id}`, time: now,
        icon: CATEGORY_ICON[entry.category], label: `${categoryLabel(entry.category)} Out: ${entry.person_name}`,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-blue-600" /> {t('dashboard.title')}</h1>
        <LanguageSwitcher lang={lang} onChange={setLang} />
      </div>

      <ShoutoutBoard department="security" />

      {/* Quick Action Navigation for Guards on Mobile/Desktop */}
      <div>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">
          {t('dashboard.quickActions')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Highlight Card: GPS Clocking */}
          <Link
            href="/security/gps-clocking"
            className="group col-span-1 sm:col-span-2 lg:col-span-2 flex items-center justify-between p-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white shadow-sm hover:shadow-md transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Navigation className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-base tracking-tight truncate flex items-center gap-1.5">
                  {t('dashboard.gpsClocking')}
                  <span className="text-[10px] uppercase font-bold bg-white/25 px-2 py-0.5 rounded-full">
                    Clock In
                  </span>
                </div>
                <p className="text-xs text-blue-100 truncate mt-0.5">
                  {t('dashboard.gpsClockingDesc')}
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-white/70 group-hover:text-white group-hover:translate-x-1 transition shrink-0 ml-2" />
          </Link>

          {/* Gate Entries */}
          <Link
            href="/security/entries"
            className="group flex items-center justify-between p-3.5 bg-white border border-gray-200 hover:border-blue-400 rounded-xl shadow-2xs hover:shadow-sm transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition">
                <ClipboardEdit className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-xs text-slate-800 truncate">{t('dashboard.entries')}</div>
                <div className="text-[11px] text-gray-500 truncate">{t('dashboard.entriesDesc')}</div>
              </div>
            </div>
          </Link>

          {/* Post Logs */}
          <Link
            href="/security/post-logs"
            className="group flex items-center justify-between p-3.5 bg-white border border-gray-200 hover:border-blue-400 rounded-xl shadow-2xs hover:shadow-sm transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition">
                <Radio className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-xs text-slate-800 truncate">{t('dashboard.postLogs')}</div>
                <div className="text-[11px] text-gray-500 truncate">{t('dashboard.postLogsDesc')}</div>
              </div>
            </div>
          </Link>

          {/* Key Management */}
          <Link
            href="/security/keys"
            className="group flex items-center justify-between p-3.5 bg-white border border-gray-200 hover:border-blue-400 rounded-xl shadow-2xs hover:shadow-sm transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-xs text-slate-800 truncate">{t('dashboard.keyManagement')}</div>
                <div className="text-[11px] text-gray-500 truncate">{t('dashboard.keyManagementDesc')}</div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1"><Users className="w-3.5 h-3.5" /> {t('dashboard.visitorsInside')}</div>
          <div className="text-2xl font-extrabold">{counts.visitors}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1"><Truck className="w-3.5 h-3.5" /> {t('dashboard.deliveriesIn')}</div>
          <div className="text-2xl font-extrabold">{counts.deliveries}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1"><Building2 className="w-3.5 h-3.5" /> {t('dashboard.inhouseIn')}</div>
          <div className="text-2xl font-extrabold">{counts.inhouse}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('dashboard.totalIn')}</div>
          <div className="text-2xl font-extrabold">{counts.deliveries + counts.inhouse}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('dashboard.todayTotal')}</div>
          <div className="text-2xl font-extrabold">{counts.today}</div>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> {t('dashboard.livePostStatus')}</h2>
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
                  {overdue && <span className="text-[10px] font-bold bg-amber-500 text-white rounded px-1.5 py-0.5">{t('dashboard.overdue')}</span>}
                </div>
                <div className="text-xs text-gray-500 pl-4.5 mt-1">
                  {shift ? <>🧑 {shift.guard_name}<br />🕐 {t('dashboard.since')} {new Date(shift.time_in).toLocaleString()} <span className={`font-semibold ${overdue ? 'text-amber-600' : 'text-blue-600'}`}>({hrs.toFixed(1)} hrs)</span></> : <em>{t('dashboard.vacant')}</em>}
                </div>
              </div>
            )
          })}
          {posts.length === 0 && <p className="text-sm text-gray-400">{t('dashboard.noPosts')}</p>}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700">🗺️ {t('dashboard.siteLayout')}</h2>
          <button onClick={() => setMapCollapsed(c => !c)} className="text-xs text-blue-600 hover:underline">{mapCollapsed ? t('dashboard.expand') : t('dashboard.collapse')}</button>
        </div>
        {!mapCollapsed && (
          <div className="relative w-full aspect-video bg-gray-100 border rounded-xl overflow-hidden">
            {(() => {
              const src = layout?.photo_url || (layout?.photo_drive_id && layout.photo_drive_id !== 'PENDING' ? `/api/security/photo/${layout.photo_drive_id}` : null)
              return src ? (
                <img src={src} className="w-full h-full object-contain cursor-zoom-in" onClick={() => setZoomSrc(src)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">{t('dashboard.noLayout')}</div>
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
        {/* Section 1: Currently Inside */}
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">🔴 {t('dashboard.currentlyInside')}</h2>
          <span className="text-xs bg-red-100 text-red-700 rounded-full px-2.5 py-0.5 font-bold">{active.length}</span>
        </div>
        {active.length > 0 ? (
          <div className="flex flex-wrap gap-3 p-4 border-b">
            {active.map(e => (
              <button
                key={e.id}
                onClick={() => setDetail(e)}
                className="w-28 border rounded-lg overflow-hidden bg-white shadow-xs hover:shadow-md hover:-translate-y-0.5 transition text-left shrink-0 cursor-pointer group"
                title={`${e.person_name} — Click to view details and photo`}
              >
                <div className="relative">
                  {e.photo_drive_id ? (
                    <img
                      src={`/api/security/photo/${e.photo_drive_id}`}
                      alt={e.person_name}
                      className="w-full h-[85px] object-cover group-hover:opacity-95 transition"
                    />
                  ) : (
                    <div className="w-full h-[85px] bg-gray-100 flex items-center justify-center text-3xl text-gray-300">
                      {CATEGORY_ICON[e.category]}
                    </div>
                  )}
                  <span className="absolute top-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                    {categoryLabel(e.category)}
                  </span>
                </div>
                <div className="px-2 py-1.5">
                  <div className="text-xs font-bold text-slate-800 truncate" title={e.person_name}>
                    {e.person_name}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {new Date(e.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-gray-400 border-b">
            {t('dashboard.nobodyInside')}
          </p>
        )}

        {/* Section 2: Already Left Premises Today (No double detail) */}
        <div className="px-4 py-2.5 bg-slate-100/80 border-b flex items-center justify-between text-xs font-semibold text-slate-700">
          <span className="flex items-center gap-1.5">
            <span>🟢</span>
            <span>{t('dashboard.checkedOutToday')}</span>
          </span>
          <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 font-mono">
            {checkedOut.length}
          </span>
        </div>

        <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
          {checkedOut.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => setDetail(e)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-sm text-left hover:bg-slate-50 transition cursor-pointer"
              title={`${e.person_name} — Click to view details and photo`}
            >
              <div className="min-w-0 flex items-center gap-2.5">
                {e.photo_drive_id ? (
                  <img
                    src={`/api/security/photo/${e.photo_drive_id}`}
                    alt={e.person_name}
                    className="w-9 h-9 rounded-md object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center text-base shrink-0">
                    {CATEGORY_ICON[e.category]}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    {e.person_name} <span className="text-xs text-gray-400">({categoryLabel(e.category)})</span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {e.company || e.vehicle_no || '-'}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0 ml-3 text-xs">
                <div className="text-emerald-700 font-semibold font-mono">
                  {e.time_out ? `Out ${new Date(e.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Out'}
                </div>
                <div className="text-[10px] text-gray-400 font-mono">
                  In {new Date(e.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </button>
          ))}
          {checkedOut.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-gray-400">
              {t('dashboard.noCheckedOutToday')}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" /> {t('dashboard.activityLog')}</h2>
          <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1 font-semibold">{activity.length}</span>
        </div>
        <ActivityLogFeed events={activity} emptyLabel={t('dashboard.noActivity')} />
      </div>

      {/* DETAIL MODAL WITH BIG PHOTO AND COMPLETE INFORMATION */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-4 sm:p-6 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3 pb-2 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-2xl">{CATEGORY_ICON[detail.category]}</span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 truncate">{detail.person_name}</h2>
                  <span className="inline-block bg-blue-50 text-blue-700 text-[10px] font-bold uppercase rounded-full px-2 py-0.5">
                    {categoryLabel(detail.category)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* BIG PHOTO DISPLAY */}
            {detail.photo_drive_id ? (
              <div className="relative group mb-4 rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center max-h-72 sm:max-h-80 border border-slate-200">
                <img
                  src={`/api/security/photo/${detail.photo_drive_id}`}
                  alt={detail.person_name}
                  className="w-full h-auto max-h-72 sm:max-h-80 object-contain cursor-zoom-in"
                  onClick={() => setZoomSrc(`/api/security/photo/${detail.photo_drive_id}`)}
                />
                <button
                  type="button"
                  onClick={() => setZoomSrc(`/api/security/photo/${detail.photo_drive_id}`)}
                  className="absolute bottom-2 right-2 bg-black/70 hover:bg-black text-white text-xs px-2.5 py-1 rounded-md backdrop-blur-sm cursor-pointer transition flex items-center gap-1 shadow-sm"
                >
                  <span>Zoom Fullscreen</span> ↗
                </button>
              </div>
            ) : (
              <div className="w-full h-32 rounded-xl bg-gray-100 flex items-center justify-center text-5xl mb-4 border border-dashed border-gray-300">
                {CATEGORY_ICON[detail.category]}
              </div>
            )}

            {/* DETAIL FIELDS */}
            <div className="bg-slate-50 border rounded-xl p-3.5 mb-4 text-xs">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <span className="text-gray-400 block text-[11px]">{t('common.company')}</span>
                  <span className="font-semibold text-slate-800">{detail.company || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">{t('common.purpose')}</span>
                  <span className="font-semibold text-slate-800">{detail.purpose || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">{t('dashboard.vehicle')}</span>
                  <span className="font-semibold font-mono text-slate-800">{detail.vehicle_no || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">{t('dashboard.badge')}</span>
                  <span className="font-semibold font-mono text-slate-800">{detail.badge_no || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">{t('dashboard.refDo')}</span>
                  <span className="font-semibold font-mono text-slate-800">{detail.reference_no || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">{t('common.timeIn')}</span>
                  <span className="font-semibold text-slate-800">{new Date(detail.time_in).toLocaleString()}</span>
                </div>
                {detail.time_out && (
                  <div>
                    <span className="text-gray-400 block text-[11px]">{t('common.timeOut')}</span>
                    <span className="font-semibold text-emerald-700">{new Date(detail.time_out).toLocaleString()}</span>
                  </div>
                )}
              </div>
              {detail.notes && (
                <div className="mt-2.5 pt-2 border-t border-slate-200">
                  <span className="text-gray-400 block text-[11px]">{t('common.notes')}</span>
                  <span className="text-slate-700">{detail.notes}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('dashboard.attendedBy')}: <strong className="text-slate-700">{detail.created_by || '-'}</strong></span>
              {detail.status !== 'out' && !detail.time_out ? (
                <button
                  type="button"
                  onClick={() => checkout(detail.id)}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl transition cursor-pointer shadow-sm active:scale-[0.98]"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('dashboard.checkout')}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-medium text-xs">
                  ✓ {t('status.returned')} ({detail.time_out ? new Date(detail.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Out'})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
