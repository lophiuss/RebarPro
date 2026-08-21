'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Trash2, CheckCircle } from 'lucide-react'

export default function StockTakePage() {
  const [stockTakes, setStockTakes] = useState<any[]>([])
  const [projectTypes, setProjectTypes] = useState<any[]>([])
  const [sizes, setSizes] = useState<any[]>([])
  const [theoreticalBalances, setTheoreticalBalances] = useState<Record<string, number>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // Form State
  const [projectTypeId, setProjectTypeId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [sizeInputs, setSizeInputs] = useState<Record<string, string>>({})
  const [isCalculating, setIsCalculating] = useState(false)

  const supabase = createClient()

  function showSuccess(msg: string) {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 5000)
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (projectTypeId && sizes.length > 0) {
      loadTheoreticalBalances(projectTypeId, date, sizes)
    }
  }, [projectTypeId, date, sizes])

  async function fetchData() {
    const [stRes, pTypesRes, sizeRes] = await Promise.all([
      supabase.from('stock_takes').select('*, rebar_sizes(size), project_types(name)').order('stock_take_date', { ascending: false }),
      supabase.from('project_types').select('*').order('name'),
      supabase.from('rebar_sizes').select('*').order('size')
    ])
    
    if (stRes.data) setStockTakes(stRes.data)
    if (pTypesRes.data) {
      setProjectTypes(pTypesRes.data)
      if (pTypesRes.data.length > 0 && !projectTypeId) setProjectTypeId(pTypesRes.data[0].id)
    }
    if (sizeRes.data) {
      setSizes(sizeRes.data)
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

  // Load theoretical balances whenever date or projectTypeId changes
  async function loadTheoreticalBalances(forProjectTypeId: string, forDate: string, allSizes: any[]) {
    if (!forProjectTypeId || allSizes.length === 0) return
    
    const { data: projs } = await supabase.from('projects').select('id').eq('project_type_id', forProjectTypeId)
    const projectIds = (projs || []).map((p: any) => p.id)
    
    // Fetch latest prior stock takes for this project type strictly BEFORE forDate
    const { data: priorSTs } = await supabase
      .from('stock_takes')
      .select('size_id, physical_count, stock_take_date')
      .eq('project_type_id', forProjectTypeId)
      .lt('stock_take_date', forDate)
      .order('stock_take_date', { ascending: false })

    const balances: Record<string, number> = {}
    
    for (const s of allSizes) {
      const latestPrior = (priorSTs || []).find((st: any) => st.size_id === s.id)
      const anchorDate = latestPrior ? latestPrior.stock_take_date : null
      const baseCount = latestPrior ? Number(latestPrior.physical_count) : 0

      let q1 = supabase
        .from('transactions')
        .select('quantity')
        .eq('project_type_id', forProjectTypeId)
        .eq('size_id', s.id)
        .lte('transaction_date', forDate)
      
      if (anchorDate) {
        q1 = q1.gt('transaction_date', anchorDate)
      }

      const { data: txs1 } = await q1

      let txs2: any[] = []
      if (projectIds.length > 0) {
        let q2 = supabase
          .from('transactions')
          .select('quantity')
          .in('project_id', projectIds)
          .eq('size_id', s.id)
          .lte('transaction_date', forDate)
        
        if (anchorDate) {
          q2 = q2.gt('transaction_date', anchorDate)
        }

        const { data: res2 } = await q2
        if (res2) txs2 = res2
      }
      
      const txSum = (txs1 || []).concat(txs2).reduce((sum: number, tx: any) => sum + Number(tx.quantity), 0)
      balances[s.id] = baseCount + txSum
    }
    
    setTheoreticalBalances(balances)
  }

  async function addStockTake(e: React.FormEvent) {
    e.preventDefault()
    setIsCalculating(true)
    
    const entriesToProcess = Object.entries(sizeInputs).filter(([sizeId, val]) => val.trim() !== '')
    
    if (entriesToProcess.length === 0) {
      alert("Please enter a physical count for at least one size.")
      setIsCalculating(false)
      return
    }

    let savedCount = 0
    for (const [sizeId, val] of entriesToProcess) {
      const count = parseFloat(val)
      const systemBalance = theoreticalBalances[sizeId] ?? 0
      const variance = count - systemBalance

      const { data, error } = await supabase.from('stock_takes').insert([{
        project_type_id: projectTypeId,
        size_id: sizeId,
        stock_take_date: date,
        physical_count: count,
        system_balance: systemBalance,
        variance: variance
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
      showSuccess(`✓ Stock Take saved for ${typeName} on ${date} — ${savedCount} size${savedCount > 1 ? 's' : ''} recorded.`)
    }
  }

  async function deleteStockTakeGroup(groupDate: string, groupTypeId: string) {
    if (!confirm(`Delete all stock takes for this group on ${groupDate}?`)) return
    
    const group = stockTakes.filter(st => 
      st.stock_take_date === groupDate && 
      (groupTypeId === 'unassigned' ? !st.project_type_id : (st.project_type_id === groupTypeId || st.project_type === groupTypeId))
    )
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
      await loadTheoreticalBalances(projectTypeId, date, sizes)
    }
  }

  // Aggregate stock takes by Date + Project Type (including legacy/unassigned)
  const groupedStockTakes: Record<string, any> = {}
  
  stockTakes.forEach(st => {
    const ptId = st.project_type_id || 'unassigned'
    const typeName = st.project_types?.name || (st.project_type ? st.project_type : 'Unassigned / Legacy')
    const key = `${st.stock_take_date}_${ptId}`
    if (!groupedStockTakes[key]) {
      groupedStockTakes[key] = {
        date: st.stock_take_date,
        project_type_id: ptId,
        project_type_name: typeName,
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
    <div className="p-4 md:p-8 max-w-[90rem] mx-auto">
      <h1 className="text-3xl font-bold mb-6">Monthly Stock Take</h1>

      {/* Success Banner */}
      {successMessage && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-300 text-green-800 rounded-xl px-5 py-4 shadow-sm">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}
      
      <form onSubmit={addStockTake} className="mb-8 border p-6 rounded-xl bg-white shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input 
              type="date" required value={date} 
              onChange={(e) => {
                setDate(e.target.value)
                loadTheoreticalBalances(projectTypeId, e.target.value, sizes)
              }} 
              className="w-full border rounded-md px-3 py-2" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Project Type</label>
            <select 
              value={projectTypeId} 
              onChange={(e) => {
                setProjectTypeId(e.target.value)
                loadTheoreticalBalances(e.target.value, date, sizes)
              }} 
              className="w-full border rounded-md px-3 py-2 bg-white"
            >
              {projectTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3 border-b pb-2">
          <h3 className="font-medium text-sm text-gray-700">Enter Physical Count (Theoretical system balance shown above each box)</h3>
          <button 
            type="button" 
            onClick={() => loadTheoreticalBalances(projectTypeId, date, sizes)} 
            className="text-xs text-blue-600 hover:text-blue-800 underline"
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
                  <div className="mb-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 font-medium text-center">
                    System: {Number(theoretical).toFixed(2)}
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
                  placeholder="Physical count" 
                />
              </div>
            )
          })}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isCalculating} className="w-40">{isCalculating ? 'Processing...' : 'Save Stock Take'}</Button>
        </div>
      </form>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-10">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-24 bg-gray-50 z-10">Project Type</th>
              {sizes.map(s => (
                <th key={s.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-l">
                  {s.size} <br/><span className="text-[10px] text-gray-400 font-normal">Count / Var</span>
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase border-l bg-gray-100">Total Count</th>
              <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase bg-gray-100">Total Variance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.values(groupedStockTakes).map((group: any, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium whitespace-nowrap sticky left-0 bg-inherit">{group.date}</td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap sticky left-24 bg-inherit">{group.project_type_name}</td>
                
                {sizes.map(s => {
                  const cell = group.sizes[s.id]
                  if (!cell) return <td key={s.id} className="px-4 py-3 text-center text-sm text-gray-300 border-l">-</td>
                  return (
                    <td key={s.id} className="px-4 py-3 text-center text-sm border-l whitespace-nowrap">
                      <span className="font-medium">{Number(cell.physical).toFixed(2)}</span>
                      <br/>
                      <span className={`text-xs font-bold ${cell.variance < 0 ? 'text-red-500' : cell.variance > 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                        {cell.variance > 0 ? '+' : ''}{Number(cell.variance).toFixed(2)}
                      </span>
                    </td>
                  )
                })}

                <td className="px-4 py-3 text-center text-sm font-bold border-l bg-gray-50">{group.total_physical.toFixed(2)}</td>
                <td className={`px-4 py-3 text-center text-sm font-bold bg-gray-50 ${group.total_variance < 0 ? 'text-red-600' : group.total_variance > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                  {group.total_variance.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => deleteStockTakeGroup(group.date, group.project_type_id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {Object.keys(groupedStockTakes).length === 0 && (
              <tr><td colSpan={sizes.length + 5} className="px-4 py-4 text-center text-gray-500">No grouped stock takes found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
