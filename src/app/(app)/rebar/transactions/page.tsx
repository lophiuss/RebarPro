'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Pencil, X, Check, CheckCircle, ArrowRight } from 'lucide-react'
import { naturalSort } from '@/lib/utils/sort'
import { toDisplayUnit, toTonnes, fmtQtyNum, unitLabel, type DefaultUnit } from '@/lib/utils/unit'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [projectTypes, setProjectTypes] = useState<any[]>([])
  const [sizes, setSizes] = useState<any[]>([])
  const [unit, setUnit] = useState<DefaultUnit>('kg')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // Form State
  const [projectId, setProjectId] = useState('')
  const [projectTypeId, setProjectTypeId] = useState('')
  const [fromProjectTypeId, setFromProjectTypeId] = useState('')
  const [toProjectTypeId, setToProjectTypeId] = useState('')
  const [type, setType] = useState('incoming')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [doNumber, setDoNumber] = useState('')
  const [notes, setNotes] = useState('')
  
  // Multiple entries support
  const [entries, setEntries] = useState([{ sizeId: '', qty: '' }])

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<any>({})

  const supabase = createClient()
  const uLabel = unitLabel(unit)

  function showSuccess(msg: string) {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 4000)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const [txRes, projRes, pTypesRes, sizeRes, settingsRes] = await Promise.all([
      supabase.from('transactions').select('*, rebar_sizes(size), projects(name), project_types(name)').order('transaction_date', { ascending: false }),
      supabase.from('projects').select('*'),
      supabase.from('project_types').select('*'),
      supabase.from('rebar_sizes').select('*'),
      supabase.from('global_settings').select('default_unit').eq('id', 1).single()
    ])
    
    if (settingsRes.data?.default_unit) {
      setUnit(settingsRes.data.default_unit as DefaultUnit)
    }

    if (txRes.data) setTransactions(txRes.data)
    
    const sortedProjects = naturalSort(projRes.data || [], p => p.name)
    const sortedProjectTypes = naturalSort(pTypesRes.data || [], pt => pt.name)
    const sortedSizes = naturalSort(sizeRes.data || [], s => s.size)

    setProjects(sortedProjects)
    if (sortedProjects.length > 0 && !projectId) setProjectId(sortedProjects[0].id)

    setProjectTypes(sortedProjectTypes)
    if (sortedProjectTypes.length > 0) {
      if (!projectTypeId) setProjectTypeId(sortedProjectTypes[0].id)
      if (!fromProjectTypeId) setFromProjectTypeId(sortedProjectTypes[0].id)
      if (!toProjectTypeId && sortedProjectTypes.length > 1) setToProjectTypeId(sortedProjectTypes[1].id)
    }

    setSizes(sortedSizes)
    if (sortedSizes.length > 0 && entries[0].sizeId === '') {
      setEntries([{ sizeId: sortedSizes[0].id, qty: '' }])
    }
  }

  async function logAudit(action: string, recordId: string, oldData: any, newData: any) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_log').insert([{
      table_name: 'transactions',
      record_id: recordId,
      action,
      old_data: oldData,
      new_data: newData,
      changed_by: user?.id
    }])
  }

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault()
    
    // TRANSFER SPECIAL HANDLING
    if (type === 'transfer') {
      if (fromProjectTypeId === toProjectTypeId) {
        alert('Source and Destination Project Types must be different.')
        return
      }

      const fromTypeName = projectTypes.find(pt => pt.id === fromProjectTypeId)?.name || 'Source'
      const toTypeName = projectTypes.find(pt => pt.id === toProjectTypeId)?.name || 'Destination'

      const validEntries = entries.filter(ent => ent.qty && ent.sizeId)
      if (validEntries.length === 0) {
        alert('Please enter at least one quantity.')
        return
      }

      const rowsToInsert: any[] = []
      validEntries.forEach(ent => {
        // Convert user entry in display unit (kg/ton) to tonnes for DB storage
        const inputQty = Math.abs(parseFloat(ent.qty))
        const qtyTonnes = toTonnes(inputQty, unit)

        rowsToInsert.push({
          project_id: null,
          project_type_id: fromProjectTypeId,
          size_id: ent.sizeId,
          type: 'transfer',
          quantity: -qtyTonnes,
          transaction_date: date,
          do_number: doNumber || null,
          notes: `Transfer to ${toTypeName}${notes ? ' - ' + notes : ''}`
        })
        rowsToInsert.push({
          project_id: null,
          project_type_id: toProjectTypeId,
          size_id: ent.sizeId,
          type: 'transfer',
          quantity: qtyTonnes,
          transaction_date: date,
          do_number: doNumber || null,
          notes: `Transfer from ${fromTypeName}${notes ? ' - ' + notes : ''}`
        })
      })

      const { data, error } = await supabase.from('transactions').insert(rowsToInsert).select()
      if (!error && data) {
        for (const row of data) await logAudit('insert', row.id, null, row)
        showSuccess(`✓ Transfer from ${fromTypeName} to ${toTypeName} saved successfully!`)
        setEntries([{ sizeId: sizes.length > 0 ? sizes[0].id : '', qty: '' }])
        setDoNumber('')
        setNotes('')
        fetchData()
      } else {
        alert('Error saving transfer: ' + error?.message)
      }
      return
    }

    const isProjectTypeLevel = ['incoming', 'wastage'].includes(type)
    
    const rowsToInsert = entries.filter(ent => ent.qty && (ent.sizeId || type === 'wastage')).map(ent => {
      const inputQty = parseFloat(ent.qty)
      let qtyTonnes = toTonnes(Math.abs(inputQty), unit)
      if (['usage', 'wastage'].includes(type)) {
        qtyTonnes = -qtyTonnes
      }
      return {
        project_id: isProjectTypeLevel ? null : (projectId || null),
        project_type_id: isProjectTypeLevel ? (projectTypeId || null) : null,
        size_id: ent.sizeId ? ent.sizeId : null,
        type,
        quantity: qtyTonnes,
        transaction_date: date,
        do_number: doNumber || null,
        notes: notes || null
      }
    })

    if (rowsToInsert.length === 0) {
      alert('Please enter at least one quantity.')
      return
    }

    const { data, error } = await supabase.from('transactions').insert(rowsToInsert).select()

    if (!error && data) {
      for (const row of data) {
        await logAudit('insert', row.id, null, row)
      }
      const savedCount = data.length
      const typeLabel = type === 'unsuspend' ? 'Unsuspend' : type.charAt(0).toUpperCase() + type.slice(1)
      showSuccess(`✓ ${savedCount} ${typeLabel} transaction${savedCount > 1 ? 's' : ''} saved successfully on ${date}!`)
      setEntries([{ sizeId: sizes.length > 0 ? sizes[0].id : '', qty: '' }])
      setDoNumber('')
      setNotes('')
      fetchData()
    } else {
      alert('Error: ' + error?.message)
    }
  }

  function startEdit(tx: any) {
    setEditingId(tx.id)
    setEditData({
      transaction_date: tx.transaction_date,
      type: tx.type,
      quantity: toDisplayUnit(Math.abs(tx.quantity), unit),
      do_number: tx.do_number || '',
      notes: tx.notes || '',
      project_id: tx.project_id || '',
      project_type_id: tx.project_type_id || '',
      size_id: tx.size_id || ''
    })
  }

  async function saveEdit(tx: any) {
    const inputQty = parseFloat(editData.quantity)
    let qtyTonnes = toTonnes(Math.abs(inputQty), unit)
    if (['usage', 'wastage'].includes(editData.type)) {
      qtyTonnes = -qtyTonnes
    }

    const isProjectTypeLevel = ['incoming', 'transfer', 'wastage'].includes(editData.type)

    const updatePayload = {
      transaction_date: editData.transaction_date,
      type: editData.type,
      quantity: qtyTonnes,
      do_number: editData.do_number || null,
      notes: editData.notes || null,
      project_id: isProjectTypeLevel ? null : (editData.project_id || null),
      project_type_id: isProjectTypeLevel ? (editData.project_type_id || null) : null,
      size_id: editData.size_id ? editData.size_id : null
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', tx.id)
      .select()

    if (!error) {
      await logAudit('update', tx.id, tx, data?.[0])
      setEditingId(null)
      fetchData()
    } else {
      alert('Error: ' + error.message)
    }
  }

  async function deleteTransaction(tx: any) {
    const sizeName = tx.rebar_sizes?.size || 'Overall Scrap'
    if (!confirm(`Delete this ${tx.type} transaction for ${sizeName}?`)) return

    const { error } = await supabase.from('transactions').delete().eq('id', tx.id)
    if (!error) {
      await logAudit('delete', tx.id, tx, null)
      fetchData()
    } else {
      alert('Error: ' + error.message)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Transactions</h1>

      {successMessage && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-300 text-green-800 rounded-xl px-5 py-4 shadow-sm animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}
      
      {/* Add Transaction Form */}
      <form onSubmit={addTransaction} className="mb-8 border p-6 rounded-xl bg-white shadow-sm">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5">Transaction Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {([
              { value: 'incoming', label: 'Incoming', active: 'bg-green-600 border-green-600 text-white' },
              { value: 'usage', label: 'Usage', active: 'bg-red-600 border-red-600 text-white' },
              { value: 'transfer', label: 'Transfer', active: 'bg-purple-600 border-purple-600 text-white' },
              { value: 'suspended', label: 'Suspended', active: 'bg-amber-600 border-amber-600 text-white' },
              { value: 'unsuspend', label: 'Unsuspend', active: 'bg-blue-600 border-blue-600 text-white' },
              { value: 'wastage', label: 'Wastage', active: 'bg-gray-700 border-gray-700 text-white' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold border-2 transition ${type === opt.value ? opt.active : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-md px-3 py-2" />
          </div>

          {type !== 'transfer' && (
            <div>
              <label className="block text-sm font-medium mb-1">DO Number <span className="text-gray-400">(Optional)</span></label>
              <input type="text" value={doNumber} onChange={(e) => setDoNumber(e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="e.g. DO-2026-001" />
            </div>
          )}
        </div>

        <div className="mb-4">
          {type === 'transfer' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-red-600 font-semibold">From Project Type</label>
                <div className="flex flex-wrap gap-2">
                  {projectTypes.map(pt => (
                    <button key={pt.id} type="button" onClick={() => setFromProjectTypeId(pt.id)}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold border-2 transition ${fromProjectTypeId === pt.id ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>
                      {pt.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-green-600 font-semibold">To Project Type</label>
                <div className="flex flex-wrap gap-2">
                  {projectTypes.map(pt => (
                    <button key={pt.id} type="button" onClick={() => setToProjectTypeId(pt.id)}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold border-2 transition ${toProjectTypeId === pt.id ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-green-300'}`}>
                      {pt.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : ['incoming', 'wastage'].includes(type) ? (
            <div>
              <label className="block text-sm font-medium mb-1.5">Project Type</label>
              <div className="flex flex-wrap gap-2">
                {projectTypes.map(pt => (
                  <button key={pt.id} type="button" onClick={() => setProjectTypeId(pt.id)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold border-2 transition ${projectTypeId === pt.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    {pt.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1.5">Project</label>
              <div className="flex flex-wrap gap-2">
                {projects.map(p => (
                  <button key={p.id} type="button" onClick={() => setProjectId(p.id)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold border-2 transition ${projectId === p.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {type === 'transfer' && (
          <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-900 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <span>Transfer will deduct inventory from <strong>{projectTypes.find(pt => pt.id === fromProjectTypeId)?.name || 'Source'}</strong> and add inventory to <strong>{projectTypes.find(pt => pt.id === toProjectTypeId)?.name || 'Destination'}</strong>.</span>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Notes <span className="text-gray-400">(Optional)</span></label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="e.g. Supplier ABC, Truck #123, scrap lot details" />
        </div>

        {/* Multi-size entries or Overall Wastage */}
        <div className="mb-4 border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">
              {type === 'wastage' ? `Wastage Quantity (${uLabel})` : `Rebar Sizes & Quantities (${uLabel})`}
            </h3>
            {type === 'wastage' && (
              <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full font-medium">
                Overall combined scrap (size optional)
              </span>
            )}
          </div>

          {entries.map((entry, index) => (
            <div key={index} className="flex gap-4 mb-3 items-center">
              <select 
                value={entry.sizeId} 
                onChange={(e) => {
                  const newEntries = [...entries]
                  newEntries[index].sizeId = e.target.value
                  setEntries(newEntries)
                }} 
                className="w-56 border rounded-md px-3 py-2 bg-white text-sm"
              >
                {type === 'wastage' && <option value="">(Overall Combine / No Size)</option>}
                {sizes.map(s => <option key={s.id} value={s.id}>{s.size}</option>)}
              </select>
              <input 
                type="number" step="0.01" 
                value={entry.qty} 
                onChange={(e) => {
                  const newEntries = [...entries]
                  newEntries[index].qty = e.target.value
                  setEntries(newEntries)
                }} 
                className="w-48 border rounded-md px-3 py-2 text-sm" 
                placeholder={`Qty (${uLabel})`} 
              />
              {entries.length > 1 && (
                <button type="button" onClick={() => setEntries(entries.filter((_, i) => i !== index))} className="text-red-500 hover:text-red-700 p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {type !== 'wastage' && (
            <button 
              type="button" 
              onClick={() => setEntries([...entries, { sizeId: sizes.length > 0 ? sizes[0].id : '', qty: '' }])} 
              className="text-sm text-blue-600 font-medium flex items-center gap-1 mt-2 hover:text-blue-800"
            >
              <Plus className="w-4 h-4" /> Add another size
            </button>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button type="submit" className="w-32">Save</Button>
        </div>
      </form>

      {/* Transaction History Table with Filter & Export */}
      <TransactionTable
        transactions={transactions}
        projects={projects}
        projectTypes={projectTypes}
        sizes={sizes}
        unit={unit}
        editingId={editingId}
        editData={editData}
        setEditData={setEditData}
        startEdit={startEdit}
        saveEdit={saveEdit}
        deleteTransaction={deleteTransaction}
        setEditingId={setEditingId}
      />
    </div>
  )
}

function TransactionTable({
  transactions, projects, projectTypes, sizes, unit,
  editingId, editData, setEditData, startEdit, saveEdit, deleteTransaction, setEditingId
}: any) {
  const uLabel = unitLabel(unit)
  const [filterDate, setFilterDate] = React.useState('')
  const [filterProject, setFilterProject] = React.useState('')
  const [filterSize, setFilterSize] = React.useState('')
  const [filterType, setFilterType] = React.useState('')
  const [filterDO, setFilterDO] = React.useState('')

  const filtered = transactions.filter((t: any) => {
    if (filterDate && !t.transaction_date.includes(filterDate)) return false
    if (filterProject) {
      const label = t.project_types?.name ? `[Type] ${t.project_types.name}` : (t.projects?.name || '')
      if (!label.toLowerCase().includes(filterProject.toLowerCase())) return false
    }
    if (filterSize) {
      const s = (t.rebar_sizes?.size || 'Overall Combine').toLowerCase()
      if (!s.includes(filterSize.toLowerCase())) return false
    }
    if (filterType && t.type !== filterType) return false
    if (filterDO && !(t.do_number || '').toLowerCase().includes(filterDO.toLowerCase())) return false
    return true
  }).slice(0, 100)

  function exportCSV() {
    const headers = ['Date', 'Project/Type', 'Size', 'Transaction Type', `Qty (${uLabel})`, 'DO Number', 'Notes']
    const rows = filtered.map((t: any) => [
      t.transaction_date,
      t.project_types?.name ? `[Type] ${t.project_types.name}` : (t.projects?.name || ''),
      t.rebar_sizes?.size || '(Overall Combine)',
      t.type,
      fmtQtyNum(t.quantity, unit),
      t.do_number || '',
      t.notes || ''
    ])
    const csv = [headers, ...rows].map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
      <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border rounded px-2 py-1 text-sm w-36" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Project / Type</label>
          <input value={filterProject} onChange={e => setFilterProject(e.target.value)} className="border rounded px-2 py-1 text-sm w-36" placeholder="Search..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Size</label>
          <input value={filterSize} onChange={e => setFilterSize(e.target.value)} className="border rounded px-2 py-1 text-sm w-24" placeholder="e.g. H16" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded px-2 py-1 text-sm bg-white w-36">
            <option value="">All Types</option>
            <option value="incoming">Incoming</option>
            <option value="usage">Usage</option>
            <option value="transfer">Transfer</option>
            <option value="suspended">Suspended</option>
            <option value="unsuspend">Unsuspend</option>
            <option value="wastage">Wastage</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">DO #</label>
          <input value={filterDO} onChange={e => setFilterDO(e.target.value)} className="border rounded px-2 py-1 text-sm w-28" placeholder="Search..." />
        </div>
        <button
          onClick={() => { setFilterDate(''); setFilterProject(''); setFilterSize(''); setFilterType(''); setFilterDO('') }}
          className="text-xs text-gray-500 hover:text-gray-800 border rounded px-2 py-1"
        >
          Clear
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">{filtered.length} rows (max 100)</span>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700 transition font-medium shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export Excel
          </button>
        </div>
      </div>

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty ({uLabel})</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DO #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filtered.map((t: any) => (
            <tr key={t.id}>
              {editingId === t.id ? (
                <>
                  <td className="px-4 py-2"><input type="date" value={editData.transaction_date} onChange={e => setEditData({...editData, transaction_date: e.target.value})} className="border rounded px-2 py-1 w-full text-sm" /></td>
                  <td className="px-4 py-2">
                    {['incoming', 'transfer', 'wastage'].includes(editData.type) ? (
                      <select value={editData.project_type_id} onChange={e => setEditData({...editData, project_type_id: e.target.value})} className="border rounded px-2 py-1 w-full text-sm bg-white">
                        <option value="">(None)</option>
                        {projectTypes.map((pt: any) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                      </select>
                    ) : (
                      <select value={editData.project_id} onChange={e => setEditData({...editData, project_id: e.target.value})} className="border rounded px-2 py-1 w-full text-sm bg-white">
                        <option value="">(None)</option>
                        {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select value={editData.size_id} onChange={e => setEditData({...editData, size_id: e.target.value})} className="border rounded px-2 py-1 w-full text-sm bg-white">
                      <option value="">(Overall Combine)</option>
                      {sizes.map((s: any) => <option key={s.id} value={s.id}>{s.size}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select value={editData.type} onChange={e => setEditData({...editData, type: e.target.value})} className="border rounded px-2 py-1 w-full text-sm bg-white">
                      <option value="incoming">Incoming</option>
                      <option value="usage">Usage</option>
                      <option value="transfer">Transfer</option>
                      <option value="suspended">Suspended</option>
                      <option value="unsuspend">Unsuspend</option>
                      <option value="wastage">Wastage</option>
                    </select>
                  </td>
                  <td className="px-4 py-2"><input type="number" step="0.01" value={editData.quantity} onChange={e => setEditData({...editData, quantity: e.target.value})} className="border rounded px-2 py-1 w-20 text-sm" /></td>
                  <td className="px-4 py-2"><input type="text" value={editData.do_number} onChange={e => setEditData({...editData, do_number: e.target.value})} className="border rounded px-2 py-1 w-full text-sm" /></td>
                  <td className="px-4 py-2"><input type="text" value={editData.notes} onChange={e => setEditData({...editData, notes: e.target.value})} className="border rounded px-2 py-1 w-full text-sm" /></td>
                  <td className="px-4 py-2 flex gap-1">
                    <button onClick={() => saveEdit(t)} className="text-green-600 hover:text-green-800 p-1"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-700 p-1"><X className="w-4 h-4" /></button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{t.transaction_date}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{t.project_types?.name ? `[Type] ${t.project_types.name}` : (t.projects?.name || '-')}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold">
                    {t.rebar_sizes?.size ? t.rebar_sizes.size : <span className="text-orange-600 font-normal italic text-xs">Overall Combine</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm capitalize">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.type === 'incoming' ? 'bg-green-100 text-green-800' :
                      t.type === 'usage' ? 'bg-red-100 text-red-800' :
                      t.type === 'wastage' ? 'bg-orange-100 text-orange-800' :
                      t.type === 'transfer' ? 'bg-purple-100 text-purple-800' :
                      t.type === 'suspended' ? 'bg-amber-100 text-amber-800' :
                      t.type === 'unsuspend' ? 'bg-teal-100 text-teal-800' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {t.type === 'unsuspend' ? 'Unsuspend' : t.type}
                    </span>
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${t.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmtQtyNum(t.quantity, unit)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{t.do_number || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{t.notes || '-'}</td>
                  <td className="px-4 py-3 flex gap-1">
                    <button onClick={() => startEdit(t)} className="text-blue-600 hover:text-blue-800 p-1"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => deleteTransaction(t)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No transactions match the current filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
