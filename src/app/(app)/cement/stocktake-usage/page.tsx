'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ClipboardList, ChevronLeft, ChevronRight, Save, AlertTriangle } from 'lucide-react'

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

    // Variance checking against system balance still happens once a day in
    // the combined alert report (see Alert Setting), not on every save here.
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto">
      {/* Compact Top Header Bar with Date Navigator & Primary Save Action */}
      <div className="bg-white border rounded-xl shadow-xs p-3.5 mb-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">Daily Stock Take & Usage</h1>
            <p className="text-xs text-slate-500">{formatDateLabel(date)}</p>
          </div>
        </div>

        {/* Date Selector & Primary Save Action */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setDate(d => addDaysIso(d, -1))}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition cursor-pointer"
            title="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-medium bg-white"
          />
          <button
            type="button"
            onClick={() => setDate(d => addDaysIso(d, 1))}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition cursor-pointer"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDate(yesterdayIso())}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              date === yesterdayIso() ? 'bg-blue-50 text-blue-700 font-bold' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            Yesterday
          </button>

          {/* Save Button directly in top bar - no scrolling needed! */}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs sm:text-sm font-bold px-4 py-1.5 rounded-lg shadow-sm transition ml-auto sm:ml-2 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Record'}</span>
          </button>
        </div>
      </div>

      {/* Compact Table (One Page View) */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
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
              {rows.map(r => {
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

              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">No active silos found.</td></tr>
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
