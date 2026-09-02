'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
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

  // --- Theoretical vs Actual trend chart ---
  const chart = useMemo(() => {
    const byPeriod = new Map<string, { theoretical: number; actual: number }>()
    filtered.forEach(r => {
      const key = r.report_date || r.report_month || ''
      const cur = byPeriod.get(key) || { theoretical: 0, actual: 0 }
      cur.theoretical += r.theoretical || 0
      cur.actual += r.actual_stock || 0
      byPeriod.set(key, cur)
    })
    const periods = Array.from(byPeriod.keys()).sort()
    const theoData = periods.map(p => byPeriod.get(p)!.theoretical)
    const actData = periods.map(p => byPeriod.get(p)!.actual)
    const maxVal = Math.max(1, ...theoData, ...actData)
    const width = 900, height = 240, padL = 55, padR = 10, padT = 10, padB = 24
    const plotW = width - padL - padR, plotH = height - padT - padB
    const x = (i: number) => padL + (periods.length <= 1 ? 0 : (i / (periods.length - 1)) * plotW)
    const y = (v: number) => padT + plotH - (v / maxVal) * plotH
    const toPath = (data: number[]) => data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
    return { periods, theoPath: toPath(theoData), actPath: toPath(actData), width, height, padL, padT, plotH, maxVal }
  }, [filtered])

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
          <h3 className="font-bold text-sm mb-3">Theoretical vs Actual Trend</h3>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full h-56 min-w-[700px]">
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
              <path d={chart.theoPath} fill="none" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" />
              <path d={chart.actPath} fill="none" stroke="#2563eb" strokeWidth={2.5} />
            </svg>
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-gray-400 inline-block" /> Theoretical</span>
            <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-blue-600 inline-block" /> Actual</span>
          </div>
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
