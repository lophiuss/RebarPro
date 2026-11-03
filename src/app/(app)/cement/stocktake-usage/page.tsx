'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, ChevronLeft, ChevronRight, Save, AlertTriangle, Factory } from 'lucide-react'

type Row = {
  silo_id: number
  plant_name: string
  silo_name: string
  material_name: string | null
  unit_name: string | null
}

function formatDateLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const day = d.getDate()
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const year = d.getFullYear()
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
  return `${day} ${month} ${year} ${weekday}`
}

function yesterdayIso() {
  return new Date(Date.now() - 86400000).toISOString().split('T')[0]
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function StocktakeUsagePage() {
  const supabase = createClient()
  const [date, setDate] = useState(yesterdayIso())
  const [rows, setRows] = useState<Row[]>([])
  const [selectedPlant, setSelectedPlant] = useState<string>('all')
  const [stockValues, setStockValues] = useState<Record<number, string>>({})
  const [usageValues, setUsageValues] = useState<Record<number, string>>({})
  const [prevStock, setPrevStock] = useState<Record<number, number>>({})
  const [prevUsage, setPrevUsage] = useState<Record<number, number>>({})
  const [variancePct, setVariancePct] = useState(3)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [date])

  async function load() {
    const prevDate = addDaysIso(date, -1)

    const [{ data: silos }, { data: existingStock }, { data: existingUsage }, { data: yesterdayStock }, { data: yesterdayUsage }, { data: alertSettings }] = await Promise.all([
      supabase.from('cement_silos').select('id, name, cement_plants(name), cement_silo_materials(cement_materials(name, cement_units(name)))').eq('is_active', true).order('display_order'),
      supabase.from('cement_daily_stock_take').select('silo_id, actual_stock').eq('take_date', date),
      supabase.from('cement_daily_usage').select('silo_id, usage').eq('usage_date', date),
      supabase.from('cement_daily_stock_take').select('silo_id, actual_stock').eq('take_date', prevDate),
      supabase.from('cement_daily_usage').select('silo_id, usage').eq('usage_date', prevDate),
      supabase.from('cement_alert_settings').select('variance_threshold_pct').eq('id', 1).single(),
    ])

    const mapped: Row[] = (silos || []).map((s: any) => {
      const sm = Array.isArray(s.cement_silo_materials) ? s.cement_silo_materials[0] : s.cement_silo_materials
      const mat = sm?.cement_materials
      const unit = Array.isArray(mat?.cement_units) ? mat?.cement_units[0] : mat?.cement_units
      return {
        silo_id: s.id,
        plant_name: s.cement_plants?.name || '-',
        silo_name: s.name,
        material_name: mat?.name ?? null,
        unit_name: unit?.name ?? null,
      }
    })
    setRows(mapped)

    const toValMap = (rows: any[] | null, col: string) => {
      const out: Record<number, string> = {}
      for (const r of rows || []) if (r[col] !== null && r[col] !== undefined) out[r.silo_id] = String(r[col])
      return out
    }
    setStockValues(toValMap(existingStock, 'actual_stock'))
    setUsageValues(toValMap(existingUsage, 'usage'))

    const toNumMap = (rows: any[] | null, col: string) => {
      const out: Record<number, number> = {}
      for (const r of rows || []) if (r[col] !== null && r[col] !== undefined) out[r.silo_id] = Number(r[col])
      return out
    }
    setPrevStock(toNumMap(yesterdayStock, 'actual_stock'))
    setPrevUsage(toNumMap(yesterdayUsage, 'usage'))

    if (alertSettings?.variance_threshold_pct) setVariancePct(Number(alertSettings.variance_threshold_pct))
  }

  // Extract unique plant names
  const plantOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => {
      if (r.plant_name && r.plant_name !== '-') set.add(r.plant_name)
    })
    return Array.from(set).sort()
  }, [rows])

  // Filter rows by plant if selected
  const filteredRows = useMemo(() => {
    if (selectedPlant === 'all') return rows
    return rows.filter(r => r.plant_name === selectedPlant)
  }, [rows, selectedPlant])

  // A same-page sanity check against yesterday's figure for the same silo —
  // separate from (and much simpler than) the official actual-vs-system
  // variance alert, this just flags "does this look like a typo" while
  // someone's still typing, instead of only surfacing in tomorrow's report.
  function isSuspicious(current: string, previous: number | undefined) {
    if (!current || previous === undefined || previous === 0) return false
    const pct = Math.abs((Number(current) - previous) / previous) * 100
    return pct > variancePct * 3
  }

  async function save() {
    const stockEntries = Object.entries(stockValues).filter(([, v]) => v !== '')
    const usageEntries = Object.entries(usageValues).filter(([, v]) => v !== '')
    if (stockEntries.length === 0 && usageEntries.length === 0) { alert('Enter at least one value.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).single()
    const operator = profile?.full_name || user?.email || 'unknown'

    const writes: any[] = []
    if (stockEntries.length > 0) {
      const payload = stockEntries.map(([silo_id, v]) => ({ take_date: date, silo_id: Number(silo_id), actual_stock: Number(v), operator }))
      writes.push(supabase.from('cement_daily_stock_take').upsert(payload, { onConflict: 'take_date,silo_id' }))
    }
    if (usageEntries.length > 0) {
      const payload = usageEntries.map(([silo_id, v]) => ({ usage_date: date, silo_id: Number(silo_id), usage: Number(v), operator }))
      writes.push(supabase.from('cement_daily_usage').upsert(payload, { onConflict: 'usage_date,silo_id' }))
    }

    const results = await Promise.all(writes)
    setSaving(false)
    const error = results.find(r => r.error)?.error
    if (error) { alert('Error saving: ' + error.message); return }
    alert('Saved successfully')
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto pb-24 sm:pb-6">
      {/* Top Header Card with Date Navigator, Plant Filter & Save Action */}
      <div className="bg-white border rounded-xl shadow-xs p-3 sm:p-3.5 mb-3">
        {/* Row 1: Title & Desktop Save Button */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-800 leading-tight truncate">
                Daily Stock Take & Usage
              </h1>
              <p className="text-[11px] text-slate-500 truncate">{formatDateLabel(date)}</p>
            </div>
          </div>

          {/* Desktop/Tablet Save Button */}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="hidden sm:flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs sm:text-sm font-bold px-3.5 py-1.5 rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Record'}</span>
          </button>
        </div>

        {/* Row 2: Date Selector & Plant Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-100">
          {/* Date Controls */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setDate(d => addDaysIso(d, -1))}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition cursor-pointer flex-shrink-0"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold bg-white flex-1 sm:flex-initial"
            />
            <button
              type="button"
              onClick={() => setDate(d => addDaysIso(d, 1))}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition cursor-pointer flex-shrink-0"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setDate(yesterdayIso())}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex-shrink-0 ${
                date === yesterdayIso()
                  ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              Yesterday
            </button>
          </div>

          {/* Plant Filter (Filter by plant or show all) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedPlant('all')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                selectedPlant === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>All Plants</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedPlant === 'all' ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-600'
              }`}>
                {rows.length}
              </span>
            </button>

            {plantOptions.map(p => {
              const count = rows.filter(r => r.plant_name === p).length
              const isSelected = selectedPlant === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPlant(p)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Factory className="w-3 h-3" />
                  <span>{p}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* MOBILE VIEW (md:hidden): Compact cards that fit 100% of 1 page width (no horizontal scrolling!) */}
      <div className="md:hidden space-y-2">
        {filteredRows.map(r => {
          const stockFlag = isSuspicious(stockValues[r.silo_id] ?? '', prevStock[r.silo_id])
          const usageFlag = isSuspicious(usageValues[r.silo_id] ?? '', prevUsage[r.silo_id])
          const pStock = prevStock[r.silo_id]
          const pUsage = prevUsage[r.silo_id]

          return (
            <div key={r.silo_id} className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs">
              {/* Card Header: Silo name, Plant badge, Material */}
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-slate-900 text-sm">{r.silo_name}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded">
                    {r.plant_name}
                  </span>
                </div>
                <div className="text-right truncate min-w-0">
                  <span className="text-xs font-medium text-slate-700 truncate">{r.material_name ?? '—'}</span>
                  {r.unit_name && <span className="text-[10px] text-slate-400 ml-1">({r.unit_name})</span>}
                </div>
              </div>

              {/* 2-Column Input Grid: Closing Stock & Daily Usage */}
              <div className="grid grid-cols-2 gap-2">
                {/* Stock Take (Closing MT) */}
                <div className="bg-blue-50/40 border border-blue-100 rounded-lg p-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-blue-900 mb-1">
                    <span>Stock Take</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Y'day: <strong className="font-mono text-slate-700">{pStock !== undefined ? pStock : '—'}</strong>
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder={pStock !== undefined ? `Prev: ${pStock}` : '0.00'}
                    value={stockValues[r.silo_id] ?? ''}
                    onChange={e => setStockValues({ ...stockValues, [r.silo_id]: e.target.value })}
                    className={`w-full min-w-0 border rounded-md px-2 py-1 text-sm bg-white font-bold text-slate-900 shadow-2xs transition ${
                      stockFlag ? 'border-red-400 bg-red-50 text-red-700' : 'border-blue-200 focus:border-blue-500'
                    }`}
                  />
                  {stockFlag && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-red-600 font-bold">
                      <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                      <span>Jump vs y'day</span>
                    </div>
                  )}
                </div>

                {/* Daily Usage (MT) */}
                <div className="bg-amber-50/40 border border-amber-100 rounded-lg p-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 mb-1">
                    <span>Daily Usage</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Y'day: <strong className="font-mono text-slate-700">{pUsage !== undefined ? pUsage : '—'}</strong>
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder={pUsage !== undefined ? `Prev: ${pUsage}` : '0.00'}
                    value={usageValues[r.silo_id] ?? ''}
                    onChange={e => setUsageValues({ ...usageValues, [r.silo_id]: e.target.value })}
                    className={`w-full min-w-0 border rounded-md px-2 py-1 text-sm bg-white font-bold text-slate-900 shadow-2xs transition ${
                      usageFlag ? 'border-red-400 bg-red-50 text-red-700' : 'border-amber-200 focus:border-amber-500'
                    }`}
                  />
                  {usageFlag && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-red-600 font-bold">
                      <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                      <span>Jump vs y'day</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {filteredRows.length === 0 && (
          <div className="bg-white border rounded-xl p-8 text-center text-gray-400 text-sm">
            No active silos found for the selected plant.
          </div>
        )}
      </div>

      {/* DESKTOP VIEW (hidden md:block): Compact Table */}
      <div className="hidden md:block bg-white border rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Silo & Plant</th>
                <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Material</th>
                <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-blue-800 uppercase tracking-wider bg-blue-50/50">
                  Stock Take (Closing MT)
                </th>
                <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-amber-800 uppercase tracking-wider bg-amber-50/50">
                  Usage (Daily MT)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map(r => {
                const stockFlag = isSuspicious(stockValues[r.silo_id] ?? '', prevStock[r.silo_id])
                const usageFlag = isSuspicious(usageValues[r.silo_id] ?? '', prevUsage[r.silo_id])
                const pStock = prevStock[r.silo_id]
                const pUsage = prevUsage[r.silo_id]

                return (
                  <tr key={r.silo_id} className="hover:bg-slate-50/70 transition">
                    {/* Silo & Plant combined */}
                    <td className="px-3.5 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{r.silo_name}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
                          {r.plant_name}
                        </span>
                      </div>
                    </td>

                    {/* Material */}
                    <td className="px-3.5 py-2 whitespace-nowrap">
                      <span className="font-medium text-slate-800 text-xs">{r.material_name ?? '—'}</span>
                      {r.unit_name && <span className="text-[10px] text-slate-400 ml-1">({r.unit_name})</span>}
                    </td>

                    {/* Stock Take Input */}
                    <td className="px-3.5 py-2 bg-blue-50/15 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <input
                          type="number" step="0.01"
                          placeholder={pStock !== undefined ? `Prev: ${pStock}` : '0.00'}
                          value={stockValues[r.silo_id] ?? ''}
                          onChange={e => setStockValues({ ...stockValues, [r.silo_id]: e.target.value })}
                          className={`w-28 sm:w-32 border rounded-md px-2.5 py-1 text-sm bg-white font-semibold transition ${
                            stockFlag ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 focus:border-blue-500'
                          }`}
                        />
                        <div className="flex flex-col text-[10px] leading-tight">
                          <span className="text-slate-400">Y'day: <strong className="text-slate-600 font-mono">{pStock !== undefined ? pStock : '—'}</strong></span>
                          {stockFlag && (
                            <span className="text-red-600 font-bold flex items-center gap-0.5" title="Big jump vs yesterday">
                              <AlertTriangle className="w-3 h-3 text-red-500" /> Jump
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Usage Input */}
                    <td className="px-3.5 py-2 bg-amber-50/15 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <input
                          type="number" step="0.01"
                          placeholder={pUsage !== undefined ? `Prev: ${pUsage}` : '0.00'}
                          value={usageValues[r.silo_id] ?? ''}
                          onChange={e => setUsageValues({ ...usageValues, [r.silo_id]: e.target.value })}
                          className={`w-28 sm:w-32 border rounded-md px-2.5 py-1 text-sm bg-white font-semibold transition ${
                            usageFlag ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 focus:border-amber-500'
                          }`}
                        />
                        <div className="flex flex-col text-[10px] leading-tight">
                          <span className="text-slate-400">Y'day: <strong className="text-slate-600 font-mono">{pUsage !== undefined ? pUsage : '—'}</strong></span>
                          {usageFlag && (
                            <span className="text-red-600 font-bold flex items-center gap-0.5" title="Big jump vs yesterday">
                              <AlertTriangle className="w-3 h-3 text-red-500" /> Jump
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredRows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">No active silos found for the selected plant.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Bottom Save for mobile quick thumb access */}
      <div className="sm:hidden fixed bottom-4 right-4 left-4 z-20">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Record'}</span>
        </button>
      </div>
    </div>
  )
}
