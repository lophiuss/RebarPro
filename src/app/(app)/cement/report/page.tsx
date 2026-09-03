'use client'

import { Fragment, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, Download } from 'lucide-react'

type Row = {
  report_date?: string
  report_month?: string
  plant_name: string
  silo_id: number
  silo_name: string
  material_name: string | null
  unit_name: string | null
  incoming: number
  usage: number
  transfer_in?: number
  transfer_out?: number
  actual_stock: number | null
  yesterday_actual: number | null
  theoretical: number | null
  variance: number | null
  variance_pct: number | null
  status?: string
}

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return '-'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const MAX_ROWS = 200
const CHART_PALETTE = ['#2563eb', '#dc2626', '#059669', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d']
type ChartViewMode = 'all' | 'plant' | 'material'

// Turns a mousemove on the chart's <svg> into the nearest period index, so
// the caller can show a tooltip that follows the cursor.
function hoverIndexFromEvent(e: MouseEvent<SVGSVGElement>, viewBoxWidth: number, padL: number, plotW: number, count: number) {
  const svg = e.currentTarget
  const ratio = e.nativeEvent.offsetX / svg.clientWidth
  const svgX = ratio * viewBoxWidth
  const idx = Math.round(((svgX - padL) / plotW) * (count - 1))
  return Math.max(0, Math.min(count - 1, idx))
}

export default function ReportPage() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const [from, setFrom] = useState(weekAgo)
  const [to, setTo] = useState(today)
  const [type, setType] = useState<'daily' | 'monthly'>('daily')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [plantFilter, setPlantFilter] = useState('')
  const [siloFilter, setSiloFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('all')
  const [chartPlant, setChartPlant] = useState('')
  const [chartMaterial, setChartMaterial] = useState('')
  const [chartHoverIdx, setChartHoverIdx] = useState<number | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const fn = type === 'monthly' ? 'cement_monthly_report' : 'cement_daily_report'
    const { data, error } = await supabase.rpc(fn, { from_date: from, to_date: to })
    if (error) { alert('Error loading report: ' + error.message); setLoading(false); return }
    setRows(data || [])
    setLoading(false)
  }

  const plants = useMemo(() => Array.from(new Set(rows.map(r => r.plant_name))).sort(), [rows])
  const silos = useMemo(() => Array.from(new Set(rows.filter(r => !plantFilter || r.plant_name === plantFilter).map(r => r.silo_name))).sort(), [rows, plantFilter])
  const materials = useMemo(() => Array.from(new Set(rows.filter(r => (!plantFilter || r.plant_name === plantFilter) && (!siloFilter || r.silo_name === siloFilter)).map(r => r.material_name).filter(Boolean))).sort() as string[], [rows, plantFilter, siloFilter])

  const filtered = rows.filter(r =>
    (!plantFilter || r.plant_name === plantFilter) &&
    (!siloFilter || r.silo_name === siloFilter) &&
    (!materialFilter || r.material_name === materialFilter)
  )

  const totals = filtered.reduce((acc, r) => ({
    incoming: acc.incoming + (r.incoming || 0),
    usage: acc.usage + (r.usage || 0),
    variance: acc.variance + (r.variance || 0),
  }), { incoming: 0, usage: 0, variance: 0 })

  const limited = filtered.slice(0, MAX_ROWS)

  const chartPlants = useMemo(() => Array.from(new Set(filtered.map(r => r.plant_name))).sort(), [filtered])
  const chartMaterials = useMemo(() => Array.from(new Set(filtered.map(r => r.material_name).filter(Boolean))).sort() as string[], [filtered])
  useEffect(() => {
    if (chartViewMode === 'plant' && !chartPlants.includes(chartPlant)) setChartPlant(chartPlants[0] || '')
    if (chartViewMode === 'material' && !chartMaterials.includes(chartMaterial)) setChartMaterial(chartMaterials[0] || '')
  }, [chartViewMode, chartPlants, chartMaterials])

  // --- Theoretical vs Actual trend chart. "All" aggregates everything into
  // one pair of lines; "By Plant"/"By Material" narrow to one specific plant
  // or material (picked below) and break that one down by the other
  // dimension, rather than aggregating across all of them. ---
  const chart = useMemo(() => {
    const scoped = chartViewMode === 'plant' && chartPlant ? filtered.filter(r => r.plant_name === chartPlant)
      : chartViewMode === 'material' && chartMaterial ? filtered.filter(r => r.material_name === chartMaterial)
      : filtered
    const groupOf = (r: Row) => chartViewMode === 'plant' ? (r.material_name || 'Unknown') : chartViewMode === 'material' ? (r.plant_name || 'Unknown') : '__all__'

    const byGroup = new Map<string, Map<string, { theoretical: number; actual: number }>>()
    scoped.forEach(r => {
      const g = groupOf(r)
      if (!byGroup.has(g)) byGroup.set(g, new Map())
      const byPeriod = byGroup.get(g)!
      const key = r.report_date || r.report_month || ''
      const cur = byPeriod.get(key) || { theoretical: 0, actual: 0 }
      cur.theoretical += r.theoretical || 0
      cur.actual += r.actual_stock || 0
      byPeriod.set(key, cur)
    })

    const periods = Array.from(new Set(scoped.map(r => r.report_date || r.report_month || ''))).sort()
    const groups = Array.from(byGroup.keys()).sort()
    const maxVal = Math.max(1, ...groups.flatMap(g => periods.map(p => {
      const d = byGroup.get(g)!.get(p)
      return d ? Math.max(d.theoretical, d.actual) : 0
    })))

    const width = 900, height = 240, padL = 55, padR = 10, padT = 10, padB = 24
    const plotW = width - padL - padR, plotH = height - padT - padB
    const x = (i: number) => padL + (periods.length <= 1 ? 0 : (i / (periods.length - 1)) * plotW)
    const y = (v: number) => padT + plotH - (v / maxVal) * plotH
    const toPath = (data: number[]) => data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
    const toPoints = (data: number[]) => data.map((v, i) => ({ x: x(i), y: y(v), period: periods[i], value: v }))

    const series = groups.map((g, i) => {
      const byPeriod = byGroup.get(g)!
      const actData = periods.map(p => byPeriod.get(p)?.actual ?? 0)
      const theoData = periods.map(p => byPeriod.get(p)?.theoretical ?? 0)
      return {
        group: g,
        color: chartViewMode === 'all' ? '#2563eb' : CHART_PALETTE[i % CHART_PALETTE.length],
        theoPath: toPath(theoData),
        actPath: toPath(actData),
        actPoints: toPoints(actData),
        theoPoints: toPoints(theoData),
      }
    })

    // A handful of evenly-spaced period labels along the x-axis.
    const tickCount = Math.min(8, periods.length)
    const xTicks = Array.from({ length: tickCount }, (_, i) => {
      const idx = tickCount <= 1 ? 0 : Math.round((i / (tickCount - 1)) * (periods.length - 1))
      const raw = periods[idx]
      const label = type === 'monthly' ? raw : new Date(raw + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { x: x(idx), label }
    })

    const xPositions = periods.map((_, i) => x(i))

    return { periods, series, width, height, padL, padT, padB, plotH, plotW, maxVal, xTicks, xPositions }
  }, [filtered, chartViewMode, type])

  // --- Material Summary (Global) ---
  const materialSummary = useMemo(() => {
    const map = new Map<string, { incoming: number; usage: number; unit: string }>()
    filtered.forEach(r => {
      const key = r.material_name || 'Unknown'
      const cur = map.get(key) || { incoming: 0, usage: 0, unit: r.unit_name || '' }
      cur.incoming += r.incoming || 0
      cur.usage += r.usage || 0
      map.set(key, cur)
    })
    return Array.from(map.entries()).map(([material, v]) => ({ material, ...v }))
  }, [filtered])

  // --- Summary by Plant & Material (opening / incoming / usage / last closing / variance) ---
  const byPlantMaterial = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => (a.report_date || a.report_month || '').localeCompare(b.report_date || b.report_month || ''))
    const map = new Map<string, { plant: string; material: string; unit: string; opening: number; incoming: number; usage: number; variance: number; theoretical: number; lastClosing: number | null }>()
    const openingCaptured = new Set<string>()
    const lastClosingBySilo = new Map<number, { key: string; value: number }>()

    sorted.forEach(r => {
      const plant = r.plant_name || 'Unknown'
      const material = r.material_name || 'Unknown'
      const key = `${plant}||${material}`
      if (!map.has(key)) map.set(key, { plant, material, unit: r.unit_name || '', opening: 0, incoming: 0, usage: 0, variance: 0, theoretical: 0, lastClosing: null })
      const entry = map.get(key)!

      const siloKey = `${key}||${r.silo_id}`
      if (r.silo_id && !openingCaptured.has(siloKey)) {
        entry.opening += r.yesterday_actual || 0
        openingCaptured.add(siloKey)
      }
      entry.incoming += r.incoming || 0
      entry.usage += r.usage || 0
      entry.variance += r.variance || 0
      entry.theoretical += r.theoretical || 0

      if (r.silo_id && r.actual_stock !== null && r.actual_stock !== undefined) {
        lastClosingBySilo.set(r.silo_id, { key, value: r.actual_stock })
      }
    })

    lastClosingBySilo.forEach(({ key, value }) => {
      const entry = map.get(key)
      if (entry) entry.lastClosing = (entry.lastClosing ?? 0) + value
    })

    type Entry = { plant: string; material: string; unit: string; opening: number; incoming: number; usage: number; variance: number; theoretical: number; lastClosing: number | null }
    const byPlant = new Map<string, Entry[]>()
    map.forEach(entry => {
      if (!byPlant.has(entry.plant)) byPlant.set(entry.plant, [])
      byPlant.get(entry.plant)!.push(entry)
    })
    return byPlant
  }, [filtered])

  // --- Material Variance by Month pivot ---
  const varianceByMonth = useMemo(() => {
    const pivot = new Map<string, Map<string, Map<string, { variance: number; theoretical: number }>>>()
    const months = new Set<string>()
    filtered.forEach(r => {
      const month = r.report_month || (r.report_date ? r.report_date.slice(0, 7) : 'Unknown')
      months.add(month)
      const plant = r.plant_name || 'Unknown'
      const material = r.material_name || 'Unknown'
      if (!pivot.has(plant)) pivot.set(plant, new Map())
      const byMat = pivot.get(plant)!
      if (!byMat.has(material)) byMat.set(material, new Map())
      const byMonth = byMat.get(material)!
      const cur = byMonth.get(month) || { variance: 0, theoretical: 0 }
      cur.variance += r.variance || 0
      cur.theoretical += r.theoretical || 0
      byMonth.set(month, cur)
    })
    return { pivot, months: Array.from(months).sort() }
  }, [filtered])

  function exportCSV() {
    const headers = ['Date/Month', 'Plant', 'Silo', 'Material', 'Unit', 'Incoming', 'Transfer In', 'Transfer Out', 'Theoretical', 'Actual Closing', 'Usage', 'Variance', 'Variance %']
    const csvRows = filtered.map(r => [
      r.report_date || r.report_month, r.plant_name, r.silo_name, r.material_name || '', r.unit_name || '',
      r.incoming, r.transfer_in || 0, r.transfer_out || 0, r.theoretical ?? '', r.actual_stock ?? '', r.usage,
      r.variance ?? '', r.variance_pct !== null && r.variance_pct !== undefined ? r.variance_pct.toFixed(2) + '%' : '-'
    ])
    const csv = [headers, ...csvRows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cement_${type}_report_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><BarChart3 className="w-7 h-7 text-blue-600" /> Report</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border-l-4 border-blue-600 border rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Total Incoming</div>
          <div className="text-2xl font-extrabold">{fmt(totals.incoming)}</div>
        </div>
        <div className="bg-white border-l-4 border-amber-500 border rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Total Usage</div>
          <div className="text-2xl font-extrabold">{fmt(totals.usage)}</div>
        </div>
        <div className={`bg-white border-l-4 border rounded-xl p-5 shadow-sm ${totals.variance > 0 ? 'border-red-500' : totals.variance < 0 ? 'border-green-500' : 'border-gray-400'}`}>
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Total Variance</div>
          <div className="text-2xl font-extrabold">{fmt(totals.variance)}</div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-bold mb-4">⚙️ Configuration</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Report Type</label>
            <select value={type} onChange={e => setType(e.target.value as 'daily' | 'monthly')} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
              <option value="daily">Daily Transaction</option>
              <option value="monthly">Monthly Summary</option>
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Plant</label>
            <select value={plantFilter} onChange={e => { setPlantFilter(e.target.value); setSiloFilter(''); setMaterialFilter('') }} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
              <option value="">All Plants</option>
              {plants.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Silo</label>
            <select value={siloFilter} onChange={e => { setSiloFilter(e.target.value); setMaterialFilter('') }} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
              <option value="">All Silos</option>
              {silos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
            <select value={materialFilter} onChange={e => setMaterialFilter(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
              <option value="">All Materials</option>
              {materials.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button onClick={exportCSV} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200"><Download className="w-4 h-4" /> Export CSV</button>
          <button onClick={load} disabled={loading} className="bg-blue-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700">{loading ? 'Loading...' : '↻ Load Report'}</button>
        </div>
      </div>

      {chart.periods.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h3 className="font-bold text-sm">Theoretical vs Actual Trend</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(['all', 'plant', 'material'] as ChartViewMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setChartViewMode(mode)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${chartViewMode === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {mode === 'all' ? 'See All' : mode === 'plant' ? 'By Plant' : 'By Material'}
                  </button>
                ))}
              </div>
              {chartViewMode === 'plant' && (
                <select value={chartPlant} onChange={e => setChartPlant(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs bg-white">
                  {chartPlants.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              {chartViewMode === 'material' && (
                <select value={chartMaterial} onChange={e => setChartMaterial(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs bg-white">
                  {chartMaterials.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            {chartViewMode === 'all' ? 'Totals across the current filters.' : chartViewMode === 'plant' ? `Materials at ${chartPlant || '—'}.` : `Plants using ${chartMaterial || '—'}.`}
            {' '}Hover the chart for exact values.
          </p>
          <div className="overflow-x-auto">
            <div className="relative min-w-[700px]">
              <svg
                viewBox={`0 0 ${chart.width} ${chart.height}`}
                className="w-full h-56"
                onMouseMove={e => setChartHoverIdx(hoverIndexFromEvent(e, chart.width, chart.padL, chart.plotW, chart.periods.length))}
                onMouseLeave={() => setChartHoverIdx(null)}
              >
                {[0, 0.25, 0.5, 0.75, 1].map(f => {
                  const val = chart.maxVal * f
                  const yy = chart.padT + chart.plotH - f * chart.plotH
                  return (
                    <g key={f}>
                      <line x1={chart.padL} y1={yy} x2={chart.width - 10} y2={yy} stroke="#e2e8f0" strokeDasharray="4 4" />
                      <text x={chart.padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmt(val)}</text>
                    </g>
                  )
                })}
                {chartHoverIdx !== null && (
                  <line x1={chart.xPositions[chartHoverIdx]} x2={chart.xPositions[chartHoverIdx]} y1={chart.padT} y2={chart.height - chart.padB} stroke="#94a3b8" strokeDasharray="3 3" />
                )}
                {chart.series.map(s => (
                  <Fragment key={s.group}>
                    <path d={s.theoPath} fill="none" stroke={s.color} strokeWidth={1.5} strokeDasharray="5 5" opacity={0.55} />
                    <path d={s.actPath} fill="none" stroke={s.color} strokeWidth={2.5} />
                    {s.actPoints.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={chartHoverIdx !== null && chart.periods[chartHoverIdx] === p.period ? 4.5 : 3} fill={s.color} />
                    ))}
                  </Fragment>
                ))}
                {chart.xTicks.map((t, i) => (
                  <text key={i} x={t.x} y={chart.height - chart.padB + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">{t.label}</text>
                ))}
              </svg>
              {chartHoverIdx !== null && (() => {
                const period = chart.periods[chartHoverIdx]
                const rows = chart.series
                  .map(s => ({ ...s, act: s.actPoints.find(p => p.period === period), theo: s.theoPoints.find(p => p.period === period) }))
                  .filter(s => s.act || s.theo)
                if (rows.length === 0) return null
                const leftPct = Math.min(92, Math.max(8, (chart.xPositions[chartHoverIdx] / chart.width) * 100))
                return (
                  <div
                    className="absolute top-2 -translate-x-1/2 bg-slate-900 text-white text-xs rounded-lg shadow-lg px-3 py-2 pointer-events-none z-10 max-w-[240px]"
                    style={{ left: `${leftPct}%` }}
                  >
                    <div className="font-semibold mb-1">{period}</div>
                    <div className="space-y-1">
                      {rows.map(r => (
                        <div key={r.group}>
                          {chartViewMode !== 'all' && (
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: r.color }} />
                              {r.group}
                            </div>
                          )}
                          <div className="flex justify-between gap-3"><span className="text-slate-300">Actual</span><span className="font-semibold">{r.act ? fmt(r.act.value) : '-'}</span></div>
                          <div className="flex justify-between gap-3"><span className="text-slate-300">Theoretical</span><span className="font-semibold">{r.theo ? fmt(r.theo.value) : '-'}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
          {chartViewMode === 'all' ? (
            <div className="flex gap-4 mt-2 text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-gray-400 inline-block" /> Theoretical</span>
              <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-blue-600 inline-block" /> Actual</span>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {chart.series.map(s => (
                  <span key={s.group} className="flex items-center gap-1.5 text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                    {s.group}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Solid line = actual, dashed = theoretical.</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-bold text-sm">Detailed Records</h3>
          <span className="text-xs text-gray-500">{filtered.length > MAX_ROWS ? `Showing latest ${MAX_ROWS} of ${filtered.length}` : `${filtered.length} records`}</span>
        </div>
        <div className="overflow-x-auto max-h-[600px]">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Month</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plant</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Silo</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Incoming</th>
                {type === 'daily' && <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Transfer In</th>}
                {type === 'daily' && <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Transfer Out</th>}
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Theoretical</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Usage</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {limited.map((r, i) => {
                const v = r.variance
                const vColor = v === null || v === undefined ? 'text-gray-400' : v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-gray-500'
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.report_date || r.report_month}{r.status === 'OVER USAGE' && <span className="ml-1 text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5">OVER USAGE</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-semibold">{r.plant_name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.silo_name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.material_name || '-'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmt(r.incoming)}</td>
                    {type === 'daily' && <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmt(r.transfer_in || 0)}</td>}
                    {type === 'daily' && <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmt(r.transfer_out || 0)}</td>}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmt(r.theoretical)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmt(r.actual_stock)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmt(r.usage)}</td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-semibold ${vColor}`}>{fmt(r.variance)}</td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-semibold ${vColor}`}>{r.variance_pct !== null && r.variance_pct !== undefined ? r.variance_pct.toFixed(2) + '%' : '-'}</td>
                  </tr>
                )
              })}
              {!loading && limited.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-500">No records found for this selection.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {materialSummary.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm p-6 mt-6">
          <h3 className="font-bold text-sm mb-3">Material Summary (Global)</h3>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Incoming</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {materialSummary.map(m => (
                <tr key={m.material}>
                  <td className="px-3 py-2 font-semibold">{m.material}</td>
                  <td className="px-3 py-2 text-right">{fmt(m.incoming)} <span className="text-[10px] text-gray-400">{m.unit}</span></td>
                  <td className="px-3 py-2 text-right">{fmt(m.usage)} <span className="text-[10px] text-gray-400">{m.unit}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {byPlantMaterial.size > 0 && (
        <div className="bg-white border rounded-xl shadow-sm p-6 mt-6 space-y-6">
          <h3 className="font-bold text-sm">Summary by Plant &amp; Material</h3>
          {Array.from(byPlantMaterial.entries()).map(([plant, entries]) => (
            <div key={plant}>
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 border-b pb-2">{plant}</h4>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Opening</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Incoming</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Usage</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Last Closing</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Variance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map(e => {
                    const vColor = e.variance > 0 ? 'text-red-600' : e.variance < 0 ? 'text-green-600' : 'text-gray-700'
                    const pct = e.theoretical > 0 ? (e.variance / e.theoretical) * 100 : null
                    return (
                      <tr key={e.material}>
                        <td className="px-3 py-2">{e.material}</td>
                        <td className="px-3 py-2 text-right">{fmt(e.opening)} <span className="text-[10px] text-gray-400">{e.unit}</span></td>
                        <td className="px-3 py-2 text-right">{fmt(e.incoming)} <span className="text-[10px] text-gray-400">{e.unit}</span></td>
                        <td className="px-3 py-2 text-right">{fmt(e.usage)} <span className="text-[10px] text-gray-400">{e.unit}</span></td>
                        <td className="px-3 py-2 text-right">{e.lastClosing !== null ? <>{fmt(e.lastClosing)} <span className="text-[10px] text-gray-400">{e.unit}</span></> : <span className="text-gray-300">-</span>}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${vColor}`}>{fmt(e.variance)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${vColor}`}>{pct !== null ? pct.toFixed(2) + '%' : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {varianceByMonth.months.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm p-6 mt-6">
          <h3 className="font-bold text-sm mb-3">Material Variance by Month</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Plant / Material</th>
                  {varianceByMonth.months.map(m => (
                    <th key={m} className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{m}<br /><span className="font-normal normal-case text-[10px]">Var | Var %</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(varianceByMonth.pivot.entries()).map(([plant, byMat]) => (
                  <Fragment key={plant}>
                    <tr className="bg-gray-100 border-y">
                      <td colSpan={varianceByMonth.months.length + 1} className="px-3 py-1.5 font-bold text-slate-700">{plant}</td>
                    </tr>
                    {Array.from(byMat.entries()).map(([material, byMonth]) => (
                      <tr key={plant + material} className="border-b border-gray-100">
                        <td className="px-3 py-2 pl-6 text-gray-600 font-medium">{material}</td>
                        {varianceByMonth.months.map(m => {
                          const d = byMonth.get(m)
                          if (!d) return <td key={m} className="px-3 py-2 text-right text-gray-300">-</td>
                          const vColor = d.variance > 0 ? 'text-red-600' : d.variance < 0 ? 'text-green-600' : 'text-gray-700'
                          const pct = d.theoretical > 0 ? (d.variance / d.theoretical) * 100 : null
                          return (
                            <td key={m} className="px-3 py-2 text-right whitespace-nowrap">
                              <span className={`font-semibold mr-2 ${vColor}`}>{fmt(d.variance)}</span>
                              <span className={vColor}>{pct !== null ? pct.toFixed(1) + '%' : '-'}</span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
