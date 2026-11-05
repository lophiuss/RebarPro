'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Trash2, CheckCircle, Filter } from 'lucide-react'
import { naturalSort } from '@/lib/utils/sort'
import { toTonnes, fmtQtyNum, unitLabel, type DefaultUnit } from '@/lib/utils/unit'

export default function StockTakePage() {
  const [stockTakes, setStockTakes] = useState<any[]>([])
  const [projectTypes, setProjectTypes] = useState<any[]>([])
  const [sizes, setSizes] = useState<any[]>([])
  const [unit, setUnit] = useState<DefaultUnit>('kg')
  const [theoreticalBalances, setTheoreticalBalances] = useState<Record<string, number>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [knownSuppliers, setKnownSuppliers] = useState<string[]>([])
  const [tableFilterSupplier, setTableFilterSupplier] = useState<string>('all')
  
  // Form State
  const [projectTypeId, setProjectTypeId] = useState('')
  const [supplier, setSupplier] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [sizeInputs, setSizeInputs] = useState<Record<string, string>>({})
  const [isCalculating, setIsCalculating] = useState(false)

  const supabase = createClient()
  const uLabel = unitLabel(unit)

  function showSuccess(msg: string) {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 5000)
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (projectTypeId && sizes.length > 0) {
      loadTheoreticalBalances(projectTypeId, date, sizes, supplier)
    }
  }, [projectTypeId, date, sizes, supplier])

  async function fetchData() {
    const [stRes, pTypesRes, sizeRes, settingsRes, txSupRes] = await Promise.all([
      supabase.from('stock_takes').select('*, rebar_sizes(size), project_types(name)').order('stock_take_date', { ascending: false }),
      supabase.from('project_types').select('*'),
      supabase.from('rebar_sizes').select('*'),
      supabase.from('global_settings').select('default_unit').eq('id', 1).maybeSingle(),
      supabase.from('transactions').select('supplier').not('supplier', 'is', null)
    ])
    
    if (settingsRes.data?.default_unit) {
      setUnit(settingsRes.data.default_unit as DefaultUnit)
    }

    if (stRes.data) setStockTakes(stRes.data)

    // Build known suppliers list from both stock takes and transactions
    const supSet = new Set<string>()
    ;(stRes.data || []).forEach((st: any) => {
      if (st.supplier && String(st.supplier).trim()) supSet.add(String(st.supplier).trim())
    })
    ;(txSupRes.data || []).forEach((t: any) => {
      if (t.supplier && String(t.supplier).trim()) supSet.add(String(t.supplier).trim())
    })
    setKnownSuppliers(Array.from(supSet).sort())

    if (pTypesRes.data) {
      const sortedPT = naturalSort(pTypesRes.data, pt => pt.name)
      setProjectTypes(sortedPT)
      if (sortedPT.length > 0 && !projectTypeId) setProjectTypeId(sortedPT[0].id)
    }
    if (sizeRes.data) {
      setSizes(naturalSort(sizeRes.data, s => s.size))
    }
  }

  async function logAudit(action: string, recordId: string, oldData: any, newData: any) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_log').insert([{
      table_name: 'stock_takes',
      record_id: recordId,
      action,
      old_data: oldData,
      new_data: newData,
      changed_by: user?.id
    }])
  }

  async function loadTheoreticalBalances(forProjectTypeId: string, forDate: string, allSizes: any[], forSupplier?: string) {
    if (!forProjectTypeId || !forDate || allSizes.length === 0) return

    const { data: pTypeProjects } = await supabase.from('projects').select('id').eq('project_type_id', forProjectTypeId)
    const pTypeProjectIds = (pTypeProjects || []).map(p => p.id)

    const balances: Record<string, number> = {}
    const trimmedSupplier = (forSupplier !== undefined ? forSupplier : supplier)?.trim() || ''

    for (const s of allSizes) {
      let stQuery = supabase
        .from('stock_takes')
        .select('physical_count, stock_take_date')
        .eq('project_type_id', forProjectTypeId)
        .eq('size_id', s.id)
        .lt('stock_take_date', forDate)

      if (trimmedSupplier) {
        stQuery = stQuery.eq('supplier', trimmedSupplier)
      }

      const { data: priorSTs } = await stQuery
        .order('stock_take_date', { ascending: false })
        .limit(1)

      const latestPriorST = priorSTs?.[0]
      const baseCount = latestPriorST ? Number(latestPriorST.physical_count) : 0
      const anchorDate = latestPriorST ? latestPriorST.stock_take_date : '1970-01-01'

      let txQuery1 = supabase
        .from('transactions')
        .select('quantity, supplier')
        .eq('project_type_id', forProjectTypeId)
        .eq('size_id', s.id)
        .gt('transaction_date', anchorDate)
        .lte('transaction_date', forDate)

      if (trimmedSupplier) {
        txQuery1 = txQuery1.eq('supplier', trimmedSupplier)
      }

      const { data: txs1 } = await txQuery1

      let txs2: any[] = []
      if (pTypeProjectIds.length > 0) {
        let txQuery2 = supabase
          .from('transactions')
          .select('quantity, supplier')
          .in('project_id', pTypeProjectIds)
          .eq('size_id', s.id)
          .gt('transaction_date', anchorDate)
          .lte('transaction_date', forDate)

        if (trimmedSupplier) {
          txQuery2 = txQuery2.eq('supplier', trimmedSupplier)
        }

        const { data: projTxs } = await txQuery2
        txs2 = projTxs || []
      }

      const txSum = (txs1 || []).concat(txs2).reduce((sum: number, tx: any) => sum + Number(tx.quantity), 0)
      balances[s.id] = baseCount + txSum
    }
    
    setTheoreticalBalances(balances)
  }

  async function addStockTake(e: React.FormEvent) {
    e.preventDefault()
    setIsCalculating(true)
    
    const entriesToProcess = Object.entries(sizeInputs).filter(([_, val]) => val.trim() !== '')
    
    if (entriesToProcess.length === 0) {
      alert("Please enter a physical count for at least one size.")
      setIsCalculating(false)
      return
    }

    const trimmedSup = supplier.trim() || null
    let savedCount = 0
    for (const [sizeId, val] of entriesToProcess) {
      const inputCount = parseFloat(val)
      const countTonnes = toTonnes(inputCount, unit)
      const systemBalanceTonnes = theoreticalBalances[sizeId] ?? 0
      const varianceTonnes = countTonnes - systemBalanceTonnes

      const { data, error } = await supabase.from('stock_takes').insert([{
        project_type_id: projectTypeId,
        size_id: sizeId,
        supplier: trimmedSup,
        stock_take_date: date,
        physical_count: countTonnes,
        system_balance: systemBalanceTonnes,
        variance: varianceTonnes
      }]).select()

      if (!error && data) {
        await logAudit('insert', data[0].id, null, data[0])
        savedCount++
      }
    }

    setSizeInputs({})
    fetchData()
    setIsCalculating(false)
    if (savedCount > 0) {
      const typeName = projectTypes.find(pt => pt.id === projectTypeId)?.name || 'Unknown'
      const supLabel = trimmedSup ? ` [Supplier: ${trimmedSup}]` : ''
      showSuccess(`✓ Stock Take saved for ${typeName}${supLabel} on ${date} — ${savedCount} size${savedCount > 1 ? 's' : ''} recorded.`)
    }
  }

  async function deleteStockTakeGroup(groupDate: string, groupTypeId: string, groupSupplier: string | null) {
    const supLabel = groupSupplier ? ` for supplier "${groupSupplier}"` : ''
    if (!confirm(`Delete all stock takes for this group on ${groupDate}${supLabel}?`)) return
    
    const group = stockTakes.filter(st => {
      const dateMatch = st.stock_take_date === groupDate
      const typeMatch = (groupTypeId === 'unassigned' ? !st.project_type_id : (st.project_type_id === groupTypeId || st.project_type === groupTypeId))
      const supMatch = groupSupplier ? (st.supplier === groupSupplier) : (!st.supplier)
      return dateMatch && typeMatch && supMatch
    })
    const ids = group.map(st => st.id)
    
    if (ids.length > 0) {
      const { error } = await supabase.from('stock_takes').delete().in('id', ids)
      if (error) {
        alert('Error deleting stock take: ' + error.message)
        return
      }
      for (const st of group) {
        await logAudit('delete', st.id, st, null)
      }
    }
    
    await fetchData()
    if (projectTypeId) {
      await loadTheoreticalBalances(projectTypeId, date, sizes, supplier)
    }
  }

  const groupedStockTakes: Record<string, any> = {}
  
  stockTakes.forEach(st => {
    // If supplier filter active in table, filter accordingly
    if (tableFilterSupplier !== 'all') {
      if (tableFilterSupplier === '__general__' && st.supplier) return
      if (tableFilterSupplier !== '__general__' && st.supplier !== tableFilterSupplier) return
    }

    const ptId = st.project_type_id || 'unassigned'
    const typeName = st.project_types?.name || (st.project_type ? st.project_type : 'Unassigned / Legacy')
    const supKey = st.supplier?.trim() || '__general__'
    const key = `${st.stock_take_date}_${ptId}_${supKey}`
    if (!groupedStockTakes[key]) {
      groupedStockTakes[key] = {
        date: st.stock_take_date,
        project_type_id: ptId,
        project_type_name: typeName,
        supplier: st.supplier?.trim() || null,
        sizes: {},
        total_physical: 0,
        total_variance: 0
      }
    }
    groupedStockTakes[key].sizes[st.size_id] = {
      physical: st.physical_count,
      variance: st.variance
    }
    groupedStockTakes[key].total_physical += Number(st.physical_count)
    groupedStockTakes[key].total_variance += Number(st.variance)
  })

  return (
    <div className="p-4 md:p-8 max-w-[92rem] mx-auto pb-20">
      <h1 className="text-3xl font-bold mb-6 text-slate-900">Monthly Stock Take</h1>

      {successMessage && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-300 text-green-800 rounded-xl px-5 py-4 shadow-sm">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}
      
      <form onSubmit={addStockTake} className="mb-8 border p-6 rounded-xl bg-white shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input 
              type="date" required value={date} 
              onChange={(e) => {
                setDate(e.target.value)
                loadTheoreticalBalances(projectTypeId, e.target.value, sizes, supplier)
              }} 
              className="w-full border rounded-md px-3 py-2 text-sm bg-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Project Type</label>
            <select 
              value={projectTypeId} 
              onChange={(e) => {
                setProjectTypeId(e.target.value)
                loadTheoreticalBalances(e.target.value, date, sizes, supplier)
              }} 
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            >
              {projectTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Supplier <span className="text-gray-400 font-normal">(Optional — leave blank for All/General)</span>
            </label>
            <input
              type="text"
              list="stock-take-suppliers-list"
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value)
                loadTheoreticalBalances(projectTypeId, date, sizes, e.target.value)
              }}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              placeholder="e.g. Ann Joo, Southern Steel, BRC... or blank"
            />
            <datalist id="stock-take-suppliers-list">
              {knownSuppliers.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>

        {/* Quick Supplier Suggestions */}
        {knownSuppliers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-5 text-xs">
            <span className="text-gray-500 font-medium">Quick Supplier:</span>
            <button
              type="button"
              onClick={() => {
                setSupplier('')
                loadTheoreticalBalances(projectTypeId, date, sizes, '')
              }}
              className={`px-2.5 py-1 rounded-full font-medium transition cursor-pointer ${
                supplier === '' ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All / General
            </button>
            {knownSuppliers.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSupplier(s)
                  loadTheoreticalBalances(projectTypeId, date, sizes, s)
                }}
                className={`px-2.5 py-1 rounded-full font-medium transition cursor-pointer ${
                  supplier === s ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mb-3 border-t pt-4 pb-2">
          <h3 className="font-medium text-sm text-gray-700">
            Enter Physical Count in {uLabel}
            {supplier && <span className="ml-2 font-bold text-blue-700">(Counting for: {supplier})</span>}
            <span className="text-xs text-gray-500 font-normal ml-2">— Theoretical system balance shown above each box</span>
          </h3>
          <button 
            type="button" 
            onClick={() => loadTheoreticalBalances(projectTypeId, date, sizes, supplier)} 
            className="text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer"
          >
            Refresh theoretical values
          </button>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          {sizes.map(s => {
            const theoretical = theoreticalBalances[s.id]
            const hasTheoretical = theoretical !== undefined
            return (
              <div key={s.id} className="flex flex-col">
                <span className="text-xs font-bold text-slate-700 mb-1">{s.size}</span>
                {hasTheoretical ? (
                  <div className="mb-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 font-medium text-center truncate" title={`Theoretical system balance: ${fmtQtyNum(Number(theoretical), unit)} ${uLabel}`}>
                    Sys: {fmtQtyNum(Number(theoretical), unit)} {uLabel}
                  </div>
                ) : (
                  <div className="mb-1 px-2 py-1 bg-gray-50 border border-dashed border-gray-200 rounded text-xs text-gray-400 text-center">
                    —
                  </div>
                )}
                <input 
                  type="number" 
                  step="0.01" 
                  value={sizeInputs[s.id] || ''} 
                  onChange={(e) => setSizeInputs({...sizeInputs, [s.id]: e.target.value})} 
                  className="w-full border rounded-md px-3 py-2 text-sm" 
                  placeholder={`Count (${uLabel})`} 
                />
              </div>
            )
          })}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isCalculating} className="w-44 cursor-pointer">
            {isCalculating ? 'Processing...' : 'Save Stock Take'}
          </Button>
        </div>
      </form>

      {/* Stock Take Records Table with Supplier Filter */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 sm:p-4 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">Stock Take Records</h2>
            <span className="bg-slate-200 text-slate-700 text-xs font-mono px-2 py-0.5 rounded-full">
              {Object.keys(groupedStockTakes).length} groups
            </span>
          </div>

          {/* Supplier filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              Filter by Supplier:
            </span>
            <select
              value={tableFilterSupplier}
              onChange={e => setTableFilterSupplier(e.target.value)}
              className="border rounded-md px-2.5 py-1 text-xs bg-white text-slate-700 font-medium"
            >
              <option value="all">All Suppliers & General</option>
              <option value="__general__">All / General Only</option>
              {knownSuppliers.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-20 w-28 min-w-[7rem] max-w-[7rem]">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-gray-200">Project Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-gray-200">Supplier</th>
                {sizes.map(s => (
                  <th key={s.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-l">
                    {s.size} <br/><span className="text-[10px] text-gray-400 font-normal">Count / Var ({uLabel})</span>
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase border-l bg-gray-100">Total Count ({uLabel})</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase bg-gray-100">Total Variance ({uLabel})</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.values(groupedStockTakes).map((group: any, i) => (
                <tr key={i} className="group hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap sticky left-0 z-10 w-28 min-w-[7rem] max-w-[7rem] bg-white group-hover:bg-gray-50">{group.date}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap border-r border-gray-200">{group.project_type_name}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap border-r border-gray-200">
                    {group.supplier ? (
                      <span className="font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs">
                        {group.supplier}
                      </span>
                    ) : (
                      <span className="text-gray-400 italic text-xs">All / General</span>
                    )}
                  </td>
                  
                  {sizes.map(s => {
                    const cell = group.sizes[s.id]
                    if (!cell) return <td key={s.id} className="px-4 py-3 text-center text-sm text-gray-300 border-l">-</td>
                    const physDisp = fmtQtyNum(Number(cell.physical), unit)
                    const varDisp = fmtQtyNum(Number(cell.variance), unit)
                    const v = Number(cell.variance)
                    return (
                      <td key={s.id} className="px-4 py-3 text-center text-sm border-l whitespace-nowrap">
                        <span className="font-medium">{physDisp}</span>
                        <br/>
                        <span className={`text-xs font-bold ${v < 0 ? 'text-red-500' : v > 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                          {v > 0 ? '+' : ''}{varDisp}
                        </span>
                      </td>
                    )
                  })}

                  <td className="px-4 py-3 text-center text-sm font-bold border-l bg-gray-50">{fmtQtyNum(group.total_physical, unit)}</td>
                  <td className={`px-4 py-3 text-center text-sm font-bold bg-gray-50 ${group.total_variance < 0 ? 'text-red-600' : group.total_variance > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                    {group.total_variance > 0 ? '+' : ''}{fmtQtyNum(group.total_variance, unit)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => deleteStockTakeGroup(group.date, group.project_type_id, group.supplier)} 
                      className="text-red-500 hover:text-red-700 p-1 cursor-pointer transition"
                      title="Delete this stock take group"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {Object.keys(groupedStockTakes).length === 0 && (
                <tr>
                  <td colSpan={sizes.length + 6} className="px-4 py-8 text-center text-gray-400 italic">
                    No stock take records found{tableFilterSupplier !== 'all' ? ' for this supplier filter' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
