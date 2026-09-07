'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PackageSearch, Plus } from 'lucide-react'

type Equipment = { id: number; name: string }
type Request = {
  id: number; part_name: string; equipment_id: number | null; quantity_requested: number
  quantity_received: number; request_date: string | null; received_date: string | null
  maintenance_equipment: { name: string } | null
}

export default function SparePartsPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<Request[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ partName: '', equipmentId: '', quantityRequested: '', requestDate: new Date().toISOString().split('T')[0] })
  const [receivedInputs, setReceivedInputs] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: req }, { data: eq }] = await Promise.all([
      supabase.from('maintenance_spare_parts_requests').select('*, maintenance_equipment(name)').order('request_date', { ascending: false }).limit(100),
      supabase.from('maintenance_equipment').select('id, name').eq('is_active', true).order('name'),
    ])
    setRequests((req as any) || [])
    setEquipment(eq || [])
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
        quantity_requested: Number(form.quantityRequested),
        quantity_received: 0,
        request_date: form.requestDate,
      }])
      if (error) throw error
      setForm({ partName: '', equipmentId: '', quantityRequested: '', requestDate: new Date().toISOString().split('T')[0] })
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveReceived(id: number) {
    const val = receivedInputs[id]
    if (val === undefined || val === '') return
    const { error } = await supabase.from('maintenance_spare_parts_requests').update({
      quantity_received: Number(val), received_date: new Date().toISOString().split('T')[0],
    }).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    await load()
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Update Received</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {requests.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm whitespace-nowrap">{r.request_date || '-'}</td>
                <td className="px-4 py-3 text-sm font-medium">{r.part_name}</td>
                <td className="px-4 py-3 text-sm">{r.maintenance_equipment?.name || '-'}</td>
                <td className="px-4 py-3 text-sm">{r.quantity_requested}</td>
                <td className={`px-4 py-3 text-sm font-medium ${r.quantity_received >= r.quantity_requested ? 'text-green-600' : 'text-amber-600'}`}>{r.quantity_received}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input type="number" placeholder={String(r.quantity_received)} value={receivedInputs[r.id] ?? ''} onChange={e => setReceivedInputs({ ...receivedInputs, [r.id]: e.target.value })} className="w-20 border rounded px-2 py-1 text-sm" />
                    <button onClick={() => saveReceived(r.id)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">Save</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && requests.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No spare part requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
