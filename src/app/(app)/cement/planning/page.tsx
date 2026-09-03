'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LineChart, Factory } from 'lucide-react'

type SiloStock = { silo_id: number; silo: string; plant: string; material: string | null; capacity: number | null; current_stock: number }
type Material = { id: number; name: string; batching_req: number | null }
type UsageRow = { usage_date: string; usage: number; plant: string; material: string }

const PALETTE = ['#2563eb', '#dc2626', '#059669', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#be123c', '#0d9488', '#8b5cf6']

type ViewMode = 'all' | 'plant' | 'material'

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

  useEffect(() => { loadStatic() }, [])
  useEffect(() => { loadUsage() }, [fromDate, toDate])

  async function loadStatic() {
    const [{ data: stockRows }, { data: matRows }] = await Promise.all([
      supabase.rpc('cement_silo_stock'),
      supabase.from('cement_materials').select('id, name, batching_req').eq('is_active', true).order('name'),
    ])
    setSilos((stockRows || []).map((s: any) => ({ ...s, current_stock: Number(s.current_stock) })))
    setMaterials(matRows || [])
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

    return { days, series, width, height, padL, padT, padB, plotH, maxVal, xTicks }
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
      return { group, color: PALETTE[i % PALETTE.length], ma7: movingAvg(daily, 7), ma14: movingAvg(daily, 14) }
    })

    const maxVal = Math.max(1, ...perGroup.flatMap(g => [...g.ma7, ...g.ma14]))
    const y = (v: number) => padT + plotH - (v / maxVal) * plotH
    const toSeries = (values: number[]) => buildSeries(allDays, new Map(allDays.map((d, i) => [d, values[i]])), x, y)

    const series = perGroup.map(g => ({ group: g.group, color: g.color, ma7: toSeries(g.ma7), ma14: toSeries(g.ma14) }))

    const tickCount = Math.min(6, allDays.length)
    const xTicks = Array.from({ length: tickCount }, (_, i) => {
      const idx = tickCount <= 1 ? 0 : Math.round((i / (tickCount - 1)) * (allDays.length - 1))
      const label = new Date(allDays[idx] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { x: x(idx), label }
    })

    return { series, width, height, padL, padT, padB, plotH, xTicks }
  }, [scopedUsage, viewMode, fromDate, toDate])

  const byPlant = new Map<string, SiloStock[]>()
  for (const s of silos) {
    if (!byPlant.has(s.plant)) byPlant.set(s.plant, [])
    byPlant.get(s.plant)!.push(s)
  }

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
          {' '}Hover a point for its exact value. Days with no usage recorded are left off the axis.
        </p>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full h-64 min-w-[700px]">
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
            {chart.series.map(s => (
              <g key={s.combo}>
                <path d={s.d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {s.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3} fill={s.color} className="cursor-pointer">
                    <title>{`${s.combo} — ${new Date(p.day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${p.value.toLocaleString()}`}</title>
                  </circle>
                ))}
              </g>
            ))}
            {chart.xTicks.map((t, i) => (
              <text key={i} x={t.x} y={chart.height - chart.padB + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">{t.label}</text>
            ))}
          </svg>
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
          <h2 className="text-lg font-bold mb-1">Usage Rolling Average (7 &amp; 14 Day)</h2>
          <p className="text-xs text-gray-400 mb-2">Solid = 7-day average, dashed = 14-day average. Same plant/material scope as the chart above.</p>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${rollingChart.width} ${rollingChart.height}`} className="w-full h-56 min-w-[700px]">
              {rollingChart.series.map(s => (
                <g key={s.group}>
                  <path d={s.ma14.d} fill="none" stroke={s.color} strokeWidth={1.5} strokeDasharray="5 5" opacity={0.6} />
                  <path d={s.ma7.d} fill="none" stroke={s.color} strokeWidth={2.5} />
                  {s.ma7.points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={s.color}>
                      <title>{`${s.group} — 7d avg on ${new Date(p.day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${p.value.toFixed(1)}`}</title>
                    </circle>
                  ))}
                </g>
              ))}
              {rollingChart.xTicks.map((t, i) => (
                <text key={i} x={t.x} y={rollingChart.height - rollingChart.padB + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">{t.label}</text>
              ))}
            </svg>
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

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        {/* Batching Capacity */}
        <div className="bg-white border rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold mb-4">Batching Capacity (Based on Stock)</h2>
          {silos.length === 0 ? (
            <p className="text-gray-400">No silos found.</p>
          ) : (
            <div className="space-y-6">
              {Array.from(byPlant.entries()).map(([plant, plantSilos]) => (
                <div key={plant}>
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">{plant}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {plantSilos.map(s => {
                      const capacity = s.capacity || 100
                      const percent = Math.min((s.current_stock / capacity) * 100, 100)
                      const fillClass = percent < 15 ? 'bg-red-500' : percent < 30 ? 'bg-amber-400' : 'bg-green-500'
                      const mat = materials.find(m => m.name === s.material)
                      const req = mat?.batching_req || 0
                      return (
                        <div key={s.silo_id} className="border rounded-xl p-3 flex flex-col items-center text-center">
                          <div className="text-xs font-bold text-slate-700 uppercase truncate w-full">{s.silo}</div>
                          <div className="text-xs text-gray-400 mb-2 truncate w-full">{s.material || '—'}</div>
                          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                            <div className={`h-2 rounded-full ${fillClass}`} style={{ width: `${Math.max(percent, 2)}%` }} />
                          </div>
                          <div className="text-lg font-bold text-slate-900">{s.current_stock.toFixed(0)}</div>
                          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5 w-full">
                            {req > 0 && s.current_stock > 0 ? (
                              <>
                                <div className="text-sm font-extrabold text-emerald-700">{Math.floor(s.current_stock / req).toLocaleString()} m³</div>
                                <div className="text-[10px] text-emerald-600 uppercase tracking-wide">Production Capacity</div>
                              </>
                            ) : (
                              <div className="text-[11px] text-gray-400">{mat ? 'Set Kg/m³ req first' : 'Setup Req.'}</div>
                            )}
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

        {/* Batching Settings */}
        <div className="bg-white border rounded-xl shadow-sm p-6 h-fit">
          <h2 className="text-lg font-bold mb-1">Batching Settings</h2>
          <p className="text-xs text-gray-500 mb-4">Set Required Kg per 1m³ of concrete.</p>
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase border-b">
                <th className="py-2">Material</th>
                <th className="py-2">Kg / m³</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {materials.map(m => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-2 pr-2 text-sm font-medium">{m.name}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="number" step="0.1" min="0"
                      value={reqInputs[m.id] ?? ''}
                      onChange={e => setReqInputs({ ...reqInputs, [m.id]: e.target.value })}
                      className="w-20 border rounded-md px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="py-2">
                    <button onClick={() => saveRequirement(m.id)} className="bg-blue-600 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-blue-700">Save</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
