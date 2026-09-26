'use client'

import { guard, useColResize } from '../feedback'
import { useState } from 'react'
import { Plus, Trash2, Copy, History, Search, ArrowUpDown } from 'lucide-react'
import {
  createWorker, updateWorkerField, updateWorkerPayValue, deleteWorker, copyWorker,
  saveAllocationSnapshot, updateWorkerAllocationPct,
} from '../actions'
import MovementView, { type Movement } from './MovementView'
import { calcGrossPay, calcNetPay } from '@/lib/plantpro-payroll'

type Worker = {
  id: number; worker_no: string | null; name: string; line: string | null; designation: string | null
  supervisor_id: number | null; status: string; remarks: string | null; nationality: string | null
  date_of_birth: string | null; date_joined: string | null
}
type Supervisor = { id: number; name: string }
type Project = { id: number; name: string }
type PayColumn = { id: number; key: string; label: string; type: 'ADD' | 'DEDUCT'; include_in_gross: boolean; include_in_net_deduct: boolean }
type Allocation = { worker_id: number; project_id: number; percentage: number }
type PayValue = { worker_id: number; pay_column_id: number; value: number }

function fmt(n: number) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function HRClient({ workers, supervisors, projects, payColumns, allocations, payValues, movements, supervisorNames }: {
  workers: Worker[]; supervisors: Supervisor[]; projects: Project[]; payColumns: PayColumn[]; allocations: Allocation[]; payValues: PayValue[]
  movements: Movement[]; supervisorNames: Record<number, string>
}) {
  const [tab, setTab] = useState<'data' | 'movement'>('data')
  const [showAlloc, setShowAlloc] = useState(false)
  const { colW, grip } = useColResize({
    id: 80, name: 150, line: 120, supervisor: 130, status: 96, gross: 90, net: 90, alloc: 70, remarks: 150, actions: 84,
    ...Object.fromEntries(payColumns.map(c => ['pay_' + c.id, 88])),
  })
  const tableW = colW.id + colW.name + colW.line + colW.supervisor + colW.status + payColumns.reduce((n, c) => n + colW['pay_' + c.id], 0) + colW.gross + colW.net + (showAlloc ? projects.length * colW.alloc : 0) + colW.remarks + colW.actions
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' })
  const [showAdd, setShowAdd] = useState(false)
  const [newWorker, setNewWorker] = useState({ worker_no: '', name: '', line: '', designation: '', supervisor_id: '' })
  const [saving, setSaving] = useState(false)
  const [snapshotting, setSnapshotting] = useState(false)

  const supervisorById = new Map(supervisors.map(s => [s.id, s.name]))
  const allocByWorker = new Map<number, Map<number, number>>()
  for (const a of allocations) { if (!allocByWorker.has(a.worker_id)) allocByWorker.set(a.worker_id, new Map()); allocByWorker.get(a.worker_id)!.set(a.project_id, a.percentage) }
  const payValueByWorker = new Map<number, Map<number, number>>()
  for (const v of payValues) { if (!payValueByWorker.has(v.worker_id)) payValueByWorker.set(v.worker_id, new Map()); payValueByWorker.get(v.worker_id)!.set(v.pay_column_id, v.value) }

  const columnFlags = payColumns.map(c => ({ key: c.id, includeInGross: c.include_in_gross, includeInNetDeduct: c.include_in_net_deduct }))
  function payValuesFor(w: Worker): Record<number, number> {
    const m = payValueByWorker.get(w.id)
    const out: Record<number, number> = {}
    for (const c of payColumns) out[c.id] = m?.get(c.id) || 0
    return out
  }
  function grossOf(w: Worker) { return calcGrossPay(payValuesFor(w) as any, columnFlags as any) }
  function netOf(w: Worker) { return calcNetPay(payValuesFor(w) as any, columnFlags as any) }

  const searchLower = searchTerm.trim().toLowerCase()
  const filtered = workers.filter(w => !searchLower || w.name.toLowerCase().includes(searchLower) || (w.worker_no || '').toLowerCase().includes(searchLower))
  const sorted = (() => {
    if (!sortConfig.key) return filtered
    const key = sortConfig.key
    const getVal = (w: Worker): string | number => {
      if (key === 'name') return w.name
      if (key === 'id') return w.worker_no || ''
      if (key === 'line') return w.line || ''
      if (key === 'supervisor') return supervisorById.get(w.supervisor_id || -1) || ''
      if (key === 'grossPay') return grossOf(w)
      if (key === 'netPay') return netOf(w)
      return ''
    }
    return [...filtered].sort((a, b) => {
      const av = getVal(a), bv = getVal(b)
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  })()
  function requestSort(key: string) { setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' })) }
  function SortIcon({ col }: { col: string }) { return <ArrowUpDown className="w-3 h-3 inline ml-0.5" style={{ opacity: sortConfig.key === col ? 1 : 0.35 }} /> }

  const tabBar = (
    <div className="flex gap-1 mb-4 border-b">
      {([['data', 'Worker Data'], ['movement', 'Worker Movement']] as const).map(([k, label]) => (
        <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-gray-500'}`}>{label}</button>
      ))}
    </div>
  )
  if (tab === 'movement') return <>{tabBar}<MovementView workers={workers} movements={movements} supervisorNames={supervisorNames} /></>

  return (
    <>
      {tabBar}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search name or ID..." className="border rounded-md pl-8 pr-3 py-1.5 text-sm w-52" />
        </div>
        <div className="flex gap-2">
          <button disabled={snapshotting} onClick={async () => { setSnapshotting(true); await guard(saveAllocationSnapshot); setSnapshotting(false) }} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50"><History className="w-3.5 h-3.5" /> {snapshotting ? 'Saving...' : 'Save Snapshot'}</button>
          <button onClick={() => setShowAlloc(v => !v)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">{showAlloc ? 'Hide Allocation' : 'Show Allocation'}</button>
          <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> New Worker</button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={async e => {
          e.preventDefault()
          if (!newWorker.worker_no.trim() || !newWorker.name.trim()) return
          setSaving(true)
          await guard(() => createWorker({ worker_no: newWorker.worker_no.trim(), name: newWorker.name.trim(), line: newWorker.line, designation: newWorker.designation, supervisor_id: newWorker.supervisor_id ? Number(newWorker.supervisor_id) : null }))
          setSaving(false); setShowAdd(false); setNewWorker({ worker_no: '', name: '', line: '', designation: '', supervisor_id: '' })
        }} className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-2">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Worker ID</label><input required value={newWorker.worker_no} onChange={e => setNewWorker({ ...newWorker, worker_no: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-32" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Name</label><input required value={newWorker.name} onChange={e => setNewWorker({ ...newWorker, name: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-48" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Line</label><input value={newWorker.line} onChange={e => setNewWorker({ ...newWorker, line: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-36" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Designation</label><input value={newWorker.designation} onChange={e => setNewWorker({ ...newWorker, designation: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-36" /></div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Supervisor</label>
            <select value={newWorker.supervisor_id} onChange={e => setNewWorker({ ...newWorker, supervisor_id: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-36">
              <option value="">--</option>{supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={saving} className="bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700">{saving ? 'Saving...' : 'Add'}</button>
        </form>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-auto max-h-[calc(100vh-11rem)]">
        <table className="text-xs border-collapse" style={{ tableLayout: 'fixed', width: tableW }}>
          <colgroup>
            <col style={{ width: colW.id }} /><col style={{ width: colW.name }} /><col style={{ width: colW.line }} /><col style={{ width: colW.supervisor }} /><col style={{ width: colW.status }} />
            {payColumns.map(c => <col key={c.id} style={{ width: colW['pay_' + c.id] }} />)}
            <col style={{ width: colW.gross }} /><col style={{ width: colW.net }} />
            {showAlloc && projects.map(p => <col key={p.id} style={{ width: colW.alloc }} />)}
            <col style={{ width: colW.remarks }} /><col style={{ width: colW.actions }} />
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 text-left cursor-pointer whitespace-nowrap" onClick={() => requestSort('id')}>ID <SortIcon col="id" />{grip('id')}</th>
              <th style={{ left: colW.id }} className="sticky top-0 z-30 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 text-left cursor-pointer whitespace-nowrap" onClick={() => requestSort('name')}>Name <SortIcon col="name" />{grip('name')}</th>
              <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 text-left cursor-pointer whitespace-nowrap" onClick={() => requestSort('line')}>Line <SortIcon col="line" />{grip('line')}</th>
              <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 text-left cursor-pointer whitespace-nowrap" onClick={() => requestSort('supervisor')}>Supervisor <SortIcon col="supervisor" />{grip('supervisor')}</th>
              <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 text-left whitespace-nowrap">Status{grip('status')}</th>
              {payColumns.map(c => <th key={c.id} className={`sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 !px-1 text-center whitespace-nowrap ${c.type === 'DEDUCT' ? 'text-red-600' : ''}`}>{c.label}{grip('pay_' + c.id)}</th>)}
              <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 text-center whitespace-nowrap !bg-green-50 cursor-pointer" onClick={() => requestSort('grossPay')}>Gross <SortIcon col="grossPay" />{grip('gross')}</th>
              <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 text-center whitespace-nowrap !bg-indigo-50 cursor-pointer" onClick={() => requestSort('netPay')}>Net <SortIcon col="netPay" />{grip('net')}</th>
              {showAlloc && projects.map(p => <th key={p.id} className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 !px-1 text-center text-xs truncate" title={p.name}>{p.name} %{grip('alloc')}</th>)}
              <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 text-left whitespace-nowrap">Remarks{grip('remarks')}</th>
              <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1.5 text-center whitespace-nowrap">Actions{grip('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(w => (
              <tr key={w.id} className={`border-b border-gray-100 ${w.status === 'Inactive' ? 'opacity-50' : w.status === 'On Leave' ? 'bg-amber-50/40' : ''}`}>
                <td className="sticky left-0 z-10 bg-white px-1 py-0.5"><input defaultValue={w.worker_no || ''} onBlur={e => guard(() => updateWorkerField(w.id, 'worker_no', e.target.value))} className="border rounded px-1 py-0.5 text-[11px] w-full" /></td>
                <td style={{ left: colW.id }} className="sticky z-10 bg-white px-2 py-0.5 font-medium whitespace-nowrap"><input defaultValue={w.name} onBlur={e => e.target.value.trim() && e.target.value !== w.name && guard(() => updateWorkerField(w.id, 'name', e.target.value.trim()))} className="border rounded px-1 py-0.5 text-[11px] w-full" /></td>
                <td className="px-1 py-0.5"><input defaultValue={w.line || ''} onBlur={e => guard(() => updateWorkerField(w.id, 'line', e.target.value))} className="border rounded px-1 py-0.5 text-[11px] w-full" /></td>
                
                <td className="px-1 py-0.5">
                  <select defaultValue={w.supervisor_id || ''} onChange={e => guard(() => updateWorkerField(w.id, 'supervisor_id', e.target.value ? Number(e.target.value) : null))} className="border rounded px-1 py-0.5 text-[11px] bg-white w-full">
                    <option value="">--</option>{supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td className="px-1 py-0.5">
                  <select defaultValue={w.status} onChange={e => guard(() => updateWorkerField(w.id, 'status', e.target.value))} className="border rounded px-1 py-0.5 text-[11px] bg-white w-full">
                    <option value="Active">Active</option><option value="Inactive">Inactive</option><option value="On Leave">On Leave</option>
                  </select>
                </td>
                {payColumns.map(c => (
                  <td key={c.id} className="px-1 py-0.5">
                    <input type="number" step="0.01" defaultValue={payValueByWorker.get(w.id)?.get(c.id) || 0}
                      onBlur={e => guard(() => updateWorkerPayValue(w.id, c.id, Number(parseFloat(e.target.value || '0').toFixed(2))))}
                      className={`border rounded px-1 py-0.5 text-[11px] w-full ${c.type === 'DEDUCT' ? 'text-red-600' : ''}`} />
                  </td>
                ))}
                <td className="px-2 py-0.5 text-center font-bold text-green-600 bg-green-50/50 whitespace-nowrap">{fmt(grossOf(w))}</td>
                <td className="px-2 py-0.5 text-center font-bold text-indigo-600 bg-indigo-50/50 whitespace-nowrap">{fmt(netOf(w))}</td>
                {showAlloc && projects.map(p => (
                  <td key={p.id} className="px-1 py-0.5">
                    <input type="number" step="0.01" min={0} max={100} placeholder="0" defaultValue={allocByWorker.get(w.id)?.get(p.id) ?? ''}
                      onBlur={e => guard(() => updateWorkerAllocationPct(w.id, p.id, Number(e.target.value) || 0))} className="border rounded px-1 py-0.5 text-[11px] w-full" />
                  </td>
                ))}
                <td className="px-1 py-0.5"><input defaultValue={w.remarks || ''} onBlur={e => guard(() => updateWorkerField(w.id, 'remarks', e.target.value))} className="border rounded px-1 py-0.5 text-[11px] w-full" /></td>
                <td className="px-1 py-0.5">
                  <div className="flex gap-1 justify-center">
                    <button onClick={() => guard(() => copyWorker(w.id))} title="Copy" className="text-gray-400 hover:text-indigo-600 p-1"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => confirm(`Delete ${w.name}?`) && guard(() => deleteWorker(w.id))} title="Delete" className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={99} className="text-center text-gray-400 py-8">No workers found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
