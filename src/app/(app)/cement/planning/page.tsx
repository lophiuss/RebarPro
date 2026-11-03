'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LineChart, Factory, ChevronDown, Settings } from 'lucide-react'

type SiloStock = { silo_id: number; silo: string; plant: string; material: string | null; capacity: number | null; current_stock: number }
type SiloUsageRow = { silo_id: number; usage: number }

function isoStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
type Material = { id: number; name: string; batching_req: number | null }
type UsageRow = { usage_date: string; usage: number; plant: string; material: string }

const PALETTE = ['#2563eb', '#dc2626', '#059669', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#be123c', '#0d9488', '#8b5cf6']

type ViewMode = 'all' | 'plant' | 'material'
type RollingWindow = 7 | 14

// Turns a mousemove on the chart's <svg> into the nearest day/period index,
// so the caller can show a tooltip that follows the cursor.
function hoverIndexFromEvent(e: MouseEvent<SVGSVGElement>, viewBoxWidth: number, padL: number, plotW: number, count: number) {
  const svg = e.currentTarget
  const ratio = e.nativeEvent.offsetX / svg.clientWidth
  const svgX = ratio * viewBoxWidth
  const idx = Math.round(((svgX - padL) / plotW) * (count - 1))
  return Math.max(0, Math.min(count - 1, idx))
}

function isoDaysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().split('T')[0]
}

// Builds an SVG path that skips days a group has no data for (a gap in the
// line) instead of dropping to zero, plus the list of real points for
// tooltip circles.
function buildSeries(days: string[], byDay: Map<string, number>, x: (i: number) => number, y: (v: number) => number) {
  let d = ''
  let started = false
  const points: { x: number; y: number; day: string; value: number }[] = []
  days.forEach((day, i) => {
    const v = byDay.get(day)
    if (v === undefined) { started = false; return }
    d += `${started ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)} `
    started = true
    points.push({ x: x(i), y: y(v), day, value: v })
  })
  return { d: d.trim(), points }
}

export default function PlanningPage() {
  const supabase = createClient()
  const [silos, setSilos] = useState<SiloStock[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [reqInputs, setReqInputs] = useState<Record<number, string>>({})
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [pickedPlant, setPickedPlant] = useState('')
  const [pickedMaterial, setPickedMaterial] = useState('')
  const [fromDate, setFromDate] = useState(isoDaysAgo(30))
  const [toDate, setToDate] = useState(isoDaysAgo(0))
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [rollingWindow, setRollingWindow] = useState<RollingWindow>(7)
  const [rollingHoverIdx, setRollingHoverIdx] = useState<number | null>(null)
  const [coverUsage, setCoverUsage] = useState<SiloUsageRow[]>([])
  const [settingsCollapsed, setSettingsCollapsed] = useState(true)

  useEffect(() => { loadStatic() }, [])
  useEffect(() => { loadUsage() }, [fromDate, toDate])

  async function loadStatic() {
    const today = new Date()
    const fourteenDaysAgo = new Date(today)
    fourteenDaysAgo.setDate(today.getDate() - 13)
    const [{ data: stockRows }, { data: matRows }, { data: coverUsageRows }] = await Promise.all([
      supabase.rpc('cement_silo_stock'),
      supabase.from('cement_materials').select('id, name, batching_req').eq('is_active', true).order('name'),
      // Fixed trailing-14-day window for "days of cover" — independent of
      // the usage-trend chart's own (user-adjustable) date range below.
      supabase.from('cement_daily_usage').select('silo_id, usage').gte('usage_date', isoStr(fourteenDaysAgo)).lte('usage_date', isoStr(today)),
    ])
    setSilos((stockRows || []).map((s: any) => ({ ...s, current_stock: Number(s.current_stock) })))
    setMaterials(matRows || [])
    setCoverUsage((coverUsageRows || []).map((r: any) => ({ silo_id: r.silo_id, usage: Number(r.usage) || 0 })))
    const reqs: Record<number, string> = {}
    ;(matRows || []).forEach((m: any) => { reqs[m.id] = String(m.batching_req ?? 0) })
    setReqInputs(reqs)
  }

  async function loadUsage() {
    if (!fromDate || !toDate) return
    const { data: usageRows } = await supabase
      .from('cement_daily_usage')
      .select('usage_date, usage, cement_silos(name, cement_plants(name), cement_silo_materials(cement_materials(name)))')
      .gte('usage_date', fromDate)
      .lte('usage_date', toDate)

    const mappedUsage: UsageRow[] = (usageRows || []).map((r: any) => {
      const silo = r.cement_silos
      const sm = Array.isArray(silo?.cement_silo_materials) ? silo.cement_silo_materials[0] : silo?.cement_silo_materials
      return {
        usage_date: r.usage_date,
        usage: Number(r.usage),
        plant: silo?.cement_plants?.name || 'Unknown',
        material: sm?.cement_materials?.name || 'Unknown',
      }
    })
    setUsage(mappedUsage)
  }

  async function saveRequirement(id: number) {
    const val = reqInputs[id]
    const { error } = await supabase.from('cement_materials').update({ batching_req: Number(val) || 0 }).eq('id', id)
    if (error) { alert('Error saving: ' + error.message); return }
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, batching_req: Number(val) || 0 } : m))
    alert('Saved!')
  }

  const availablePlants = useMemo(() => Array.from(new Set(usage.map(u => u.plant))).sort(), [usage])
  const availableMaterials = useMemo(() => Array.from(new Set(usage.map(u => u.material))).sort(), [usage])

  // Default the picker to the first option once data loads, and keep it valid
  // if the list changes (e.g. a new date range no longer includes it).
  useEffect(() => {
    if (viewMode === 'plant' && !availablePlants.includes(pickedPlant)) setPickedPlant(availablePlants[0] || '')
    if (viewMode === 'material' && !availableMaterials.includes(pickedMaterial)) setPickedMaterial(availableMaterials[0] || '')
  }, [viewMode, availablePlants, availableMaterials])

  // "All" = every plant+material combo. "By Plant"/"By Material" narrow down
  // to one specific plant or material (picked below) and break that one down
  // by the other dimension — not an aggregate across everything.
  const scopedUsage = useMemo(() => {
    if (viewMode === 'plant' && pickedPlant) return usage.filter(u => u.plant === pickedPlant)
    if (viewMode === 'material' && pickedMaterial) return usage.filter(u => u.material === pickedMaterial)
    return usage
  }, [usage, viewMode, pickedPlant, pickedMaterial])

  const keyOf = (u: UsageRow) => viewMode === 'plant' ? u.material : viewMode === 'material' ? u.plant : `${u.plant} - ${u.material}`

  // --- Chart: daily usage. Days with no usage recorded at all are left out
  // of the x-axis entirely, and a group missing data on a day it does show
  // gets a gap in its line rather than a misleading drop to zero. ---
  const chart = useMemo(() => {
    const days = Array.from(new Set(scopedUsage.map(u => u.usage_date))).sort()
    const groups = Array.from(new Set(scopedUsage.map(keyOf))).sort()

    const width = 900, height = 260, padL = 50, padR = 10, padT = 10, padB = 24
    const plotW = width - padL - padR, plotH = height - padT - padB
    const x = (i: number) => padL + (days.length <= 1 ? 0 : (i / (days.length - 1)) * plotW)

    const byDayPerGroup = groups.map(group => {
      const byDay = new Map<string, number>()
      scopedUsage.filter(u => keyOf(u) === group).forEach(u => byDay.set(u.usage_date, (byDay.get(u.usage_date) || 0) + u.usage))
      return { group, byDay }
    })
    const maxVal = Math.max(1, ...byDayPerGroup.flatMap(g => Array.from(g.byDay.values())))
    const y = (v: number) => padT + plotH - (v / maxVal) * plotH

    const series = byDayPerGroup.map((g, i) => ({
      combo: g.group,
      color: PALETTE[i % PALETTE.length],
      ...buildSeries(days, g.byDay, x, y),
    }))

    const tickCount = Math.min(6, days.length)
    const xTicks = Array.from({ length: tickCount }, (_, i) => {
      const idx = tickCount <= 1 ? 0 : Math.round((i / (tickCount - 1)) * (days.length - 1))
      const label = new Date(days[idx] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { x: x(idx), label }
    })

    const xPositions = days.map((_, i) => x(i))

    return { days, series, width, height, padL, padT, padB, plotH, plotW, maxVal, xTicks, xPositions }
  }, [scopedUsage, viewMode])

  // --- Rolling average: 7-day and 14-day, over every calendar day in range
  // (zero-filled) so the average is a true trailing average, not just of the
  // days that happened to have usage. Follows the same All/Plant/Material
  // scope as the chart above. ---
  const rollingChart = useMemo(() => {
    if (!fromDate || !toDate) return null
    const allDays: string[] = []
    for (let d = new Date(fromDate + 'T00:00:00'); d <= new Date(toDate + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
      allDays.push(d.toISOString().split('T')[0])
    }
    const groups = Array.from(new Set(scopedUsage.map(keyOf))).sort()

    const width = 900, height = 240, padL = 50, padR = 10, padT = 10, padB = 24
    const plotW = width - padL - padR, plotH = height - padT - padB
    const x = (i: number) => padL + (allDays.length <= 1 ? 0 : (i / (allDays.length - 1)) * plotW)

    const movingAvg = (daily: number[], window: number) => daily.map((_, idx) => {
      const slice = daily.slice(Math.max(0, idx - window + 1), idx + 1)
      return slice.reduce((s, v) => s + v, 0) / slice.length
    })

    const perGroup = groups.map((group, i) => {
      const byDay = new Map<string, number>()
      scopedUsage.filter(u => keyOf(u) === group).forEach(u => byDay.set(u.usage_date, (byDay.get(u.usage_date) || 0) + u.usage))
      const daily = allDays.map(d => byDay.get(d) ?? 0)
      return { group, color: PALETTE[i % PALETTE.length], values: movingAvg(daily, rollingWindow) }
    })

    const maxVal = Math.max(1, ...perGroup.flatMap(g => g.values))
    const y = (v: number) => padT + plotH - (v / maxVal) * plotH
    const series = perGroup.map(g => ({
      group: g.group,
      color: g.color,
      ...buildSeries(allDays, new Map(allDays.map((d, i) => [d, g.values[i]])), x, y),
    }))

    const tickCount = Math.min(6, allDays.length)
    const xTicks = Array.from({ length: tickCount }, (_, i) => {
      const idx = tickCount <= 1 ? 0 : Math.round((i / (tickCount - 1)) * (allDays.length - 1))
      const label = new Date(allDays[idx] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { x: x(idx), label }
    })

    const xPositions = allDays.map((_, i) => x(i))

    return { days: allDays, series, width, height, padL, padT, padB, plotH, plotW, maxVal, xTicks, xPositions }
  }, [scopedUsage, viewMode, fromDate, toDate, rollingWindow])

  const byPlant = new Map<string, SiloStock[]>()
  for (const s of silos) {
    if (!byPlant.has(s.plant)) byPlant.set(s.plant, [])
    byPlant.get(s.plant)!.push(s)
  }

  // Days of cover, by material at each plant (not per silo) — a material
  // is often split across several silos, and stock naturally shifts
  // between them without changing how much of that material the plant
  // actually has on hand overall. Same aggregate approach as the
  // Dashboard's Current Stock heatmap-adjacent badge.
  const usageSumBySilo = new Map<number, number>()
  for (const u of coverUsage) usageSumBySilo.set(u.silo_id, (usageSumBySilo.get(u.silo_id) || 0) + u.usage)
  const coverByMaterial = new Map<string, number | null>()
  for (const [plant, plantSilos] of byPlant) {
    const byMaterial = new Map<string, SiloStock[]>()
    for (const s of plantSilos) {
      const key = s.material || ''
      if (!byMaterial.has(key)) byMaterial.set(key, [])
      byMaterial.get(key)!.push(s)
    }
    for (const [material, matSilos] of byMaterial) {
      const stock = matSilos.reduce((sum, s) => sum + s.current_stock, 0)
      const avgDailyUsage = matSilos.reduce((sum, s) => sum + (usageSumBySilo.get(s.silo_id) || 0) / 14, 0)
      coverByMaterial.set(`${plant}::${material}`, avgDailyUsage > 0 ? stock / avgDailyUsage : null)
    }
  }
  function daysOfCoverFor(s: SiloStock) { return coverByMaterial.get(`${s.plant}::${s.material || ''}`) ?? null }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold flex items-center gap-2"><Factory className="w-7 h-7 text-blue-600" /> Production Planning</h1>

      {/* Usage Trend Chart */}
      <div className="bg-white border rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2"><LineChart className="w-5 h-5 text-blue-600" /> Material Usage Trends</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs" />
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(['all', 'plant', 'material'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${viewMode === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {mode === 'all' ? 'See All' : mode === 'plant' ? 'By Plant' : 'By Material'}
                </button>
              ))}
            </div>
            {viewMode === 'plant' && (
              <select value={pickedPlant} onChange={e => setPickedPlant(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs bg-white">
                {availablePlants.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {viewMode === 'material' && (
              <select value={pickedMaterial} onChange={e => setPickedMaterial(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs bg-white">
                {availableMaterials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          {viewMode === 'all' ? 'Every plant + material combination.' : viewMode === 'plant' ? `Materials used at ${pickedPlant || '—'}.` : `Plants using ${pickedMaterial || '—'}.`}
          {' '}Hover the chart for exact values. Days with no usage recorded are left off the axis.
        </p>
        <div className="overflow-x-auto">
          <div className="relative min-w-[700px]">
            <svg
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              className="w-full h-64"
              onMouseMove={e => setHoverIdx(hoverIndexFromEvent(e, chart.width, chart.padL, chart.plotW, chart.days.length))}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {[0, 0.25, 0.5, 0.75, 1].map(f => {
                const val = chart.maxVal * f
                const yy = chart.padT + chart.plotH - f * chart.plotH
                return (
                  <g key={f}>
                    <line x1={chart.padL} y1={yy} x2={chart.width - 10} y2={yy} stroke="#e2e8f0" strokeDasharray="4 4" />
                    <text x={chart.padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{val.toFixed(0)}</text>
                  </g>
                )
              })}
              {hoverIdx !== null && (
                <line x1={chart.xPositions[hoverIdx]} x2={chart.xPositions[hoverIdx]} y1={chart.padT} y2={chart.height - chart.padB} stroke="#94a3b8" strokeDasharray="3 3" />
              )}
              {chart.series.map(s => (
                <g key={s.combo}>
                  <path d={s.d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  {s.points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={hoverIdx !== null && chart.days[hoverIdx] === p.day ? 4.5 : 3} fill={s.color} />
                  ))}
                </g>
              ))}
              {chart.xTicks.map((t, i) => (
                <text key={i} x={t.x} y={chart.height - chart.padB + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">{t.label}</text>
              ))}
            </svg>
            {hoverIdx !== null && (() => {
              const day = chart.days[hoverIdx]
              const rows = chart.series.map(s => ({ ...s, point: s.points.find(p => p.day === day) })).filter(s => s.point)
              if (rows.length === 0) return null
              const leftPct = Math.min(92, Math.max(8, (chart.xPositions[hoverIdx] / chart.width) * 100))
              return (
                <div
                  className="absolute top-2 -translate-x-1/2 bg-slate-900 text-white text-xs rounded-lg shadow-lg px-3 py-2 pointer-events-none z-10 max-w-[220px]"
                  style={{ left: `${leftPct}%` }}
                >
                  <div className="font-semibold mb-1">{new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  <div className="space-y-0.5">
                    {rows.map(r => (
                      <div key={r.combo} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-slate-300 truncate">
                          <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: r.color }} />
                          {r.combo}
                        </span>
                        <span className="font-semibold flex-shrink-0">{r.point!.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs">
          {chart.series.map(s => (
            <span key={s.combo} className="flex items-center gap-1.5 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
              {s.combo}
            </span>
          ))}
          {chart.series.length === 0 && <span className="text-gray-400">No usage recorded in this range.</span>}
        </div>
      </div>

      {/* Rolling Average */}
      {rollingChart && rollingChart.series.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <h2 className="text-lg font-bold">Usage Rolling Average</h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {([7, 14] as RollingWindow[]).map(w => (
                <button
                  key={w}
                  onClick={() => setRollingWindow(w)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${rollingWindow === w ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {w}-Day
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-2">Same plant/material scope as the chart above. Hover for exact values.</p>
          <div className="overflow-x-auto">
            <div className="relative min-w-[700px]">
              <svg
                viewBox={`0 0 ${rollingChart.width} ${rollingChart.height}`}
                className="w-full h-56"
                onMouseMove={e => setRollingHoverIdx(hoverIndexFromEvent(e, rollingChart.width, rollingChart.padL, rollingChart.plotW, rollingChart.days.length))}
                onMouseLeave={() => setRollingHoverIdx(null)}
              >
                {[0, 0.25, 0.5, 0.75, 1].map(f => {
                  const val = rollingChart.maxVal * f
                  const yy = rollingChart.padT + rollingChart.plotH - f * rollingChart.plotH
                  return (
                    <g key={f}>
                      <line x1={rollingChart.padL} y1={yy} x2={rollingChart.width - 10} y2={yy} stroke="#e2e8f0" strokeDasharray="4 4" />
                      <text x={rollingChart.padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{val.toFixed(1)}</text>
                    </g>
                  )
                })}
                {rollingHoverIdx !== null && (
                  <line x1={rollingChart.xPositions[rollingHoverIdx]} x2={rollingChart.xPositions[rollingHoverIdx]} y1={rollingChart.padT} y2={rollingChart.height - rollingChart.padB} stroke="#94a3b8" strokeDasharray="3 3" />
                )}
                {rollingChart.series.map(s => (
                  <g key={s.group}>
                    <path d={s.d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    {s.points.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={rollingHoverIdx !== null && rollingChart.days[rollingHoverIdx] === p.day ? 4.5 : 2.5} fill={s.color} />
                    ))}
                  </g>
                ))}
                {rollingChart.xTicks.map((t, i) => (
                  <text key={i} x={t.x} y={rollingChart.height - rollingChart.padB + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">{t.label}</text>
                ))}
              </svg>
              {rollingHoverIdx !== null && (() => {
                const day = rollingChart.days[rollingHoverIdx]
                const rows = rollingChart.series.map(s => ({ ...s, point: s.points.find(p => p.day === day) })).filter(s => s.point)
                if (rows.length === 0) return null
                const leftPct = Math.min(92, Math.max(8, (rollingChart.xPositions[rollingHoverIdx] / rollingChart.width) * 100))
                return (
                  <div
                    className="absolute top-2 -translate-x-1/2 bg-slate-900 text-white text-xs rounded-lg shadow-lg px-3 py-2 pointer-events-none z-10 max-w-[220px]"
                    style={{ left: `${leftPct}%` }}
                  >
                    <div className="font-semibold mb-1">{rollingWindow}-day avg — {new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    <div className="space-y-0.5">
                      {rows.map(r => (
                        <div key={r.group} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-slate-300 truncate">
                            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: r.color }} />
                            {r.group}
                          </span>
                          <span className="font-semibold flex-shrink-0">{r.point!.value.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs">
            {rollingChart.series.map(s => (
              <span key={s.group} className="flex items-center gap-1.5 text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                {s.group}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Batching Capacity (Compact View) */}
      <div className="bg-white border rounded-xl shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Factory className="w-5 h-5 text-blue-600" />
              <span>Batching Capacity</span>
              <span className="text-xs font-normal text-slate-500 hidden sm:inline">(Based on Current Stock)</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Estimated concrete production potential from stored cementitious materials</p>
          </div>
          <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2.5 py-1 rounded-full">
            {silos.length} Silos Monitored
          </span>
        </div>

        {silos.length === 0 ? (
          <p className="text-gray-400 py-6 text-center text-sm">No silos found.</p>
        ) : (
          <div className="space-y-4">
            {Array.from(byPlant.entries()).map(([plant, plantSilos]) => (
              <div key={plant} className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3 sm:p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    {plant}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">{plantSilos.length} Silos</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {plantSilos.map(s => {
                    const capacity = s.capacity || 100
                    const percent = Math.min((s.current_stock / capacity) * 100, 100)
                    const fillClass = percent < 15 ? 'bg-red-500' : percent < 30 ? 'bg-amber-400' : 'bg-emerald-500'
                    const mat = materials.find(m => m.name === s.material)
                    const req = mat?.batching_req || 0
                    const cover = daysOfCoverFor(s)
                    const capacityM3 = req > 0 && s.current_stock > 0 ? Math.floor(s.current_stock / req) : null

                    return (
                      <div key={s.silo_id} className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-xs hover:border-slate-300 transition">
                        {/* Header: Silo name & Material */}
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-bold text-slate-800 truncate" title={s.silo}>{s.silo}</span>
                          <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded truncate max-w-[110px]" title={s.material || 'Unassigned'}>
                            {s.material || '—'}
                          </span>
                        </div>

                        {/* Stock & Progress bar */}
                        <div className="flex items-baseline justify-between text-xs mb-1">
                          <span className="font-extrabold text-slate-900 text-sm">
                            {s.current_stock.toFixed(0)} <span className="text-[10px] font-normal text-slate-400">MT</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{percent.toFixed(0)}%</span>
                        </div>

                        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2 overflow-hidden">
                          <div className={`h-1.5 rounded-full ${fillClass}`} style={{ width: `${Math.max(percent, 2)}%` }} />
                        </div>

                        {/* Compact Footer: Days of Cover & Capacity */}
                        <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-slate-100 text-[11px]">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold truncate ${
                              cover == null ? 'bg-gray-100 text-gray-400'
                                : cover < 3 ? 'bg-red-100 text-red-700'
                                : cover < 7 ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                            title="Days of cover based on 14-day average usage"
                          >
                            {cover == null ? 'No usage' : `${cover.toFixed(1)}d cover`}
                          </span>

                          <span className="font-bold text-emerald-700 truncate" title="Production capacity in m³">
                            {capacityM3 !== null ? `${capacityM3.toLocaleString()} m³` : <span className="text-gray-400 font-normal text-[10px]">No req</span>}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Batching Settings (Default Collapsed) */}
      <div className="bg-white border rounded-xl shadow-sm p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setSettingsCollapsed(c => !c)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">Batching Settings</h2>
                <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full">
                  {materials.length} Materials
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Set Required Kg per 1m³ of concrete</p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition">
            {settingsCollapsed ? 'Expand' : 'Collapse'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${settingsCollapsed ? '' : 'rotate-180'}`} />
          </span>
        </button>

        {!settingsCollapsed && (
          <div className="mt-4 pt-3 border-t">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase border-b bg-gray-50">
                    <th className="py-2.5 px-3">Material</th>
                    <th className="py-2.5 px-3">Kg / m³</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {materials.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-medium text-slate-800">{m.name}</td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number" step="0.1" min="0"
                          value={reqInputs[m.id] ?? ''}
                          onChange={e => setReqInputs({ ...reqInputs, [m.id]: e.target.value })}
                          className="w-24 border rounded-md px-2.5 py-1 text-sm bg-white"
                          placeholder="e.g. 350"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => saveRequirement(m.id)}
                          className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 cursor-pointer"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                  {materials.length === 0 && (
                    <tr><td colSpan={3} className="py-4 text-center text-xs text-gray-400">No active materials defined.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
