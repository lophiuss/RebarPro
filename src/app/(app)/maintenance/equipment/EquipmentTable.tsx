'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { X, Check } from 'lucide-react'

export type EquipmentRow = {
  id: number; equip_code: string | null; name: string; category: string | null; brand: string | null
  location: string | null; condition: string | null; manager: string | null; supervisor: string | null
  pic_day: string | null; pic_night: string | null; target_repair_hours: number | null; purpose: string | null
}

const CONDITION_STYLE: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  fair: 'bg-yellow-100 text-yellow-700',
  poor: 'bg-orange-100 text-orange-700',
  spoil: 'bg-red-100 text-red-700',
}

const OTHER = '__other__'

// A <select> of known values with a trailing "Other (type new)" option that
// swaps in a text input — keeps category/location/purpose consistent
// (no "Crane" vs "crane" duplicates) while still letting a genuinely new
// value be entered.
function DropdownOrOther({ value, options, onChange, placeholder }: { value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const [typingNew, setTypingNew] = useState(value !== '' && !options.includes(value))
  if (typingNew) {
    return (
      <div className="flex gap-1">
        <input autoFocus value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full border rounded-md px-3 py-2 text-sm" />
        <button type="button" onClick={() => { setTypingNew(false); onChange('') }} className="text-xs text-gray-400 hover:text-gray-600 px-1" title="Back to dropdown">✕</button>
      </div>
    )
  }
  return (
    <select
      value={options.includes(value) ? value : ''}
      onChange={e => { if (e.target.value === OTHER) { setTypingNew(true); onChange('') } else onChange(e.target.value) }}
      className="w-full border rounded-md px-3 py-2 text-sm bg-white"
    >
      <option value="">-</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value={OTHER}>+ Other (type new)</option>
    </select>
  )
}

export default function EquipmentTable({ equipment, canManage, hasFilters, categories, locations, purposes }: {
  equipment: EquipmentRow[]; canManage: boolean; hasFilters: boolean
  categories: string[]; locations: string[]; purposes: string[]
}) {
  const supabase = createClient()
  const [rows, setRows] = useState(equipment)
  const [editing, setEditing] = useState<EquipmentRow | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  function openEdit(row: EquipmentRow) {
    if (!canManage) return
    setEditing(row)
    setForm({ ...row })
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const patch = {
        equip_code: form.equip_code || null, name: form.name, category: form.category || null,
        brand: form.brand || null, location: form.location || null, purpose: form.purpose || null,
        condition: form.condition || null, manager: form.manager || null, supervisor: form.supervisor || null,
        pic_day: form.pic_day || null, pic_night: form.pic_night || null,
        target_repair_hours: form.target_repair_hours === '' || form.target_repair_hours == null ? null : Number(form.target_repair_hours),
      }
      const { error } = await supabase.from('maintenance_equipment').update(patch).eq('id', editing.id)
      if (error) throw error
      setRows(prev => prev.map(r => r.id === editing.id ? { ...r, ...patch } : r))
      setEditing(null)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">Ownership Manager</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">Ownership Supervisor</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">PIC (Day / Night)</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map(e => (
              <tr key={e.id} className={`hover:bg-gray-50 ${canManage ? 'cursor-pointer' : ''}`} onClick={() => openEdit(e)}>
                <td className="px-3 py-1 text-gray-500 whitespace-nowrap">{e.equip_code || '-'}</td>
                <td className="px-3 py-1 font-medium whitespace-nowrap">
                  <Link href={`/maintenance/equipment/${e.id}`} onClick={ev => ev.stopPropagation()} className="text-blue-600 hover:text-blue-800 hover:underline">{e.name}</Link>
                </td>
                <td className="px-3 py-1 whitespace-nowrap">{e.category || '-'}</td>
                <td className="px-3 py-1 whitespace-nowrap">{e.location || '-'}</td>
                <td className="px-3 py-1 whitespace-nowrap">
                  {e.condition ? <span className={`text-[11px] font-bold uppercase rounded-full px-1.5 py-0.5 ${CONDITION_STYLE[e.condition] || 'bg-gray-100 text-gray-600'}`}>{e.condition}</span> : '-'}
                </td>
                <td className="px-3 py-1 text-gray-500 whitespace-nowrap">{e.manager || '-'}</td>
                <td className="px-3 py-1 text-gray-500 whitespace-nowrap">{e.supervisor || '-'}</td>
                <td className="px-3 py-1 text-gray-500 whitespace-nowrap">{[e.pic_day, e.pic_night].filter(Boolean).join(' / ') || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">{hasFilters ? 'No equipment matches these filters.' : 'No equipment yet — add some in Settings.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {canManage && rows.length > 0 && <p className="text-xs text-gray-400 mt-2">Click any row to edit it.</p>}

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit — {editing.name}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Name</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Code</label><input value={form.equip_code || ''} onChange={e => setForm({ ...form, equip_code: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Condition</label>
                <select value={form.condition || ''} onChange={e => setForm({ ...form, condition: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">-</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="spoil">Spoil</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <DropdownOrOther value={form.category || ''} options={categories} onChange={v => setForm({ ...form, category: v })} placeholder="New category" />
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Brand</label><input value={form.brand || ''} onChange={e => setForm({ ...form, brand: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                <DropdownOrOther value={form.location || ''} options={locations} onChange={v => setForm({ ...form, location: v })} placeholder="New location" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Purpose</label>
                <DropdownOrOther value={form.purpose || ''} options={purposes} onChange={v => setForm({ ...form, purpose: v })} placeholder="New purpose" />
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Ownership Manager</label><input value={form.manager || ''} onChange={e => setForm({ ...form, manager: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Ownership Supervisor</label><input value={form.supervisor || ''} onChange={e => setForm({ ...form, supervisor: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">PIC Day</label><input value={form.pic_day || ''} onChange={e => setForm({ ...form, pic_day: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">PIC Night</label><input value={form.pic_night || ''} onChange={e => setForm({ ...form, pic_night: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Target Repair (h)</label><input type="number" step="0.1" value={form.target_repair_hours ?? ''} onChange={e => setForm({ ...form, target_repair_hours: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditing(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700"><Check className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
