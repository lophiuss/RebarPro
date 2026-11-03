'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Pencil, X, Check, CheckCircle, ArrowRight, ArrowUp, ArrowDown, ArrowUpDown, Filter, RotateCcw } from 'lucide-react'
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

interface HeaderCellProps {
  title: string
  colKey: string
  currentSortKey: string | null
  currentSortDir: 'asc' | 'desc'
  onSort: (key: string) => void
  isFiltered: boolean
  isPopoverOpen: boolean
  onTogglePopover: () => void
  onClosePopover: () => void
  alignRight?: boolean
  className?: string
  children: React.ReactNode
}

function HeaderCell({
  title,
  colKey,
  currentSortKey,
  currentSortDir,
  onSort,
  isFiltered,
  isPopoverOpen,
  onTogglePopover,
  onClosePopover,
  alignRight = false,
  className = '',
  children,
}: HeaderCellProps) {
  const isSorted = currentSortKey === colKey
  const popoverRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!isPopoverOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClosePopover()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isPopoverOpen, onClosePopover])

  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-xs font-semibold text-slate-700 bg-gray-50 border-b relative select-none ${className} ${
        isFiltered ? 'bg-blue-50/90 ring-1 ring-inset ring-blue-300 font-bold' : ''
      }`}
    >
      <div className={`flex items-center gap-1.5 ${alignRight ? 'justify-end' : 'justify-between'}`}>
        {/* Sort Trigger */}
        <button
          type="button"
          onClick={() => onSort(colKey)}
          className="flex items-center gap-1 text-left hover:text-blue-600 transition truncate cursor-pointer group"
          title={`Click to sort by ${title} (${isSorted && currentSortDir === 'asc' ? 'Descending' : 'Ascending'})`}
        >
          <span className="truncate">{title}</span>
          {isSorted ? (
            currentSortDir === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-blue-600 shrink-0 font-bold" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-blue-600 shrink-0 font-bold" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-40 group-hover:opacity-100 shrink-0" />
          )}
        </button>

        {/* Filter Trigger Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onTogglePopover()
          }}
          className={`p-1 rounded transition shrink-0 cursor-pointer ${
            isFiltered
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/80'
          }`}
          title={`Filter ${title}${isFiltered ? ' (Active filter)' : ''}`}
        >
          <Filter className="w-3 h-3" />
        </button>
      </div>

      {/* Floating Filter Popover */}
      {isPopoverOpen && (
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full ${alignRight ? 'right-0' : 'left-0'} mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 min-w-[240px] max-w-[280px] text-xs font-normal normal-case text-slate-700 animate-in fade-in zoom-in-95 duration-100`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              Filter: {title}
            </span>
            <button
              type="button"
              onClick={onClosePopover}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </th>
  )
}

function TransactionTable({
  transactions, projects, projectTypes, sizes, unit,
  editingId, editData, setEditData, startEdit, saveEdit, deleteTransaction, setEditingId
}: any) {
  const uLabel = unitLabel(unit)
  const [filterFrom, setFilterFrom] = React.useState('')
  const [filterTo, setFilterTo] = React.useState('')
  const [filterProject, setFilterProject] = React.useState('')
  const [filterSize, setFilterSize] = React.useState('')
  const [filterType, setFilterType] = React.useState('')
  const [filterMinQty, setFilterMinQty] = React.useState('')
  const [filterMaxQty, setFilterMaxQty] = React.useState('')
  const [filterDO, setFilterDO] = React.useState('')
  const [filterNotes, setFilterNotes] = React.useState('')
  
  const [sortKey, setSortKey] = React.useState<string | null>('date')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')
  const [openPopover, setOpenPopover] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const PAGE_SIZE = 100

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'date' || key === 'qty' ? 'desc' : 'asc')
    }
  }

  const activeFilterCount = [
    Boolean(filterFrom || filterTo),
    Boolean(filterProject),
    Boolean(filterSize),
    Boolean(filterType),
    Boolean(filterMinQty !== '' || filterMaxQty !== ''),
    Boolean(filterDO),
    Boolean(filterNotes),
  ].filter(Boolean).length

  function clearAllFilters() {
    setFilterFrom('')
    setFilterTo('')
    setFilterProject('')
    setFilterSize('')
    setFilterType('')
    setFilterMinQty('')
    setFilterMaxQty('')
    setFilterDO('')
    setFilterNotes('')
    setOpenPopover(null)
  }

  const sortedAndFiltered = React.useMemo(() => {
    // 1. Filter
    const rows = transactions.filter((t: any) => {
      if (filterFrom && t.transaction_date < filterFrom) return false
      if (filterTo && t.transaction_date > filterTo) return false
      if (filterProject) {
        const label = t.project_types?.name ? `[Type] ${t.project_types.name}` : (t.projects?.name || '')
        if (!label.toLowerCase().includes(filterProject.toLowerCase())) return false
      }
      if (filterSize) {
        const s = (t.rebar_sizes?.size || 'Overall Combine').toLowerCase()
        if (!s.includes(filterSize.toLowerCase())) return false
      }
      if (filterType && t.type !== filterType) return false
      if (filterMinQty !== '' && Math.abs(Number(t.quantity || 0)) < Math.abs(toTonnes(Number(filterMinQty), unit))) return false
      if (filterMaxQty !== '' && Math.abs(Number(t.quantity || 0)) > Math.abs(toTonnes(Number(filterMaxQty), unit))) return false
      if (filterDO && !(t.do_number || '').toLowerCase().includes(filterDO.toLowerCase())) return false
      if (filterNotes && !(t.notes || '').toLowerCase().includes(filterNotes.toLowerCase())) return false
      return true
    })

    // 2. Sort
    if (!sortKey) return rows

    return [...rows].sort((a: any, b: any) => {
      let cmp = 0
      if (sortKey === 'date') {
        cmp = a.transaction_date.localeCompare(b.transaction_date)
      } else if (sortKey === 'project') {
        const aProj = a.project_types?.name ? `[Type] ${a.project_types.name}` : (a.projects?.name || '')
        const bProj = b.project_types?.name ? `[Type] ${b.project_types.name}` : (b.projects?.name || '')
        cmp = aProj.localeCompare(bProj)
      } else if (sortKey === 'size') {
        const aSize = a.rebar_sizes?.size || ''
        const bSize = b.rebar_sizes?.size || ''
        const aNum = parseInt(aSize.replace(/\D/g, '') || '0', 10)
        const bNum = parseInt(bSize.replace(/\D/g, '') || '0', 10)
        cmp = aNum !== bNum ? aNum - bNum : aSize.localeCompare(bSize)
      } else if (sortKey === 'type') {
        cmp = (a.type || '').localeCompare(b.type || '')
      } else if (sortKey === 'qty') {
        cmp = Number(a.quantity || 0) - Number(b.quantity || 0)
      } else if (sortKey === 'do') {
        cmp = (a.do_number || '').localeCompare(b.do_number || '')
      } else if (sortKey === 'notes') {
        cmp = (a.notes || '').localeCompare(b.notes || '')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [transactions, filterFrom, filterTo, filterProject, filterSize, filterType, filterMinQty, filterMaxQty, filterDO, filterNotes, sortKey, sortDir, unit])

  // Reset to page 1 whenever filters change
  React.useEffect(() => { setPage(1) }, [filterFrom, filterTo, filterProject, filterSize, filterType, filterMinQty, filterMaxQty, filterDO, filterNotes, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedAndFiltered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const filtered = sortedAndFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function exportCSV() {
    const headers = ['Date', 'Project/Type', 'Size', 'Transaction Type', `Qty (${uLabel})`, 'DO Number', 'Notes']
    const rows = sortedAndFiltered.map((t: any) => [
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

  // Quick lists for filter options
  const uniqueProjectNames = React.useMemo(() => {
    const names = new Set<string>()
    projectTypes.forEach((pt: any) => names.add(`[Type] ${pt.name}`))
    projects.forEach((p: any) => names.add(p.name))
    return Array.from(names).sort()
  }, [projects, projectTypes])

  return (
    <div className="bg-white border rounded-xl shadow-sm">
      {/* Top Filter Summary and Action Bar */}
      <div className="p-3 sm:p-4 border-b bg-gray-50 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <span>Transactions List</span>
            <span className="bg-slate-200 text-slate-700 text-[11px] font-mono px-2 py-0.5 rounded-full">
              {sortedAndFiltered.length}
            </span>
          </span>

          {activeFilterCount > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2.5 py-1 rounded-lg">
              <Filter className="w-3.5 h-3.5" />
              <span>{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</span>
              <button
                type="button"
                onClick={clearAllFilters}
                className="ml-1 text-blue-600 hover:text-blue-900 font-bold underline cursor-pointer"
              >
                Reset All
              </button>
            </div>
          )}

          {sortKey && (
            <span className="text-xs text-slate-500 bg-white border rounded-md px-2 py-0.5 flex items-center gap-1">
              <span>Sorted by: <strong>{sortKey}</strong></span>
              <span>({sortDir === 'asc' ? '↑ Asc' : '↓ Desc'})</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {sortedAndFiltered.length === 0 ? '0 rows' : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, sortedAndFiltered.length)} of ${sortedAndFiltered.length}`}
          </span>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 bg-green-600 text-white text-xs sm:text-sm px-3 py-1.5 rounded-lg hover:bg-green-700 transition font-medium shadow-xs cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="overflow-auto max-h-[70vh]">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0 z-10 shadow-xs">
          <tr>
            {/* 1. Date Header with Sort & Filter */}
            <HeaderCell
              title="Date"
              colKey="date"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={handleSort}
              isFiltered={Boolean(filterFrom || filterTo)}
              isPopoverOpen={openPopover === 'date'}
              onTogglePopover={() => setOpenPopover(p => p === 'date' ? null : 'date')}
              onClosePopover={() => setOpenPopover(null)}
            >
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-0.5">From Date</label>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={e => setFilterFrom(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-0.5">To Date</label>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={e => setFilterTo(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </div>
                <div className="flex gap-1.5 pt-1 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0]
                      setFilterFrom(today)
                      setFilterTo(today)
                    }}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-700"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() - 7)
                      setFilterFrom(d.toISOString().split('T')[0])
                      setFilterTo(new Date().toISOString().split('T')[0])
                    }}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-700"
                  >
                    Last 7d
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFilterFrom(''); setFilterTo('') }}
                    className="ml-auto text-[10px] text-red-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </HeaderCell>

            {/* 2. Project / Type Header with Sort & Filter */}
            <HeaderCell
              title="Project"
              colKey="project"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={handleSort}
              isFiltered={Boolean(filterProject)}
              isPopoverOpen={openPopover === 'project'}
              onTogglePopover={() => setOpenPopover(p => p === 'project' ? null : 'project')}
              onClosePopover={() => setOpenPopover(null)}
            >
              <div className="space-y-2">
                <input
                  type="text"
                  value={filterProject}
                  onChange={e => setFilterProject(e.target.value)}
                  placeholder="Search project or type..."
                  className="w-full border rounded px-2 py-1 text-xs"
                  autoFocus
                />
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {uniqueProjectNames.map(pName => (
                    <button
                      key={pName}
                      type="button"
                      onClick={() => setFilterProject(filterProject === pName ? '' : pName)}
                      className={`w-full text-left px-2 py-1 rounded text-[11px] truncate transition ${
                        filterProject === pName
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      {pName}
                    </button>
                  ))}
                </div>
                {filterProject && (
                  <button
                    type="button"
                    onClick={() => setFilterProject('')}
                    className="text-[10px] text-red-600 hover:underline block pt-1 border-t"
                  >
                    Clear Project Filter
                  </button>
                )}
              </div>
            </HeaderCell>

            {/* 3. Size Header with Sort & Filter */}
            <HeaderCell
              title="Size"
              colKey="size"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={handleSort}
              isFiltered={Boolean(filterSize)}
              isPopoverOpen={openPopover === 'size'}
              onTogglePopover={() => setOpenPopover(p => p === 'size' ? null : 'size')}
              onClosePopover={() => setOpenPopover(null)}
            >
              <div className="space-y-2">
                <input
                  type="text"
                  value={filterSize}
                  onChange={e => setFilterSize(e.target.value)}
                  placeholder="e.g. H16, H20, Combine"
                  className="w-full border rounded px-2 py-1 text-xs"
                  autoFocus
                />
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pt-1">
                  <button
                    type="button"
                    onClick={() => setFilterSize(filterSize === 'Overall Combine' ? '' : 'Overall Combine')}
                    className={`px-2 py-0.5 rounded text-[10px] border ${
                      filterSize === 'Overall Combine'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Overall Combine
                  </button>
                  {sizes.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFilterSize(filterSize === s.size ? '' : s.size)}
                      className={`px-2 py-0.5 rounded text-[10px] border ${
                        filterSize === s.size
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s.size}
                    </button>
                  ))}
                </div>
                {filterSize && (
                  <button
                    type="button"
                    onClick={() => setFilterSize('')}
                    className="text-[10px] text-red-600 hover:underline block pt-1 border-t"
                  >
                    Clear Size Filter
                  </button>
                )}
              </div>
            </HeaderCell>

            {/* 4. Type Header with Sort & Filter */}
            <HeaderCell
              title="Type"
              colKey="type"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={handleSort}
              isFiltered={Boolean(filterType)}
              isPopoverOpen={openPopover === 'type'}
              onTogglePopover={() => setOpenPopover(p => p === 'type' ? null : 'type')}
              onClosePopover={() => setOpenPopover(null)}
            >
              <div className="space-y-1.5">
                {[
                  { value: '', label: 'All Types' },
                  { value: 'incoming', label: 'Incoming' },
                  { value: 'usage', label: 'Usage' },
                  { value: 'transfer', label: 'Transfer' },
                  { value: 'suspended', label: 'Suspended' },
                  { value: 'unsuspend', label: 'Unsuspend' },
                  { value: 'wastage', label: 'Wastage' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setFilterType(opt.value)
                      setOpenPopover(null)
                    }}
                    className={`w-full text-left px-2 py-1 rounded text-xs transition ${
                      filterType === opt.value
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </HeaderCell>

            {/* 5. Qty Header with Sort & Filter */}
            <HeaderCell
              title={`Qty (${uLabel})`}
              colKey="qty"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={handleSort}
              isFiltered={Boolean(filterMinQty !== '' || filterMaxQty !== '')}
              isPopoverOpen={openPopover === 'qty'}
              onTogglePopover={() => setOpenPopover(p => p === 'qty' ? null : 'qty')}
              onClosePopover={() => setOpenPopover(null)}
              alignRight={true}
            >
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-0.5">Min Qty ({uLabel})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={filterMinQty}
                    onChange={e => setFilterMinQty(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-0.5">Max Qty ({uLabel})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={filterMaxQty}
                    onChange={e => setFilterMaxQty(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </div>
                {(filterMinQty !== '' || filterMaxQty !== '') && (
                  <button
                    type="button"
                    onClick={() => { setFilterMinQty(''); setFilterMaxQty('') }}
                    className="text-[10px] text-red-600 hover:underline block pt-1 border-t"
                  >
                    Clear Qty Filter
                  </button>
                )}
              </div>
            </HeaderCell>

            {/* 6. DO # Header with Sort & Filter */}
            <HeaderCell
              title="DO #"
              colKey="do"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={handleSort}
              isFiltered={Boolean(filterDO)}
              isPopoverOpen={openPopover === 'do'}
              onTogglePopover={() => setOpenPopover(p => p === 'do' ? null : 'do')}
              onClosePopover={() => setOpenPopover(null)}
            >
              <div className="space-y-2">
                <input
                  type="text"
                  value={filterDO}
                  onChange={e => setFilterDO(e.target.value)}
                  placeholder="Search DO number..."
                  className="w-full border rounded px-2 py-1 text-xs"
                  autoFocus
                />
                {filterDO && (
                  <button
                    type="button"
                    onClick={() => setFilterDO('')}
                    className="text-[10px] text-red-600 hover:underline block pt-1 border-t"
                  >
                    Clear DO Filter
                  </button>
                )}
              </div>
            </HeaderCell>

            {/* 7. Notes Header with Sort & Filter */}
            <HeaderCell
              title="Notes"
              colKey="notes"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={handleSort}
              isFiltered={Boolean(filterNotes)}
              isPopoverOpen={openPopover === 'notes'}
              onTogglePopover={() => setOpenPopover(p => p === 'notes' ? null : 'notes')}
              onClosePopover={() => setOpenPopover(null)}
            >
              <div className="space-y-2">
                <input
                  type="text"
                  value={filterNotes}
                  onChange={e => setFilterNotes(e.target.value)}
                  placeholder="Search notes / supplier..."
                  className="w-full border rounded px-2 py-1 text-xs"
                  autoFocus
                />
                {filterNotes && (
                  <button
                    type="button"
                    onClick={() => setFilterNotes('')}
                    className="text-[10px] text-red-600 hover:underline block pt-1 border-t"
                  >
                    Clear Notes Filter
                  </button>
                )}
              </div>
            </HeaderCell>

            {/* 8. Actions Header */}
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filtered.map((t: any) => (
            <tr key={t.id} className="hover:bg-slate-50/70 transition">
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
                  <td className="px-3.5 py-2.5 whitespace-nowrap text-sm text-slate-700">{t.transaction_date}</td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap text-sm font-medium text-slate-800">{t.project_types?.name ? `[Type] ${t.project_types.name}` : (t.projects?.name || '-')}</td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap text-sm font-semibold">
                    {t.rebar_sizes?.size ? t.rebar_sizes.size : <span className="text-orange-600 font-normal italic text-xs">Overall Combine</span>}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap text-sm capitalize">
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
                  <td className={`px-3.5 py-2.5 whitespace-nowrap text-sm font-semibold text-right ${t.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmtQtyNum(t.quantity, unit)}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap text-sm text-gray-500 font-mono">{t.do_number || '-'}</td>
                  <td className="px-3.5 py-2.5 text-sm text-gray-500 max-w-[200px] truncate">{t.notes || '-'}</td>
                  <td className="px-3.5 py-2.5 flex gap-1 items-center">
                    <button onClick={() => startEdit(t)} className="text-blue-600 hover:text-blue-800 p-1" title="Edit"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => deleteTransaction(t)} className="text-red-500 hover:text-red-700 p-1" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No transactions match the current filters.</td></tr>
          )}
        </tbody>
      </table>
      </div>

      {totalPages > 1 && (
        <div className="p-3 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 cursor-pointer"
          >
            ← Previous
          </button>
          <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 cursor-pointer"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
