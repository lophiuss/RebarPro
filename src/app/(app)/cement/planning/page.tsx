'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LineChart, Factory } from 'lucide-react'

type SiloStock = { silo_id: number; silo: string; plant: string; material: string | null; capacity: number | null; current_stock: number }
type Material = { id: number; name: string; batching_req: number | null }
type UsageRow = { usage_date: string; usage: number; plant: string; material: string }

const PALETTE = ['#2563eb', '#dc2626', '#059669', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#be123c', '#0d9488', '#8b5cf6']

type ViewMode = 'all' | 'plant' | 'material'

export default function PlanningPage() {
  const supabase = createClient()
  const [silos, setSilos] = useState<SiloStock[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [reqInputs, setReqInputs] = useState<Record<number, string>>({})
  const [viewMode, setViewMode] = useState<ViewMode>('all')

  useEffect(() => { load() }, [])

  async function load() {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

    const [{ data: stockRows }, { data: matRows }, { data: usageRows }] = await Promise.all([
      supabase.rpc('cement_silo_stock'),
      supabase.from('cement_materials').select('id, name, batching_req').eq('is_active', true).order('name'),
      supabase.from('cement_daily_usage')
        .select('usage_date, usage, cement_silos(name, cement_plants(name), cement_silo_materials(cement_materials(name)))')
        .gte('usage_date', cutoff),
    ])

    setSilos((stockRows || []).map((s: any) => ({ ...s, current_stock: Number(s.current_stock) })))
    setMaterials(matRows || [])
    const reqs: Record<number, string> = {}
    ;(matRows || []).forEach((m: any) => { reqs[m.id] = String(m.batching_req ?? 0) })
    setReqInputs(reqs)

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

  // --- Chart: daily usage, last 30 days. viewMode groups lines by combo / plant / material ---
  const chart = useMemo(() => {
    const days: string[] = []
    for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().split('T')[0])

    const keyOf = (u: UsageRow) => viewMode === 'plant' ? u.plant : viewMode === 'material' ? u.material : `${u.plant} - ${u.material}`
    const groups = Array.from(new Set(usage.map(keyOf))).sort()
    const series = groups.map((group, i) => {
      const data = days.map(d => usage.filter(u => u.usage_date === d && keyOf(u) === group).reduce((s, u) => s + u.usage, 0))
      return { combo: group, color: PALETTE[i % PALETTE.length], data }
    })
    const maxVal = Math.max(1, ...series.flatMap(s => s.data))

    const width = 900, height = 260, padL = 50, padR = 10, padT = 10, padB = 24
    const plotW = width - padL - padR, plotH = height - padT - padB
    const x = (i: number) => padL + (days.length <= 1 ? 0 : (i / (days.length - 1)) * plotW)
    const y = (v: number) => padT + plotH - (v / maxVal) * plotH

    const paths = series.map(s => ({
      ...s,
      d: s.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' '),
    }))

    // A handful of evenly-spaced date labels along the x-axis, rather than all 30.
    const tickCount = Math.min(6, days.length)
    const xTicks = Array.from({ length: tickCount }, (_, i) => {
      const idx = tickCount <= 1 ? 0 : Math.round((i / (tickCount - 1)) * (days.length - 1))
      const label = new Date(days[idx] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { x: x(idx), label }
    })

    return { days, series: paths, width, height, padL, padT, padB, plotH, maxVal, xTicks }
  }, [usage, viewMode])

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
          <h2 className="text-lg font-bold flex items-center gap-2"><LineChart className="w-5 h-5 text-blue-600" /> Material Usage Trends (Last 30 Days)</h2>
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
        </div>
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
              <path key={s.combo} d={s.d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
          {chart.series.length === 0 && <span className="text-gray-400">No usage recorded in the last 30 days.</span>}
        </div>
      </div>

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
