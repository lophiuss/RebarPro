'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PackageSearch, Plus, Pencil, Trash2, Check, X } from 'lucide-react'

type Equipment = { id: number; name: string }
type Request = {
  id: number; part_name: string; equipment_id: number | null; location: string | null
  quantity_requested: number; quantity_received: number; request_date: string | null; received_date: string | null
  maintenance_equipment: { name: string } | null
}

export default function SparePartsPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<Request[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ partName: '', equipmentId: '', location: '', quantityRequested: '', requestDate: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<any>({})
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: req }, { data: eq }] = await Promise.all([
      supabase.from('maintenance_spare_parts_requests').select('*, maintenance_equipment(name)').order('request_date', { ascending: false }).limit(100),
      supabase.from('maintenance_equipment').select('id, name, location').eq('is_active', true).order('name'),
    ])
    setRequests((req as any) || [])
    setEquipment((eq || []).map(e => ({ id: e.id, name: e.name })))
    // Reuse the same location vocabulary already in use on equipment,
    // rather than maintaining a separate list.
    setLocations([...new Set((eq || []).map(e => e.location).filter(Boolean))].sort() as string[])
    setLoading(false)
  }

  async function addRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!form.partName.trim() || !form.quantityRequested) { alert('Please fill in part name and quantity'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('maintenance_spare_parts_requests').insert([{
        part_name: form.partName.trim(),
        equipment_id: form.equipmentId ? Number(form.equipmentId) : null,
        location: form.location || null,
        quantity_requested: Number(form.quantityRequested),
        quantity_received: 0,
        request_date: form.requestDate,
      }])
      if (error) throw error
      setForm({ partName: '', equipmentId: '', location: '', quantityRequested: '', requestDate: new Date().toISOString().split('T')[0] })
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(r: Request) {
    setEditingId(r.id)
    setEditData({
      part_name: r.part_name, equipment_id: r.equipment_id ?? '', location: r.location || '',
      quantity_requested: r.quantity_requested, quantity_received: r.quantity_received,
      request_date: r.request_date || '', received_date: r.received_date || '',
    })
  }

  async function saveEdit() {
    if (!editData.part_name.trim()) { alert('Part name is required'); return }
    const { error } = await supabase.from('maintenance_spare_parts_requests').update({
      part_name: editData.part_name.trim(),
      equipment_id: editData.equipment_id ? Number(editData.equipment_id) : null,
      location: editData.location || null,
      quantity_requested: Number(editData.quantity_requested) || 0,
      quantity_received: Number(editData.quantity_received) || 0,
      request_date: editData.request_date || null,
      received_date: editData.received_date || null,
    }).eq('id', editingId)
    if (error) { alert('Error: ' + error.message); return }
    setEditingId(null)
    await load()
  }

  async function deleteRequest(id: number) {
    if (!confirm('Delete this spare parts request? This cannot be undone.')) return
    setDeletingId(id)
    try {
      const { error } = await supabase.from('maintenance_spare_parts_requests').delete().eq('id', id)
      if (error) throw error
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><PackageSearch className="w-7 h-7 text-orange-600" /> Spare Parts</h1>

      <form onSubmit={addRequest} className="bg-white border rounded-xl shadow-sm p-5 mb-8 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Part Name</label>
          <input value={form.partName} onChange={e => setForm({ ...form, partName: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-48" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Equipment</label>
          <select value={form.equipmentId} onChange={e => setForm({ ...form, equipmentId: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-48">
            <option value="">(Not specific)</option>
            {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
          <select value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-40">
            <option value="">(Not specific)</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Qty Requested</label>
          <input type="number" value={form.quantityRequested} onChange={e => setForm({ ...form, quantityRequested: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-28" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Request Date</label>
          <input type="date" value={form.requestDate} onChange={e => setForm({ ...form, requestDate: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={saving} className="flex items-center gap-1.5 bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-700">
          <Plus className="w-4 h-4" /> {saving ? 'Saving...' : 'Add Request'}
        </button>
      </form>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Part</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {requests.map(r => editingId === r.id ? (
              <tr key={r.id} className="bg-orange-50/40">
                <td className="px-4 py-2"><input type="date" value={editData.request_date} onChange={e => setEditData({ ...editData, request_date: e.target.value })} className="border rounded px-2 py-1 text-sm" /></td>
                <td className="px-4 py-2"><input value={editData.part_name} onChange={e => setEditData({ ...editData, part_name: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" /></td>
                <td className="px-4 py-2">
                  <select value={editData.equipment_id} onChange={e => setEditData({ ...editData, equipment_id: e.target.value })} className="border rounded px-2 py-1 text-sm bg-white w-full">
                    <option value="">(Not specific)</option>
                    {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select value={editData.location} onChange={e => setEditData({ ...editData, location: e.target.value })} className="border rounded px-2 py-1 text-sm bg-white w-full">
                    <option value="">(Not specific)</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2"><input type="number" value={editData.quantity_requested} onChange={e => setEditData({ ...editData, quantity_requested: e.target.value })} className="border rounded px-2 py-1 text-sm w-20" /></td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <input type="number" value={editData.quantity_received} onChange={e => setEditData({ ...editData, quantity_received: e.target.value })} className="border rounded px-2 py-1 text-sm w-16" />
                    <input type="date" value={editData.received_date} onChange={e => setEditData({ ...editData, received_date: e.target.value })} className="border rounded px-2 py-1 text-xs w-32" />
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={saveEdit} className="text-green-600 hover:text-green-800 p-1"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-700 p-1"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm whitespace-nowrap">{r.request_date || '-'}</td>
                <td className="px-4 py-3 text-sm font-medium">{r.part_name}</td>
                <td className="px-4 py-3 text-sm">{r.maintenance_equipment?.name || '-'}</td>
                <td className="px-4 py-3 text-sm">{r.location || '-'}</td>
                <td className="px-4 py-3 text-sm">{r.quantity_requested}</td>
                <td className={`px-4 py-3 text-sm font-medium ${r.quantity_received >= r.quantity_requested ? 'text-green-600' : 'text-amber-600'}`}>{r.quantity_received}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(r)} className="text-blue-600 hover:text-blue-800 p-1"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => deleteRequest(r.id)} disabled={deletingId === r.id} className="text-red-500 hover:text-red-700 disabled:opacity-50 p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && requests.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No spare part requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
