'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ScrollText, X } from 'lucide-react'

type Row = {
  id: number
  lorry_no: string
  material: string | null
  plant_name: string | null
  plant_id: number | null
  material_id: number | null
  supplier: string | null
  do_number: string | null
  weigh_date: string
  file1_path: string | null
  file2_path: string | null
  do_weight: number | null
  weight_in: number | null
  weight_out: number | null
  created_at: string | null
  weight_out_time: string | null
  weight_out_operator: string | null
}

const LIMIT = 50

export default function RecordsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [plants, setPlants] = useState<{ id: number; name: string }[]>([])
  const [materials, setMaterials] = useState<{ id: number; name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ date: '', plant_id: '', material_id: '', supplier: '' })
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<Row | null>(null)

  useEffect(() => {
    supabase.from('cement_plants').select('id, name').eq('is_active', true).order('name').then(({ data }) => setPlants(data || []))
    supabase.from('cement_materials').select('id, name').eq('is_active', true).order('name').then(({ data }) => setMaterials(data || []))
    supabase.from('cement_suppliers').select('id, name').eq('is_active', true).order('name').then(({ data }) => setSuppliers(data || []))
  }, [])

  useEffect(() => { load() }, [page])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('cement_weight_in')
      .select('id, lorry_no, material, plant_id, material_id, supplier, do_number, weigh_date, file1_path, file2_path, do_weight, weight_in, weight_out, created_at, weight_out_time, weight_out_operator, cement_plants(name), cement_materials(name)')
      .not('weight_out', 'is', null)
      .order('weight_out_time', { ascending: false })
      .range((page - 1) * LIMIT, page * LIMIT - 1)

    if (filters.date) q = q.eq('weigh_date', filters.date)
    if (filters.plant_id) q = q.eq('plant_id', filters.plant_id)
    if (filters.material_id) q = q.eq('material_id', filters.material_id)
    if (filters.supplier) q = q.eq('supplier', filters.supplier)

    const { data } = await q
    const mapped: Row[] = (data || []).map((r: any) => ({
      ...r,
      plant_name: r.cement_plants?.name ?? null,
      material: r.cement_materials?.name ?? r.material,
    }))
    setRows(mapped)
    setLoading(false)

    // Signed URLs for any attached photos (bucket is private).
    const paths = mapped.flatMap(r => [r.file1_path, r.file2_path]).filter(Boolean) as string[]
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('cement-uploads').createSignedUrls(paths, 3600)
      const urlMap: Record<string, string> = {}
      signed?.forEach(s => { if (s.signedUrl && s.path) urlMap[s.path] = s.signedUrl })
      setPhotoUrls(urlMap)
    }
  }

  function search() { setPage(1); load() }
  function reset() { setFilters({ date: '', plant_id: '', material_id: '', supplier: '' }); setPage(1) }

  async function saveEdit() {
    if (!editRow) return
    if (!confirm('Are you sure you want to update this record?')) return

    const wIn = Number(editRow.weight_in)
    const wOut = Number(editRow.weight_out)
    const doW = Number(editRow.do_weight)
    const actual = wIn - wOut
    const target = wIn - doW
    const diff = doW > 0 ? actual - doW : 0
    const diffPct = doW > 0 ? (diff / doW) * 100 : 0

    const { error } = await supabase.from('cement_weight_in').update({
      weigh_date: editRow.weigh_date,
      lorry_no: editRow.lorry_no,
      do_number: editRow.do_number,
      supplier: editRow.supplier,
      material_id: editRow.material_id,
      plant_id: editRow.plant_id,
      do_weight: doW,
      weight_in: wIn,
      weight_out: wOut,
      difference: diff,
      difference_pct: diffPct,
      target_weight_out: target,
    }).eq('id', editRow.id)

    if (error) { alert('Error updating record: ' + error.message); return }
    alert('Record updated!')
    setEditRow(null)
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><ScrollText className="w-7 h-7 text-blue-600" /> Incoming Records</h1>

      <div className="bg-white border rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input type="date" value={filters.date} onChange={e => setFilters({ ...filters, date: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Plant</label>
          <select value={filters.plant_id} onChange={e => setFilters({ ...filters, plant_id: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm bg-white">
            <option value="">All Plants</option>
            {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
          <select value={filters.material_id} onChange={e => setFilters({ ...filters, material_id: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm bg-white">
            <option value="">All Materials</option>
            {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Supplier</label>
          <select value={filters.supplier} onChange={e => setFilters({ ...filters, supplier: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm bg-white">
            <option value="">All Suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <button onClick={search} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700">Search</button>
        <button onClick={reset} className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200">Reset</button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plant</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle / DO</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier / Material</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight In</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight Out</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actual</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">DO Weight</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diff %</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map(r => {
              const actual = r.weight_in != null && r.weight_out != null ? r.weight_in - r.weight_out : null
              const diffPct = actual !== null && r.do_weight ? ((actual - r.do_weight) / r.do_weight) * 100 : null
              const photoPath = r.file1_path || r.file2_path
              const photoUrl = photoPath ? photoUrls[photoPath] : null
              return (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditRow(r)}>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    {photoUrl ? (
                      <img src={photoUrl} onClick={() => setViewImage(photoUrl)} className="w-12 h-12 object-cover rounded-lg border cursor-pointer" />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-400 text-center">No Photo</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">{r.weigh_date}</td>
                  <td className="px-3 py-3 text-sm font-medium whitespace-nowrap">{r.plant_name || '-'}</td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">
                    <div className="font-semibold">{r.lorry_no}</div>
                    <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-800 rounded-full px-2 py-0.5">DO: {r.do_number || '-'}</span>
                  </td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">
                    <div className="font-medium">{r.supplier || '-'}</div>
                    <div className="text-xs text-gray-500">{r.material || '-'}</div>
                  </td>
                  <td className="px-3 py-3 text-sm font-medium whitespace-nowrap">{r.weight_in?.toLocaleString() ?? '-'}</td>
                  <td className="px-3 py-3 text-sm font-medium whitespace-nowrap">{r.weight_out?.toLocaleString() ?? '-'}</td>
                  <td className="px-3 py-3 text-sm font-medium whitespace-nowrap">{actual !== null ? actual.toLocaleString() : '-'}</td>
                  <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">{r.do_weight?.toLocaleString() ?? '-'}</td>
                  <td className={`px-3 py-3 text-sm font-bold whitespace-nowrap ${diffPct === null ? 'text-gray-400' : diffPct > 0 ? 'text-green-600' : diffPct < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {diffPct !== null ? diffPct.toFixed(2) + '%' : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap"><span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 text-xs">{r.weight_out_operator || 'Unknown'}</span></td>
                </tr>
              )
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-500">No records found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-6 mt-6">
        <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="bg-gray-100 disabled:opacity-40 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200">Previous</button>
        <span className="text-sm font-semibold text-gray-700">Page {page}</span>
        <button disabled={rows.length < LIMIT} onClick={() => setPage(p => p + 1)} className="bg-gray-100 disabled:opacity-40 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200">Next</button>
      </div>

      {viewImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
          <img src={viewImage} className="max-w-[90%] max-h-[90%] rounded-xl" />
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit Record</h2>
              <button onClick={() => setEditRow(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" value={editRow.weigh_date} onChange={e => setEditRow({ ...editRow, weigh_date: e.target.value })} className="w-full border rounded-md px-2 py-1.5 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Plant</label>
                <select value={editRow.plant_id ?? ''} onChange={e => setEditRow({ ...editRow, plant_id: Number(e.target.value) || null })} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option value="">(None)</option>
                  {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Lorry No</label><input value={editRow.lorry_no} onChange={e => setEditRow({ ...editRow, lorry_no: e.target.value })} className="w-full border rounded-md px-2 py-1.5 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">DO Number</label><input value={editRow.do_number ?? ''} onChange={e => setEditRow({ ...editRow, do_number: e.target.value })} className="w-full border rounded-md px-2 py-1.5 text-sm" /></div>
              <div className="col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Supplier</label><input value={editRow.supplier ?? ''} onChange={e => setEditRow({ ...editRow, supplier: e.target.value })} className="w-full border rounded-md px-2 py-1.5 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
                <select value={editRow.material_id ?? ''} onChange={e => setEditRow({ ...editRow, material_id: Number(e.target.value) || null })} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option value="">(None)</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">DO Weight</label><input type="number" value={editRow.do_weight ?? ''} onChange={e => setEditRow({ ...editRow, do_weight: Number(e.target.value) })} className="w-full border rounded-md px-2 py-1.5 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Weight In</label><input type="number" value={editRow.weight_in ?? ''} onChange={e => setEditRow({ ...editRow, weight_in: Number(e.target.value) })} className="w-full border rounded-md px-2 py-1.5 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Weight Out</label><input type="number" value={editRow.weight_out ?? ''} onChange={e => setEditRow({ ...editRow, weight_out: Number(e.target.value) })} className="w-full border rounded-md px-2 py-1.5 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditRow(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={saveEdit} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
