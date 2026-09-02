'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settings2, Trash2, Building2 } from 'lucide-react'

type Unit = { id: number; name: string }
type Plant = { id: number; name: string }
type Material = { id: number; name: string; unit_id: number | null; cement_units?: { name: string } | null }
type Supplier = { id: number; name: string }
type Silo = { id: number; name: string; capacity: number | null; plant_id: number; material_id: number | null; material_name: string | null; unit_name: string | null }

export default function CementSettingsPage() {
  const supabase = createClient()

  const [units, setUnits] = useState<Unit[]>([])
  const [plants, setPlants] = useState<Plant[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [silos, setSilos] = useState<Silo[]>([])

  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null)
  const [unitName, setUnitName] = useState('')
  const [plantName, setPlantName] = useState('')
  const [matName, setMatName] = useState('')
  const [matUnit, setMatUnit] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [siloName, setSiloName] = useState('')
  const [siloCap, setSiloCap] = useState('')

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (selectedPlant) loadSilos(selectedPlant.id) }, [selectedPlant, materials])

  async function loadAll() {
    const [u, p, m, s] = await Promise.all([
      supabase.from('cement_units').select('id, name').order('name'),
      supabase.from('cement_plants').select('id, name').eq('is_active', true).order('name'),
      supabase.from('cement_materials').select('id, name, unit_id, cement_units(name)').eq('is_active', true).order('name'),
      supabase.from('cement_suppliers').select('id, name').eq('is_active', true).order('name'),
    ])
    setUnits(u.data || [])
    setPlants(p.data || [])
    setMaterials((m.data || []) as any)
    setSuppliers(s.data || [])
    if (u.data?.length && !matUnit) setMatUnit(String(u.data[0].id))
  }

  async function loadSilos(plantId: number) {
    const { data } = await supabase
      .from('cement_silos')
      .select('id, name, capacity, plant_id, cement_silo_materials(material_id, cement_materials(name, cement_units(name)))')
      .eq('is_active', true)
      .eq('plant_id', plantId)
      .order('name')
    const mapped: Silo[] = (data || []).map((s: any) => {
      const sm = Array.isArray(s.cement_silo_materials) ? s.cement_silo_materials[0] : s.cement_silo_materials
      const mat = sm?.cement_materials
      const unit = Array.isArray(mat?.cement_units) ? mat?.cement_units[0] : mat?.cement_units
      return {
        id: s.id, name: s.name, capacity: s.capacity, plant_id: s.plant_id,
        material_id: sm?.material_id ?? null, material_name: mat?.name ?? null, unit_name: unit?.name ?? null,
      }
    })
    setSilos(mapped)
  }

  // --- Units ---
  async function addUnit() {
    if (!unitName.trim()) return
    await supabase.from('cement_units').insert([{ name: unitName.trim() }])
    setUnitName('')
    loadAll()
  }

  // --- Plants ---
  async function addPlant() {
    if (!plantName.trim()) return
    await supabase.from('cement_plants').insert([{ name: plantName.trim() }])
    setPlantName('')
    loadAll()
  }
  async function delPlant(id: number) {
    if (!confirm('Delete Plant?')) return
    await supabase.from('cement_plants').update({ is_active: false }).eq('id', id)
    if (selectedPlant?.id === id) setSelectedPlant(null)
    loadAll()
  }

  // --- Materials ---
  async function addMaterial() {
    if (!matName.trim() || !matUnit) { alert('Enter name and select unit'); return }
    await supabase.from('cement_materials').insert([{ name: matName.trim(), unit_id: Number(matUnit) }])
    setMatName('')
    loadAll()
  }
  async function delMaterial(id: number) {
    if (!confirm('Delete Material?')) return
    await supabase.from('cement_materials').update({ is_active: false }).eq('id', id)
    loadAll()
  }

  // --- Suppliers ---
  async function addSupplier() {
    if (!supplierName.trim()) return
    await supabase.from('cement_suppliers').insert([{ name: supplierName.trim() }])
    setSupplierName('')
    loadAll()
  }
  async function delSupplier(id: number) {
    if (!confirm('Delete Supplier?')) return
    await supabase.from('cement_suppliers').update({ is_active: false }).eq('id', id)
    loadAll()
  }

  // --- Silos ---
  async function addSilo() {
    if (!selectedPlant) { alert('Please select a plant first'); return }
    if (!siloName.trim()) { alert('Please enter silo name'); return }
    await supabase.from('cement_silos').insert([{ plant_id: selectedPlant.id, name: siloName.trim(), capacity: siloCap ? Number(siloCap) : null }])
    setSiloName(''); setSiloCap('')
    loadSilos(selectedPlant.id)
  }
  async function updateSiloField(id: number, field: 'name' | 'capacity', value: string) {
    await supabase.from('cement_silos').update({ [field]: field === 'capacity' ? (value ? Number(value) : null) : value }).eq('id', id)
  }
  async function delSilo(id: number) {
    if (!confirm('Delete Silo?')) return
    await supabase.from('cement_silos').update({ is_active: false }).eq('id', id)
    if (selectedPlant) loadSilos(selectedPlant.id)
  }

  async function assignMaterial(siloId: number, materialId: string) {
    if (!materialId) return
    const silo = silos.find(s => s.id === siloId)
    if (silo?.material_name) {
      const [{ count: txCount }, { count: stCount }, { count: usCount }] = await Promise.all([
        supabase.from('cement_weight_in').select('id', { count: 'exact', head: true }).eq('silo_id', siloId),
        supabase.from('cement_daily_stock_take').select('id', { count: 'exact', head: true }).eq('silo_id', siloId),
        supabase.from('cement_daily_usage').select('id', { count: 'exact', head: true }).eq('silo_id', siloId),
      ])
      const total = (txCount || 0) + (stCount || 0) + (usCount || 0)
      if (total > 0) {
        const msg = `⚠️ Change Material Assignment?\n\nCurrent material: ${silo.material_name}\n\nRecords linked to this silo:\n  • Weight-In Transactions : ${txCount}\n  • Daily Stock Takes      : ${stCount}\n  • Daily Usage Records    : ${usCount}\n\n✅ Historical data BEFORE today will remain attributed to "${silo.material_name}" in all reports.\n   Only new records from today onward will use the new material.\n\nProceed with reassignment?`
        if (!confirm(msg)) { loadSilos(silo.plant_id); return }
      }
    }
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('cement_silo_material_history').update({ effective_to: today }).eq('silo_id', siloId).is('effective_to', null)
    await supabase.from('cement_silo_material_history').insert([{ silo_id: siloId, material_id: Number(materialId), effective_from: today }])
    await supabase.from('cement_silo_materials').delete().eq('silo_id', siloId)
    await supabase.from('cement_silo_materials').insert([{ silo_id: siloId, material_id: Number(materialId) }])
    if (selectedPlant) loadSilos(selectedPlant.id)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-20">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-2"><Settings2 className="w-7 h-7 text-blue-600" /> BPlant Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Sidebar: Units / Plants / Materials / Suppliers */}
        <div className="space-y-8">
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b pb-2">1. Units</h3>
            <div className="flex gap-2">
              <input value={unitName} onChange={e => setUnitName(e.target.value)} placeholder="e.g. Kg, Liter" className="flex-1 border rounded-md px-3 py-2 text-sm" />
              <button onClick={addUnit} className="bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-blue-700">Add</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {units.map(u => <span key={u.id} className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">{u.name}</span>)}
            </div>
          </div>

          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b pb-2">2. Plants</h3>
            <div className="flex gap-2 mb-3">
              <input value={plantName} onChange={e => setPlantName(e.target.value)} placeholder="Plant Name" className="flex-1 border rounded-md px-3 py-2 text-sm" />
              <button onClick={addPlant} className="bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-blue-700">Add</button>
            </div>
            <div className="space-y-1.5">
              {plants.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlant(p)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer border text-sm ${selectedPlant?.id === p.id ? 'bg-blue-50 border-blue-400 text-blue-900' : 'bg-gray-50 border-transparent hover:border-gray-300'}`}
                >
                  <span className="font-semibold flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {p.name}</span>
                  <button onClick={e => { e.stopPropagation(); delPlant(p.id) }} className="text-red-500 hover:text-red-700 text-xs font-medium">Del</button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b pb-2">3. Materials</h3>
            <label className="block text-xs font-medium text-gray-500 mb-1">Material Name</label>
            <input value={matName} onChange={e => setMatName(e.target.value)} placeholder="Sand, Cement..." className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
            <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
            <select value={matUnit} onChange={e => setMatUnit(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white mb-3">
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button onClick={addMaterial} className="w-full bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-blue-700">Add Material</button>
            <div className="mt-3 space-y-1.5">
              {materials.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span>{m.name} <span className="text-xs text-gray-400">({m.cement_units?.name})</span></span>
                  <button onClick={() => delMaterial(m.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b pb-2">4. Suppliers</h3>
            <div className="flex gap-2 mb-3">
              <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="e.g. ABC Supply Co." className="flex-1 border rounded-md px-3 py-2 text-sm" />
              <button onClick={addSupplier} className="bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-blue-700">Add</button>
            </div>
            <div className="space-y-1.5">
              {suppliers.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span>{s.name}</span>
                  <button onClick={() => delSupplier(s.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content: Silos for selected plant */}
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          {!selectedPlant ? (
            <div className="text-center text-gray-400 mt-24">
              <div className="text-5xl mb-4">🏢</div>
              <div className="text-lg font-medium">Select a Plant to manage Silos</div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-6 border-b pb-4">Silos for {selectedPlant.name}</h2>
              <div className="flex flex-wrap gap-4 items-end bg-slate-50 border rounded-xl p-5 mb-6">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Silo Name</label>
                  <input value={siloName} onChange={e => setSiloName(e.target.value)} placeholder="e.g. Silo A" className="w-full border rounded-md px-3 py-2 text-sm" />
                </div>
                <div className="w-32">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Capacity</label>
                  <input type="number" value={siloCap} onChange={e => setSiloCap(e.target.value)} placeholder="0" className="w-full border rounded-md px-3 py-2 text-sm" />
                </div>
                <button onClick={addSilo} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700">Add Silo</button>
              </div>

              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Silo Name</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Capacity</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned Material</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {silos.map(s => (
                    <tr key={s.id}>
                      <td className="px-3 py-2"><input defaultValue={s.name} onBlur={e => updateSiloField(s.id, 'name', e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" /></td>
                      <td className="px-3 py-2"><input type="number" defaultValue={s.capacity ?? ''} onBlur={e => updateSiloField(s.id, 'capacity', e.target.value)} className="border rounded px-2 py-1.5 text-sm w-24" /></td>
                      <td className="px-3 py-2">
                        <select value={s.material_id ?? ''} onChange={e => assignMaterial(s.id, e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-white w-full">
                          <option value="">-- Assign --</option>
                          {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><button onClick={() => delSilo(s.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Del</button></td>
                    </tr>
                  ))}
                  {silos.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No silos yet for this plant.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
