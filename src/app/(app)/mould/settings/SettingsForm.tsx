'use client'

import { useState } from 'react'
import { updateMouldSettings } from '../actions'

type Settings = {
  standard_steel_rate_per_kg: number
  provisional_labour_rate_per_hour: number
  scrap_rate_per_kg: number
}

export default function SettingsForm({ initial, isAdmin }: { initial: Settings; isAdmin: boolean }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await updateMouldSettings({
        standard_steel_rate_per_kg: Number(form.standard_steel_rate_per_kg),
        provisional_labour_rate_per_hour: Number(form.provisional_labour_rate_per_hour),
        scrap_rate_per_kg: Number(form.scrap_rate_per_kg),
      })
      setSaved(true)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Standard steel rate (RM / kg)</label>
        <input type="number" step="0.01" disabled={!isAdmin} value={form.standard_steel_rate_per_kg}
          onChange={e => setForm({ ...form, standard_steel_rate_per_kg: Number(e.target.value) })}
          className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
        <p className="text-xs text-gray-400 mt-1">Applied to weighed added steel when a mould job is marked complete.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Provisional labour rate (RM / hour)</label>
        <input type="number" step="0.01" disabled={!isAdmin} value={form.provisional_labour_rate_per_hour}
          onChange={e => setForm({ ...form, provisional_labour_rate_per_hour: Number(e.target.value) })}
          className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
        <p className="text-xs text-amber-600 mt-1">
          ⚠ Placeholder until plant-management-system&apos;s real per-worker wages are connected. Every report and
          job cost derived from this is provisional, not actual payroll.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Scrap steel rate (RM / kg)</label>
        <input type="number" step="0.01" disabled={!isAdmin} value={form.scrap_rate_per_kg}
          onChange={e => setForm({ ...form, scrap_rate_per_kg: Number(e.target.value) })}
          className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
        <p className="text-xs text-gray-400 mt-1">Credited to Factory when a mould is decommissioned (never to a project).</p>
      </div>

      {isAdmin ? (
        <button onClick={save} disabled={saving} className="bg-teal-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700">
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save'}
        </button>
      ) : (
        <p className="text-xs text-gray-400">Only a Mould admin can change these rates.</p>
      )}
    </div>
  )
}
