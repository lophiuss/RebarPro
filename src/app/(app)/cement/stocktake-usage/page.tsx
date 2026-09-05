'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ClipboardList } from 'lucide-react'

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
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><ClipboardList className="w-7 h-7 text-blue-600" /> Daily Stock Take / Usage</h1>

      <div className="bg-white border rounded-xl p-5 mb-6">
        <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded-md px-3 py-2 w-48" />
        <p className="text-xs text-gray-500 mt-1">{formatDateLabel(date)}</p>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plant</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Silo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase bg-blue-50/50">Stock Take (Closing)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-amber-700 uppercase bg-amber-50/50">Usage</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map(r => {
              const stockFlag = isSuspicious(stockValues[r.silo_id] ?? '', prevStock[r.silo_id])
              const usageFlag = isSuspicious(usageValues[r.silo_id] ?? '', prevUsage[r.silo_id])
              return (
                <tr key={r.silo_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{r.plant_name}</td>
                  <td className="px-4 py-3 text-sm font-medium">{r.silo_name}</td>
                  <td className="px-4 py-3 text-sm">
                    <div>{r.material_name ?? '-'}</div>
                    {r.unit_name && <div className="text-xs text-gray-500">{r.unit_name}</div>}
                  </td>
                  <td className="px-4 py-3 bg-blue-50/20">
                    <input
                      type="number" step="0.01"
                      value={stockValues[r.silo_id] ?? ''}
                      onChange={e => setStockValues({ ...stockValues, [r.silo_id]: e.target.value })}
                      className={`w-28 border rounded-md px-2 py-1.5 text-sm ${stockFlag ? 'border-red-400 bg-red-50 text-red-700 font-semibold' : ''}`}
                    />
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {prevStock[r.silo_id] !== undefined ? `Yesterday: ${prevStock[r.silo_id]}` : 'No prior data'}
                    </div>
                    {stockFlag && <div className="text-[11px] text-red-600 font-medium">⚠ Big jump vs yesterday</div>}
                  </td>
                  <td className="px-4 py-3 bg-amber-50/20">
                    <input
                      type="number" step="0.01"
                      value={usageValues[r.silo_id] ?? ''}
                      onChange={e => setUsageValues({ ...usageValues, [r.silo_id]: e.target.value })}
                      className={`w-28 border rounded-md px-2 py-1.5 text-sm ${usageFlag ? 'border-red-400 bg-red-50 text-red-700 font-semibold' : ''}`}
                    />
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {prevUsage[r.silo_id] !== undefined ? `Yesterday: ${prevUsage[r.silo_id]}` : 'No prior data'}
                    </div>
                    {usageFlag && <div className="text-[11px] text-red-600 font-medium">⚠ Big jump vs yesterday</div>}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No active silos found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Button onClick={save} disabled={saving} className="w-full mt-6">{saving ? 'Saving...' : 'Save Record'}</Button>
    </div>
  )
}
