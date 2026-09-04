'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Scale, Archive, ArchiveRestore } from 'lucide-react'

type Row = {
  id: number
  weigh_date: string
  lorry_no: string
  do_number: string
  material: string | null
  plant_id: number | null
  plant_name: string | null
  discharge_to: string | null
  do_weight: number
  weight_in: number
  archived_at: string | null
  archived_by: string | null
}

const SELECT_COLS = 'id, weigh_date, lorry_no, do_number, material, plant_id, discharge_to, do_weight, weight_in, archived_at, archived_by, cement_plants(name), cement_materials(name)'

function mapRows(data: any[] | null): Row[] {
  return (data || []).map((r: any) => ({
    ...r,
    plant_name: r.cement_plants?.name ?? null,
    material: r.cement_materials?.name ?? r.material,
  }))
}

export default function WeightOutPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [showArchived, setShowArchived] = useState(false)
  const [archivedRows, setArchivedRows] = useState<Row[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('cement_weight_in')
      .select(SELECT_COLS)
      .not('unload_complete_time', 'is', null)
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
      .not('unload_complete_time', 'is', null)
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

  function diffFor(r: Row) {
    const weightOut = Number(inputs[r.id])
    if (!weightOut) return null
    const target = r.weight_in - r.do_weight
    const diff = weightOut - target
    const diffPct = r.do_weight ? (diff / r.do_weight) * 100 : 0
    return { diff, diffPct }
  }

  async function submit(r: Row) {
    const weightOut = Number(inputs[r.id])
    if (!weightOut || weightOut <= 0) { alert('Invalid weight'); return }
    if (weightOut > r.weight_in) { alert('Weight Out cannot exceed Weight In'); return }

    const target = r.weight_in - r.do_weight
    const diff = weightOut - target
    const diffPct = r.do_weight ? diff / r.do_weight : 0

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).single()
    const operatorName = profile?.full_name || user?.email || 'unknown'

    const { error } = await supabase.from('cement_weight_in').update({
      target_weight_out: target,
      weight_out: weightOut,
      difference: diff,
      difference_pct: diffPct,
      weight_out_operator: operatorName,
      weight_out_time: new Date().toISOString(),
    }).eq('id', r.id)

    if (error) { alert('Failed to save Weight Out: ' + error.message); return }
    alert('✅ Weight Out completed')
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Scale className="w-7 h-7 text-blue-600" /> Weight Out</h1>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DO No</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plant</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Discharge To</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DO Weight</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight In</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target WO</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight Out</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diff</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diff %</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map(r => {
              const target = r.weight_in - r.do_weight
              const d = diffFor(r)
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.weigh_date}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.lorry_no}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.do_number}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.material || '-'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.plant_name || '-'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.discharge_to || '-'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.do_weight}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.weight_in}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{target}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <input
                      type="number" min={1} className="w-24 border rounded-md px-2 py-1.5 text-sm"
                      value={inputs[r.id] || ''}
                      onChange={e => setInputs({ ...inputs, [r.id]: e.target.value })}
                    />
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${d ? (d.diff > 0 ? 'text-green-600' : d.diff < 0 ? 'text-red-600' : '') : ''}`}>
                    {d ? d.diff.toFixed(2) : '–'}
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${d ? (d.diffPct > 0 ? 'text-green-600' : d.diffPct < 0 ? 'text-red-600' : '') : ''}`}>
                    {d ? d.diffPct.toFixed(2) + '%' : '–'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button onClick={() => submit(r)} className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700">Weight Out</button>
                      <button onClick={() => archiveRow(r.id)} title="Archive — stuck/abandoned load, hide from this queue" className="text-gray-400 hover:text-amber-600 p-1.5"><Archive className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={13} className="px-4 py-6 text-center text-gray-500">No pending Weight Out</td></tr>
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
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">DO No</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Material</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Plant</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Discharge To</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">DO Weight</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Weight In</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-amber-50">
              {archivedRows.map(r => (
                <tr key={r.id} className="hover:bg-amber-50/50">
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.weigh_date}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.lorry_no}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.do_number}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.material || '-'}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.plant_name || '-'}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.discharge_to || '-'}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.do_weight}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.weight_in}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button onClick={() => unarchiveRow(r.id)} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-200"><ArchiveRestore className="w-3.5 h-3.5" /> Unarchive</button>
                      <span className="text-[11px] text-gray-400">by {r.archived_by || '-'}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {!loadingArchived && archivedRows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">No archived loads</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
