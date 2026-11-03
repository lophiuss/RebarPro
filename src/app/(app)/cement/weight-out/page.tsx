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
    const { data: profile } = user
      ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      : { data: null }
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

  function renderMobileCard(r: Row, archived: boolean) {
    const target = r.weight_in - r.do_weight
    const d = diffFor(r)

    return (
      <div key={r.id} className="bg-white border rounded-xl p-3.5 shadow-sm space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="font-extrabold text-base text-slate-900 block">{r.lorry_no}</span>
            <span className="text-xs text-slate-500">{r.weigh_date} · DO: <span className="font-semibold text-slate-700">{r.do_number}</span></span>
          </div>
          {archived ? (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Archived</span>
          ) : (
            <button
              onClick={() => archiveRow(r.id)}
              title="Archive load"
              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg border border-slate-200 transition cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Location & Material Tags */}
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="bg-blue-50 text-blue-800 font-semibold px-2 py-0.5 rounded">Plant: {r.plant_name || '—'}</span>
          <span className="bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded">Mat: {r.material || '—'}</span>
          <span className="bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.5 rounded">Silo: {r.discharge_to || '—'}</span>
        </div>

        {/* Weights Comparison Grid */}
        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg text-center border border-slate-100">
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold block">Weight In</span>
            <span className="text-xs font-bold text-slate-800">{r.weight_in.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold block">DO Weight</span>
            <span className="text-xs font-bold text-slate-800">{r.do_weight.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[10px] text-blue-600 uppercase font-semibold block">Target WO</span>
            <span className="text-xs font-extrabold text-blue-700">{target.toLocaleString()}</span>
          </div>
        </div>

        {/* Input and Action */}
        {!archived ? (
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Weight Out (Kg)</label>
                <input
                  type="number" min={1}
                  placeholder="Enter weight out"
                  className="w-full border rounded-lg px-3 py-2 text-sm font-semibold bg-white"
                  value={inputs[r.id] || ''}
                  onChange={e => setInputs({ ...inputs, [r.id]: e.target.value })}
                />
              </div>
              {d && (
                <div className="text-right pt-4 flex-shrink-0">
                  <div className={`text-xs font-bold ${d.diff > 0 ? 'text-green-600' : d.diff < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                    Diff: {d.diff > 0 ? '+' : ''}{d.diff.toFixed(1)}
                  </div>
                  <div className={`text-[11px] font-semibold ${d.diffPct > 0 ? 'text-green-600' : d.diffPct < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                    ({d.diffPct.toFixed(2)}%)
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => submit(r)}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm py-2.5 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Scale className="w-4 h-4" />
              <span>Submit Weight Out</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => unarchiveRow(r.id)}
            className="w-full flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 font-semibold text-xs py-2 rounded-lg hover:bg-slate-200 cursor-pointer"
          >
            <ArchiveRestore className="w-3.5 h-3.5" />
            <span>Unarchive Load</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Scale className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" /> Weight Out</h1>
        <button onClick={toggleArchived} className={`flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3 py-1.5 sm:py-2 rounded-lg cursor-pointer ${showArchived ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
          <Archive className="w-4 h-4" /> {showArchived ? 'Hide' : 'View'} Archived
        </button>
      </div>

      {/* Mobile Weight Out Cards */}
      <div className="space-y-3 md:hidden">
        {rows.map(r => renderMobileCard(r, false))}
        {!loading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400 bg-white border rounded-xl shadow-sm">No pending Weight Out</p>
        )}
      </div>

      {/* Desktop 13-Column Table */}
      <div className="hidden md:block bg-white border rounded-xl shadow-sm overflow-x-auto">
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
                  <td className="px-4 py-3 text-sm whitespace-nowrap font-medium">{r.lorry_no}</td>
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
                      <button onClick={() => submit(r)} className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 cursor-pointer">Weight Out</button>
                      <button onClick={() => archiveRow(r.id)} title="Archive load" className="text-gray-400 hover:text-amber-600 p-1.5 cursor-pointer"><Archive className="w-3.5 h-3.5" /></button>
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
        <div className="mt-6">
          <div className="px-1 py-2 mb-2">
            <h2 className="text-sm font-bold text-amber-800">Archived Loads</h2>
          </div>

          {/* Mobile Archived Cards */}
          <div className="space-y-3 md:hidden">
            {archivedRows.map(r => renderMobileCard(r, true))}
            {!loadingArchived && archivedRows.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-gray-400 bg-amber-50/50 border border-amber-200 rounded-xl">No archived loads</p>
            )}
          </div>

          {/* Desktop Archived Table */}
          <div className="hidden md:block bg-amber-50 border border-amber-200 rounded-xl shadow-sm overflow-x-auto">
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
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap font-medium">{r.lorry_no}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.do_number}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.material || '-'}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.plant_name || '-'}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.discharge_to || '-'}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.do_weight}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">{r.weight_in}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button onClick={() => unarchiveRow(r.id)} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-200 cursor-pointer"><ArchiveRestore className="w-3.5 h-3.5" /> Unarchive</button>
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
        </div>
      )}
    </div>
  )
}
