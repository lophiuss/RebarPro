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

export default function StocktakeUsagePage() {
  const supabase = createClient()
  const [date, setDate] = useState(yesterdayIso())
  const [mode, setMode] = useState<'stock' | 'usage'>('stock')
  const [rows, setRows] = useState<Row[]>([])
  const [values, setValues] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [date, mode])

  async function load() {
    const { data: silos } = await supabase
      .from('cement_silos')
      .select('id, name, cement_plants(name), cement_silo_materials(cement_materials(name, cement_units(name)))')
      .eq('is_active', true)
      .order('display_order')

    const table = mode === 'stock' ? 'cement_daily_stock_take' : 'cement_daily_usage'
    const dateCol = mode === 'stock' ? 'take_date' : 'usage_date'
    const valueCol = mode === 'stock' ? 'actual_stock' : 'usage'
    const { data: existing } = await supabase.from(table).select(`silo_id, ${valueCol}`).eq(dateCol, date)
    const existingMap = new Map((existing || []).map((r: any) => [r.silo_id, r[valueCol]]))

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
    const vals: Record<number, string> = {}
    mapped.forEach(r => {
      const v = existingMap.get(r.silo_id)
      if (v !== undefined && v !== null) vals[r.silo_id] = String(v)
    })
    setValues(vals)
  }

  async function save() {
    const entries = Object.entries(values).filter(([, v]) => v !== '')
    if (entries.length === 0) { alert('Enter at least one value.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).single()
    const operator = profile?.full_name || user?.email || 'unknown'

    const table = mode === 'stock' ? 'cement_daily_stock_take' : 'cement_daily_usage'
    const dateCol = mode === 'stock' ? 'take_date' : 'usage_date'
    const valueCol = mode === 'stock' ? 'actual_stock' : 'usage'

    const payload = entries.map(([silo_id, v]) => ({
      [dateCol]: date,
      silo_id: Number(silo_id),
      [valueCol]: Number(v),
      operator,
    }))

    const { error } = await supabase.from(table).upsert(payload, { onConflict: `${dateCol},silo_id` })
    setSaving(false)
    if (error) { alert('Error saving: ' + error.message); return }
    alert('Saved successfully')

    // Variance checking no longer happens here on every save — it's a single
    // combined report sent once each morning (see Alert Setting) so closing a
    // stock take doesn't fire off its own separate email.
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><ClipboardList className="w-7 h-7 text-blue-600" /> Daily Stock Take / Usage</h1>

      <div className="bg-white border rounded-xl p-5 mb-4 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border rounded-md px-3 py-2" />
          <p className="text-xs text-gray-500 mt-1">{formatDateLabel(date)}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('stock')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold border-2 transition ${
                mode === 'stock' ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              Stock Take
            </button>
            <button
              type="button"
              onClick={() => setMode('usage')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold border-2 transition ${
                mode === 'usage' ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              Usage
            </button>
          </div>
        </div>
      </div>

      {/* Prominent, always-visible reminder of which mode is currently active */}
      <div className={`rounded-xl px-5 py-3 mb-6 font-bold text-sm flex items-center gap-2 ${
        mode === 'stock' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
      }`}>
        <span className={`w-2.5 h-2.5 rounded-full ${mode === 'stock' ? 'bg-blue-600' : 'bg-amber-500'}`} />
        You are recording: {mode === 'stock' ? 'DAILY ACTUAL STOCK TAKE (CLOSING)' : 'DAILY USAGE'}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plant</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Silo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map(r => (
              <tr key={r.silo_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{r.plant_name}</td>
                <td className="px-4 py-3 text-sm font-medium">{r.silo_name}</td>
                <td className="px-4 py-3 text-sm">
                  <div>{r.material_name ?? '-'}</div>
                  {r.unit_name && <div className="text-xs text-gray-500">{r.unit_name}</div>}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number" step="0.01"
                    value={values[r.silo_id] ?? ''}
                    onChange={e => setValues({ ...values, [r.silo_id]: e.target.value })}
                    className="w-28 border rounded-md px-2 py-1.5 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button onClick={save} disabled={saving} className="w-full mt-6">{saving ? 'Saving...' : 'Save Record'}</Button>
    </div>
  )
}
