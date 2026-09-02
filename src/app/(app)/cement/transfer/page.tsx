'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeftRight, Trash2 } from 'lucide-react'

type Plant = { id: number; name: string }
type Silo = { id: number; name: string; plant_id: number; is_active: boolean }
type Material = { id: number; name: string }
type Transfer = {
  id: number
  transfer_date: string
  quantity: number
  remarks: string | null
  operator: string | null
  from_silo_id: number
  to_silo_id: number
  material_id: number
  cement_materials: { name: string } | null
  from_silo: { name: string; cement_plants: { name: string } | null } | null
  to_silo: { name: string; cement_plants: { name: string } | null } | null
}

export default function TransferPage() {
  const supabase = createClient()
  const [plants, setPlants] = useState<Plant[]>([])
  const [silos, setSilos] = useState<Silo[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], material_id: '', from_plant: '', from_silo: '', to_plant: '', to_silo: '', quantity: '', remarks: '' })
  const [filters, setFilters] = useState({ date: '', plant_id: '', material_id: '' })

  useEffect(() => {
    supabase.from('cement_plants').select('id, name').eq('is_active', true).order('name').then(({ data }) => setPlants(data || []))
    supabase.from('cement_silos').select('id, name, plant_id, is_active').eq('is_active', true).order('name').then(({ data }) => setSilos(data || []))
    supabase.from('cement_materials').select('id, name').eq('is_active', true).order('name').then(({ data }) => setMaterials(data || []))
    loadTransfers()
  }, [])

  async function loadTransfers() {
    let q = supabase
      .from('cement_transfers')
      .select('id, transfer_date, quantity, remarks, operator, from_silo_id, to_silo_id, material_id, cement_materials(name), from_silo:cement_silos!cement_transfers_from_silo_id_fkey(name, cement_plants(name)), to_silo:cement_silos!cement_transfers_to_silo_id_fkey(name, cement_plants(name))')
      .order('transfer_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters.date) q = q.eq('transfer_date', filters.date)
    if (filters.material_id) q = q.eq('material_id', filters.material_id)
    const { data, error } = await q
    if (error) { console.error(error); return }
    let rows = (data || []) as any as Transfer[]
    if (filters.plant_id) {
      rows = rows.filter(t => t.from_silo?.cement_plants?.name === plants.find(p => String(p.id) === filters.plant_id)?.name
        || t.to_silo?.cement_plants?.name === plants.find(p => String(p.id) === filters.plant_id)?.name)
    }
    setTransfers(rows)
  }

  function showAlert(type: 'success' | 'error', text: string) {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 5000)
  }

  const fromSilos = silos.filter(s => String(s.plant_id) === form.from_plant)
  const toSilos = silos.filter(s => String(s.plant_id) === form.to_plant)

  function resetForm() {
    setForm({ date: new Date().toISOString().split('T')[0], material_id: '', from_plant: '', from_silo: '', to_plant: '', to_silo: '', quantity: '', remarks: '' })
  }

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (form.from_silo === form.to_silo) { showAlert('error', 'Cannot transfer to the same silo'); return }
    const qty = Number(form.quantity)
    if (!qty || qty <= 0) { showAlert('error', 'Quantity must be greater than 0'); return }
    if (!confirm('Are you sure you want to create this transfer?')) return

    // Validate against current computed stock (same source the dashboard uses).
    const { data: stockRows } = await supabase.rpc('cement_silo_stock')
    const fromStock = (stockRows || []).find((r: any) => r.silo_id === Number(form.from_silo))
    if (fromStock && qty > Number(fromStock.current_stock)) {
      showAlert('error', `Insufficient stock. Current stock: ${fromStock.current_stock}, requested: ${qty}`)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).single()
    const operator = profile?.full_name || user?.email || 'unknown'

    const { error } = await supabase.from('cement_transfers').insert([{
      transfer_date: form.date,
      from_silo_id: Number(form.from_silo),
      to_silo_id: Number(form.to_silo),
      material_id: Number(form.material_id),
      quantity: qty,
      remarks: form.remarks || null,
      operator,
    }])
    if (error) { showAlert('error', error.message); return }
    showAlert('success', 'Transfer created successfully!')
    resetForm()
    loadTransfers()
  }

  async function deleteTransfer(id: number) {
    if (!confirm('Are you sure you want to delete this transfer? This will affect silo balances.')) return
    const { error } = await supabase.from('cement_transfers').delete().eq('id', id)
    if (error) { showAlert('error', error.message); return }
    showAlert('success', 'Transfer deleted successfully!')
    loadTransfers()
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><ArrowLeftRight className="w-7 h-7 text-blue-600" /> Material Transfer</h1>

      {alert && (
        <div className={`mb-6 rounded-xl px-5 py-3 border text-sm font-medium ${alert.type === 'success' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'}`}>
          {alert.text}
        </div>
      )}

      <form onSubmit={submitTransfer} className="bg-white border rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-bold text-sm mb-4">Create New Transfer</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Date *</label><input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full border rounded-md px-3 py-2" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Material *</label>
            <select required value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })} className="w-full border rounded-md px-3 py-2 bg-white">
              <option value="">Select Material</option>
              {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">From Plant *</label>
            <select required value={form.from_plant} onChange={e => setForm({ ...form, from_plant: e.target.value, from_silo: '' })} className="w-full border rounded-md px-3 py-2 bg-white">
              <option value="">Select Plant</option>
              {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">From Silo *</label>
            <select required value={form.from_silo} onChange={e => setForm({ ...form, from_silo: e.target.value })} disabled={!form.from_plant} className="w-full border rounded-md px-3 py-2 bg-white disabled:bg-gray-100">
              <option value="">{form.from_plant ? 'Select Silo' : 'Select From Plant First'}</option>
              {fromSilos.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">To Plant *</label>
            <select required value={form.to_plant} onChange={e => setForm({ ...form, to_plant: e.target.value, to_silo: '' })} className="w-full border rounded-md px-3 py-2 bg-white">
              <option value="">Select Plant</option>
              {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">To Silo *</label>
            <select required value={form.to_silo} onChange={e => setForm({ ...form, to_silo: e.target.value })} disabled={!form.to_plant} className="w-full border rounded-md px-3 py-2 bg-white disabled:bg-gray-100">
              <option value="">{form.to_plant ? 'Select Silo' : 'Select To Plant First'}</option>
              {toSilos.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Quantity *</label><input type="number" step="0.01" min="0.01" required placeholder="Enter quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="w-full border rounded-md px-3 py-2" /></div>
        </div>
        <div className="mb-4"><label className="block text-xs font-medium text-gray-500 mb-1">Remarks</label><textarea placeholder="Optional remarks" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="w-full border rounded-md px-3 py-2 min-h-20" /></div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={resetForm} className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200">Reset</button>
          <button type="submit" className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700">Submit Transfer</button>
        </div>
      </form>

      <div className="bg-white border rounded-xl shadow-sm p-5 mb-4">
        <h2 className="font-bold text-sm mb-3">Transfer History</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="date" value={filters.date} onChange={e => setFilters({ ...filters, date: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm" />
          <select value={filters.plant_id} onChange={e => setFilters({ ...filters, plant_id: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm bg-white">
            <option value="">All Plants</option>
            {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filters.material_id} onChange={e => setFilters({ ...filters, material_id: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm bg-white">
            <option value="">All Materials</option>
            {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={loadTransfers} className="bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-blue-700">Filter</button>
          <button onClick={() => { setFilters({ date: '', plant_id: '', material_id: '' }); loadTransfers() }} className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-gray-200">Reset</button>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remarks</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transfers.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm whitespace-nowrap">{t.transfer_date}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap"><div className="font-semibold">{t.from_silo?.cement_plants?.name || '-'}</div><div className="text-xs text-gray-500">{t.from_silo?.name || '-'}</div></td>
                <td className="px-4 py-3 text-sm whitespace-nowrap"><div className="font-semibold">{t.to_silo?.cement_plants?.name || '-'}</div><div className="text-xs text-gray-500">{t.to_silo?.name || '-'}</div></td>
                <td className="px-4 py-3 text-sm whitespace-nowrap"><span className="bg-blue-50 text-blue-800 text-xs rounded-full px-2 py-0.5">{t.cement_materials?.name || '-'}</span></td>
                <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap">{Number(t.quantity).toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{t.remarks || '-'}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap"><span className="bg-green-50 text-green-800 text-xs rounded-full px-2 py-0.5">{t.operator || 'Unknown'}</span></td>
                <td className="px-4 py-3 whitespace-nowrap"><button onClick={() => deleteTransfer(t.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
            {transfers.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No transfers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
