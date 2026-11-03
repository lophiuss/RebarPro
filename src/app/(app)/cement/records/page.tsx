'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ScrollText, X, Download, Filter, ArrowUpDown, ArrowUp, ArrowDown, Search, RotateCcw } from 'lucide-react'

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

function HeaderCell({
  title,
  colKey,
  currentSortKey,
  currentSortDir,
  onSort,
  isFiltered,
  children,
  align = 'left',
}: {
  title: string
  colKey?: string
  currentSortKey?: string | null
  currentSortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  isFiltered?: boolean
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  const [open, setOpen] = useState(false)
  const isSorted = colKey && currentSortKey === colKey

  return (
    <th className={`px-3 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider relative select-none whitespace-nowrap ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      <div className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        {colKey && onSort ? (
          <button
            type="button"
            onClick={() => onSort(colKey)}
            className="flex items-center gap-1 hover:text-blue-600 transition cursor-pointer"
            title={`Sort by ${title}`}
          >
            <span>{title}</span>
            {isSorted ? (
              currentSortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
            ) : (
              <ArrowUpDown className="w-3 h-3 text-slate-300 hover:text-slate-500" />
            )}
          </button>
        ) : (
          <span>{title}</span>
        )}

        {children && (
          <div className="relative">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
              className={`p-1 rounded hover:bg-slate-200 transition cursor-pointer ${
                isFiltered ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
              title={`Filter by ${title}`}
            >
              <Filter className={`w-3 h-3 ${isFiltered ? 'fill-blue-600 text-blue-600' : ''}`} />
            </button>

            {open && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-3 min-w-[210px] text-left normal-case tracking-normal">
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800">Filter {title}</span>
                    <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {children}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </th>
  )
}

export default function RecordsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [plants, setPlants] = useState<{ id: number; name: string }[]>([])
  const [materials, setMaterials] = useState<{ id: number; name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ date: '', plant_id: '', material_id: '', supplier: '' })
  const [sortKey, setSortKey] = useState<string | null>('weigh_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [headerFilters, setHeaderFilters] = useState({ plant: '', material: '', supplier: '', vehicle: '', operator: '' })
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

  const EXPORT_LIMIT = 5000

  async function exportExcel() {
    let q = supabase
      .from('cement_weight_in')
      .select('lorry_no, weigh_date, plant_id, material_id, material, supplier, do_number, do_weight, weight_in, weight_out, weight_out_operator, cement_plants(name), cement_materials(name)')
      .not('weight_out', 'is', null)
      .order('weight_out_time', { ascending: false })
      .limit(EXPORT_LIMIT)

    if (filters.date) q = q.eq('weigh_date', filters.date)
    if (filters.plant_id) q = q.eq('plant_id', filters.plant_id)
    if (filters.material_id) q = q.eq('material_id', filters.material_id)
    if (filters.supplier) q = q.eq('supplier', filters.supplier)

    const { data, error } = await q
    if (error) { alert('Error exporting: ' + error.message); return }

    const headers = ['Date', 'Plant', 'Lorry No', 'DO Number', 'Supplier', 'Material', 'Weight In', 'Weight Out', 'Actual', 'DO Weight', 'Diff %', 'Operator']
    const csvRows = (data || []).map((r: any) => {
      const actual = r.weight_in != null && r.weight_out != null ? r.weight_in - r.weight_out : null
      const diffPct = actual !== null && r.do_weight ? ((actual - r.do_weight) / r.do_weight) * 100 : null
      return [
        r.weigh_date, r.cement_plants?.name ?? '-', r.lorry_no, r.do_number ?? '', r.supplier ?? '',
        r.cement_materials?.name ?? r.material ?? '', r.weight_in ?? '', r.weight_out ?? '',
        actual ?? '', r.do_weight ?? '', diffPct !== null ? diffPct.toFixed(2) + '%' : '', r.weight_out_operator ?? '',
      ]
    })
    const csv = [headers, ...csvRows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cement_records${filters.date ? '_' + filters.date : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'weigh_date' || key === 'weight_in' || key === 'actual' ? 'desc' : 'asc')
    }
  }

  function clearHeaderFilters() {
    setHeaderFilters({ plant: '', material: '', supplier: '', vehicle: '', operator: '' })
  }

  const activeHeaderFiltersCount = Object.values(headerFilters).filter(Boolean).length

  const sortedAndFilteredRows = useMemo(() => {
    let list = [...rows]
    if (headerFilters.plant) list = list.filter(r => (r.plant_name || '').toLowerCase().includes(headerFilters.plant.toLowerCase()))
    if (headerFilters.material) list = list.filter(r => (r.material || '').toLowerCase().includes(headerFilters.material.toLowerCase()))
    if (headerFilters.supplier) list = list.filter(r => (r.supplier || '').toLowerCase().includes(headerFilters.supplier.toLowerCase()))
    if (headerFilters.vehicle) {
      const v = headerFilters.vehicle.toLowerCase()
      list = list.filter(r => (r.lorry_no || '').toLowerCase().includes(v) || (r.do_number || '').toLowerCase().includes(v))
    }
    if (headerFilters.operator) list = list.filter(r => (r.weight_out_operator || '').toLowerCase().includes(headerFilters.operator.toLowerCase()))

    if (sortKey) {
      list.sort((a, b) => {
        let valA: any = (a as any)[sortKey]
        let valB: any = (b as any)[sortKey]
        if (sortKey === 'actual') {
          valA = (a.weight_in != null && a.weight_out != null) ? (a.weight_in - a.weight_out) : -Infinity
          valB = (b.weight_in != null && b.weight_out != null) ? (b.weight_in - b.weight_out) : -Infinity
        } else if (sortKey === 'diffPct') {
          const actA = (a.weight_in != null && a.weight_out != null) ? (a.weight_in - a.weight_out) : null
          const actB = (b.weight_in != null && b.weight_out != null) ? (b.weight_in - b.weight_out) : null
          valA = (actA !== null && a.do_weight) ? ((actA - a.do_weight) / a.do_weight) : -Infinity
          valB = (actB !== null && b.do_weight) ? ((actB - b.do_weight) / b.do_weight) : -Infinity
        }
        if (valA == null) return 1
        if (valB == null) return -1
        if (typeof valA === 'string') {
          return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
        }
        return sortDir === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1)
      })
    }
    return list
  }, [rows, headerFilters, sortKey, sortDir])

  function renderMobileCard(r: Row) {
    const actual = r.weight_in != null && r.weight_out != null ? r.weight_in - r.weight_out : null
    const diffPct = actual !== null && r.do_weight ? ((actual - r.do_weight) / r.do_weight) * 100 : null
    const photoPath = r.file1_path || r.file2_path
    const photoUrl = photoPath ? photoUrls[photoPath] : null

    return (
      <div
        key={r.id}
        onClick={() => setEditRow(r)}
        className="bg-white border rounded-xl p-3.5 shadow-sm space-y-2.5 hover:border-blue-300 transition cursor-pointer active:bg-slate-50"
      >
        <div className="flex items-start gap-3">
          {/* Photo */}
          <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
            {photoUrl ? (
              <img
                src={photoUrl}
                onClick={() => setViewImage(photoUrl)}
                className="w-14 h-14 object-cover rounded-lg border cursor-zoom-in shadow-xs"
                alt="Ticket"
              />
            ) : (
              <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-400 text-center font-medium">
                No Photo
              </div>
            )}
          </div>

          {/* Core Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="font-extrabold text-base text-slate-900 truncate">{r.lorry_no}</span>
              <span className="text-xs text-slate-500 flex-shrink-0">{r.weigh_date}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[11px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded">
                DO: {r.do_number || '—'}
              </span>
              <span className="text-[11px] bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded">
                {r.plant_name || '—'}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 truncate">
              {r.supplier || '—'} · <span className="font-medium text-slate-700">{r.material || '—'}</span>
            </div>
          </div>
        </div>

        {/* Weights Grid */}
        <div className="grid grid-cols-3 gap-1.5 bg-slate-50 p-2 rounded-lg text-center border border-slate-100 text-xs">
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold block">In</span>
            <span className="font-bold text-slate-800">{r.weight_in?.toLocaleString() ?? '-'}</span>
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold block">Out</span>
            <span className="font-bold text-slate-800">{r.weight_out?.toLocaleString() ?? '-'}</span>
          </div>
          <div>
            <span className="text-[10px] text-blue-600 uppercase font-semibold block">Actual</span>
            <span className="font-extrabold text-blue-700">{actual !== null ? actual.toLocaleString() : '-'}</span>
          </div>
        </div>

        {/* DO Weight & Diff % & Operator */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
          <div className="text-slate-600">
            DO: <span className="font-semibold text-slate-800">{r.do_weight?.toLocaleString() ?? '-'} MT</span>
            <span className={`ml-2 font-bold ${diffPct === null ? 'text-gray-400' : diffPct > 0 ? 'text-green-600' : diffPct < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              ({diffPct !== null ? `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(2)}%` : '—'})
            </span>
          </div>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium truncate max-w-[120px]">
            {r.weight_out_operator || 'Operator'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><ScrollText className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" /> Incoming Records</h1>
        <div className="flex items-center gap-2">
          {activeHeaderFiltersCount > 0 && (
            <button
              onClick={clearHeaderFilters}
              className="flex items-center gap-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Column Filters ({activeHeaderFiltersCount})</span>
            </button>
          )}
          <button onClick={exportExcel} className="flex items-center gap-1.5 bg-green-600 text-white text-xs sm:text-sm font-semibold px-3 py-1.5 sm:py-2 rounded-lg hover:bg-green-700 cursor-pointer">
            <Download className="w-4 h-4" /> Export Excel
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex flex-wrap gap-2.5 sm:gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input type="date" value={filters.date} onChange={e => setFilters({ ...filters, date: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm bg-white" />
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
        <button onClick={search} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer">Search</button>
        <button onClick={reset} className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 cursor-pointer">Reset</button>
      </div>

      {/* Mobile Card List View (md:hidden) */}
      <div className="space-y-3 md:hidden">
        {sortedAndFilteredRows.map(r => renderMobileCard(r))}
        {!loading && sortedAndFilteredRows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400 bg-white border rounded-xl shadow-sm">No records found.</p>
        )}
      </div>

      {/* Desktop Table View with Sort & Filter Header (hidden md:block) */}
      <div className="hidden md:block bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Photo</th>

              <HeaderCell title="Date" colKey="weigh_date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} />

              <HeaderCell title="Plant" colKey="plant_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} isFiltered={Boolean(headerFilters.plant)}>
                <select
                  value={headerFilters.plant}
                  onChange={e => setHeaderFilters(f => ({ ...f, plant: e.target.value }))}
                  className="w-full border rounded-md px-2 py-1 text-xs bg-white"
                >
                  <option value="">All Plants</option>
                  {plants.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </HeaderCell>

              <HeaderCell title="Vehicle / DO" colKey="lorry_no" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} isFiltered={Boolean(headerFilters.vehicle)}>
                <input
                  placeholder="Filter lorry or DO..."
                  value={headerFilters.vehicle}
                  onChange={e => setHeaderFilters(f => ({ ...f, vehicle: e.target.value }))}
                  className="w-full border rounded-md px-2 py-1 text-xs"
                />
              </HeaderCell>

              <HeaderCell title="Supplier / Material" colKey="supplier" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} isFiltered={Boolean(headerFilters.supplier || headerFilters.material)}>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase font-semibold mb-0.5">Supplier</label>
                    <select
                      value={headerFilters.supplier}
                      onChange={e => setHeaderFilters(f => ({ ...f, supplier: e.target.value }))}
                      className="w-full border rounded-md px-2 py-1 text-xs bg-white"
                    >
                      <option value="">All Suppliers</option>
                      {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase font-semibold mb-0.5">Material</label>
                    <select
                      value={headerFilters.material}
                      onChange={e => setHeaderFilters(f => ({ ...f, material: e.target.value }))}
                      className="w-full border rounded-md px-2 py-1 text-xs bg-white"
                    >
                      <option value="">All Materials</option>
                      {materials.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              </HeaderCell>

              <HeaderCell title="Weight In" colKey="weight_in" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} align="right" />

              <HeaderCell title="Weight Out" colKey="weight_out" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} align="right" />

              <HeaderCell title="Actual" colKey="actual" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} align="right" />

              <HeaderCell title="DO Weight" colKey="do_weight" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} align="right" />

              <HeaderCell title="Diff %" colKey="diffPct" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} align="right" />

              <HeaderCell title="Operator" colKey="weight_out_operator" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} isFiltered={Boolean(headerFilters.operator)}>
                <input
                  placeholder="Filter operator name..."
                  value={headerFilters.operator}
                  onChange={e => setHeaderFilters(f => ({ ...f, operator: e.target.value }))}
                  className="w-full border rounded-md px-2 py-1 text-xs"
                />
              </HeaderCell>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedAndFilteredRows.map(r => {
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
                  <td className="px-3 py-3 text-sm font-medium whitespace-nowrap text-right">{r.weight_in?.toLocaleString() ?? '-'}</td>
                  <td className="px-3 py-3 text-sm font-medium whitespace-nowrap text-right">{r.weight_out?.toLocaleString() ?? '-'}</td>
                  <td className="px-3 py-3 text-sm font-bold whitespace-nowrap text-right">{actual !== null ? actual.toLocaleString() : '-'}</td>
                  <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap text-right">{r.do_weight?.toLocaleString() ?? '-'}</td>
                  <td className={`px-3 py-3 text-sm font-bold whitespace-nowrap text-right ${diffPct === null ? 'text-gray-400' : diffPct > 0 ? 'text-green-600' : diffPct < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {diffPct !== null ? `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(2)}%` : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap"><span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 text-xs">{r.weight_out_operator || 'Unknown'}</span></td>
                </tr>
              )
            })}
            {!loading && sortedAndFilteredRows.length === 0 && (
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
