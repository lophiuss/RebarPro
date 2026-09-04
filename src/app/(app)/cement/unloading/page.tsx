'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PackageOpen, X, Archive, ArchiveRestore } from 'lucide-react'

type Row = {
  id: number
  weigh_date: string
  lorry_no: string
  do_number: string
  material: string | null
  plant_id: number | null
  plant_name: string | null
  discharge_to: string | null
  seal_no: string | null
  do_weight: number
  unload_start_time: string | null
  unload_complete_time: string | null
  archived_at: string | null
  archived_by: string | null
}

const SELECT_COLS = 'id, weigh_date, lorry_no, do_number, material, plant_id, discharge_to, seal_no, do_weight, unload_start_time, unload_complete_time, archived_at, archived_by, cement_plants(name), cement_materials(name)'

function mapRows(data: any[] | null): Row[] {
  return (data || []).map((r: any) => ({
    ...r,
    plant_name: r.cement_plants?.name ?? null,
    material: r.cement_materials?.name ?? r.material,
  }))
}

export default function UnloadingPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedRows, setArchivedRows] = useState<Row[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)

  // Silo-selection modal state
  const [modalRow, setModalRow] = useState<Row | null>(null)
  const [materials, setMaterials] = useState<{ id: number; name: string }[]>([])
  const [materialId, setMaterialId] = useState('')
  const [plants, setPlants] = useState<{ plant_id: number; plant_name: string; silo_id: number; silo_name: string }[]>([])
  const [plantId, setPlantId] = useState('')
  const [siloId, setSiloId] = useState('')

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  async function load() {
    const { data } = await supabase
      .from('cement_weight_in')
      .select(SELECT_COLS)
      .is('weight_out', null)
      .is('archived_at', null)
      .order('weigh_date', { ascending: false })
    setRows(mapRows(data))
    setLoading(false)
  }

  async function loadArchived() {
    setLoadingArchived(true)
    const { data } = await supabase
      .from('cement_weight_in')
      .select(SELECT_COLS)
      .is('weight_out', null)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .limit(100)
    setArchivedRows(mapRows(data))
    setLoadingArchived(false)
  }

  function toggleArchived() {
    const next = !showArchived
    setShowArchived(next)
    if (next && archivedRows.length === 0) loadArchived()
  }

  async function archiveRow(id: number) {
    if (!confirm('Archive this load? It will be hidden from the active queue, but not deleted — you can unarchive it later.')) return
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('cement_weight_in').update({
      archived_at: new Date().toISOString(), archived_by: user?.email || null,
    }).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  async function unarchiveRow(id: number) {
    const { error } = await supabase.from('cement_weight_in').update({ archived_at: null, archived_by: null }).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    setArchivedRows(prev => prev.filter(r => r.id !== id))
    load()
  }

  function openModal(row: Row) {
    setModalRow(row)
    setMaterialId(''); setPlantId(''); setSiloId(''); setPlants([])
    supabase.from('cement_materials').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setMaterials(data || []))
  }

  async function onMaterialChange(id: string) {
    setMaterialId(id); setPlantId(''); setSiloId(''); setPlants([])
    if (!id) return
    const { data } = await supabase
      .from('cement_silo_materials')
      .select('material_id, cement_silos!inner(id, name, is_active, cement_plants!inner(id, name, is_active))')
      .eq('material_id', id)
    const rows = (data || [])
      .map((r: any) => ({
        plant_id: r.cement_silos.cement_plants.id,
        plant_name: r.cement_silos.cement_plants.name,
        silo_id: r.cement_silos.id,
        silo_name: r.cement_silos.name,
      }))
      .filter((r: any) => r.plant_id && r.silo_id)
    setPlants(rows)
  }

  const plantOptions = Array.from(new Map(plants.map(p => [p.plant_id, p.plant_name])).entries())
  const siloOptions = plants.filter(p => String(p.plant_id) === plantId)

  async function confirmStartUnload() {
    if (!modalRow || !materialId || !plantId || !siloId) {
      alert('Please select Material, Plant and Silo')
      return
    }
    const siloName = siloOptions.find(s => String(s.silo_id) === siloId)?.silo_name || ''
    const { error } = await supabase.from('cement_weight_in').update({
      unload_start_time: new Date().toISOString(),
      material_id: Number(materialId),
      plant_id: Number(plantId),
      silo_id: Number(siloId),
      discharge_to: siloName,
    }).eq('id', modalRow.id).is('unload_start_time', null)
    if (error) { alert('Failed to start unload: ' + error.message); return }
    setModalRow(null)
    load()
  }

  async function completeUnload(id: number) {
    const { error } = await supabase.from('cement_weight_in').update({ unload_complete_time: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Failed: ' + error.message); return }
    load()
  }

  function renderRow(r: Row, archived: boolean) {
    return (
      <tr key={r.id} className="hover:bg-gray-50">
        <td className="px-4 py-3 text-sm whitespace-nowrap">{r.weigh_date}</td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">{r.lorry_no}</td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">{r.do_number}</td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">{r.material || '-'}</td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">{r.plant_name || <span className="text-gray-400 italic">Not assigned</span>}</td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">{r.discharge_to || <span className="text-gray-400 italic">Not assigned</span>}</td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">{r.seal_no || ''}</td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">{r.do_weight}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          {archived ? (
            <div className="flex items-center gap-2">
              <button onClick={() => unarchiveRow(r.id)} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-200"><ArchiveRestore className="w-3.5 h-3.5" /> Unarchive</button>
              <span className="text-[11px] text-gray-400">by {r.archived_by || '-'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {!r.unload_start_time ? (
                <button onClick={() => openModal(r)} className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700">Start Unload</button>
              ) : !r.unload_complete_time ? (
                <button onClick={() => completeUnload(r.id)} className="bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-green-700">Complete Unload</button>
              ) : (
                <button disabled className="bg-gray-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg cursor-not-allowed">Completed</button>
              )}
              <button onClick={() => archiveRow(r.id)} title="Archive — stuck/abandoned load, hide from this queue" className="text-gray-400 hover:text-amber-600 p-1.5"><Archive className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><PackageOpen className="w-7 h-7 text-blue-600" /> Unloading In Progress</h1>
        <button onClick={toggleArchived} className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg ${showArchived ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
          <Archive className="w-4 h-4" /> {showArchived ? 'Hide' : 'View'} Archived
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lorry No</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DO Number</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plant</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Discharge To</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seal No</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DO Weight</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map(r => renderRow(r, false))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500">No pending unloading</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showArchived && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl shadow-sm overflow-x-auto">
          <div className="px-4 py-3 border-b border-amber-200">
            <h2 className="text-sm font-bold text-amber-800">Archived Loads</h2>
          </div>
          <table className="min-w-full divide-y divide-amber-100">
            <thead>
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Lorry No</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">DO Number</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Material</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Plant</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Discharge To</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Seal No</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">DO Weight</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-amber-50">
              {archivedRows.map(r => renderRow(r, true))}
              {!loadingArchived && archivedRows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">No archived loads</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">🏭 Select Silo for Unloading</h2>
              <button onClick={() => setModalRow(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
            <select value={materialId} onChange={e => onMaterialChange(e.target.value)} className="w-full border rounded-md px-3 py-2 bg-white mb-4">
              <option value="">Select Material</option>
              {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            <label className="block text-xs font-medium text-gray-500 mb-1">Plant</label>
            <select value={plantId} onChange={e => { setPlantId(e.target.value); setSiloId('') }} disabled={!materialId} className="w-full border rounded-md px-3 py-2 bg-white mb-4 disabled:bg-gray-100">
              <option value="">{materialId ? 'Select Plant' : 'Select Material First'}</option>
              {plantOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>

            <label className="block text-xs font-medium text-gray-500 mb-1">Silo (Discharge To)</label>
            <select value={siloId} onChange={e => setSiloId(e.target.value)} disabled={!plantId} className="w-full border rounded-md px-3 py-2 bg-white mb-6 disabled:bg-gray-100">
              <option value="">{plantId ? 'Select Silo' : 'Select Plant First'}</option>
              {siloOptions.map(s => <option key={s.silo_id} value={s.silo_id}>{s.silo_name}</option>)}
            </select>

            <div className="flex gap-3">
              <button onClick={() => setModalRow(null)} className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2.5 font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={confirmStartUnload} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700">Start Unload</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
