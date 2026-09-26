'use client'

import { guard } from '../feedback'
import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ChevronLeft, ChevronRight, Check, X, Copy, Eraser, Send, CheckCircle, XCircle, Edit3, ArrowRightLeft, Search, ArrowUpDown } from 'lucide-react'
import {
  updateOtDayHours, updateOtMonthMeta, bulkFillOt, copyOtMonth, clearOtMonth,
  otApprovalAction, updateWorkerAllocationPct, transferWorker, updateWorkerField,
} from '../actions'

type Worker = {
  id: number; name: string; worker_no: string | null; designation: string | null; line: string | null
  supervisor_id: number | null; supervisors: { name: string } | null
}
type Supervisor = { id: number; name: string }
type Project = { id: number; name: string; type_id: number | null; status: string }
type ProjectType = { id: number; name: string }
type OtDay = { id: number; day: string; basic: number; ot: number; allocations: { project_id: number; percentage: number }[] }
type OtMonthRow = { id: number; worker_id: number; mode: string; remark: string | null; days: OtDay[] }
type Allocation = { worker_id: number; project_id: number; percentage: number }
type Approval = {
  supervisor_id: number; status: string
  submitted_by: string | null; submitted_at: string | null
  approved_by: string | null; approved_at: string | null
  rejected_by: string | null; rejected_at: string | null
  submitter: { full_name: string | null } | null
  approver: { full_name: string | null } | null
  rejecter: { full_name: string | null } | null
}
type Target = { project_id: number; production_target: number; delivery_target: number; general_target: number }
type Claim = { project_id: number; type: string; amount: number; date: string }
type PayValue = { worker_id: number; pay_column_id: number; value: number }
type PayColumn = { id: number; key: string }

function fmt(n: number, digits = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits })
}
function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
function isSunday(month: string, day: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, Number(day)).getDay() === 0
}
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

const STATUS_STYLE: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600', 'Pending Approval': 'bg-amber-100 text-amber-700',
  Approved: 'bg-green-100 text-green-700', Rejected: 'bg-red-100 text-red-700',
}


export default function OTClient({
  canSeeWages, month, myRole, myUserId, mySupervisorName, workers, supervisors, projects, projectTypes,
  otMonths, allocations, otApprovals, targets, claims, payValues, payColumns,
}: {
  month: string; myRole: string; myUserId: string | null; mySupervisorName: string | null
  workers: Worker[]; supervisors: Supervisor[]; projects: Project[]; projectTypes: ProjectType[]
  otMonths: OtMonthRow[]; allocations: Allocation[]; otApprovals: Approval[]
  targets: Target[]; claims: Claim[]; payValues: PayValue[]; payColumns: PayColumn[]; canSeeWages: boolean
}) {
  const router = useRouter()
  const canApprove = myRole === 'admin' || myRole === 'manager'
  const canSubmit = myRole === 'admin' || myRole === 'manager' || myRole === 'supervisor'

  const [currentSupervisor, setCurrentSupervisor] = useState<string>(mySupervisorName || '__ALL__')
  const [bulkValues, setBulkValues] = useState<Record<number, string>>({})
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copyFromMonth, setCopyFromMonth] = useState('')
  const [hideDates, setHideDates] = useState(false)
  const [hideAllocations, setHideAllocations] = useState(false)
  const [transferModal, setTransferModal] = useState<{ workerId: number; workerName: string } | null>(null)
  const [transferToSup, setTransferToSup] = useState('')
  const [transferFromDay, setTransferFromDay] = useState('01')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' })
  const [applying, setApplying] = useState(false)
  const [bulkBusy, setBulkBusy] = useState<number | null>(null)
  const [flashId, setFlashId] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  // Column widths (px) — drag the right edge of any header to resize. All
  // day columns share one width, as do all project-allocation columns.
  const [colW, setColW] = useState<Record<string, number>>({
    id: 64, name: 150, supervisor: 110, dept: 110, mode: 92, remarks: 110, bulk: 92, day: 44, total: 72, alloc: 64, transfer: 92,
  })
  function startResize(key: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = colW[key]
    const move = (ev: MouseEvent) => setColW(prev => ({ ...prev, [key]: Math.max(30, startW + ev.clientX - startX) }))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const grip = (key: string) => <span onMouseDown={e => startResize(key, e)} onClick={e => e.stopPropagation()} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300" />
  const distinctDepts = [...new Set(workers.map(w => w.line).filter(Boolean))].sort() as string[]

  const daysArray = Array.from({ length: daysInMonth(month) }, (_, i) => String(i + 1).padStart(2, '0'))
  const otMonthByWorker = useMemo(() => new Map(otMonths.map(m => [m.worker_id, m])), [otMonths])
  const dayByWorkerDay = useMemo(() => {
    const m = new Map<string, OtDay>()
    for (const om of otMonths) for (const d of om.days) m.set(`${om.worker_id}:${d.day}`, d)
    return m
  }, [otMonths])
  const allocByWorker = useMemo(() => {
    const m = new Map<number, Map<number, number>>()
    for (const a of allocations) { if (!m.has(a.worker_id)) m.set(a.worker_id, new Map()); m.get(a.worker_id)!.set(a.project_id, a.percentage) }
    return m
  }, [allocations])
  const approvalBySupervisor = useMemo(() => new Map(otApprovals.map(a => [a.supervisor_id, a])), [otApprovals])
  const payColumnIdByKey = useMemo(() => new Map(payColumns.map(c => [c.key, c.id])), [payColumns])
  const payValueByWorker = useMemo(() => {
    const m = new Map<number, Map<number, number>>()
    for (const v of payValues) { if (!m.has(v.worker_id)) m.set(v.worker_id, new Map()); m.get(v.worker_id)!.set(v.pay_column_id, v.value) }
    return m
  }, [payValues])

  const activeProjects = projects.filter(p => p.status === 'Active')
  const sortedActiveProjects = [...activeProjects].sort((a, b) => {
    const ta = projectTypes.find(t => t.id === a.type_id)?.name || ''
    const tb = projectTypes.find(t => t.id === b.type_id)?.name || ''
    return ta !== tb ? ta.localeCompare(tb) : a.name.localeCompare(b.name)
  })

  const myWorkers = currentSupervisor === '__ALL__' ? workers : workers.filter(w => w.supervisors?.name === currentSupervisor)
  const currentSupervisorRow = supervisors.find(s => s.name === currentSupervisor)
  const monthApproval = currentSupervisorRow ? approvalBySupervisor.get(currentSupervisorRow.id) : undefined
  const monthStatus = currentSupervisor !== '__ALL__' ? (monthApproval?.status || 'Draft') : null
  const isLocked = currentSupervisor === '__ALL__' ? true : (monthStatus === 'Pending Approval' || monthStatus === 'Approved')

  function getDayHours(workerId: number, day: string) {
    const rec = dayByWorkerDay.get(`${workerId}:${day}`)
    const defaultBasic = isSunday(month, day) ? 0 : 8
    return { basic: rec?.basic ?? defaultBasic, ot: rec?.ot ?? 0, allocations: rec?.allocations || [] }
  }
  function getWorkerTotalOT(workerId: number) {
    return daysArray.reduce((s, d) => s + getDayHours(workerId, d).ot, 0)
  }
  function getAllocation(workerId: number, projectId: number) {
    return allocByWorker.get(workerId)?.get(projectId) ?? ''
  }

  const searchLower = searchTerm.trim().toLowerCase()
  const visibleWorkers = (() => {
    const filtered = myWorkers.filter(w => !searchLower || w.name.toLowerCase().includes(searchLower) || (w.worker_no || '').toLowerCase().includes(searchLower))
    if (!sortConfig.key) return filtered
    const key = sortConfig.key
    const getVal = (w: Worker): string | number => {
      if (key === 'name') return w.name
      if (key === 'supervisor') return w.supervisors?.name || ''
      if (key === 'dept') return w.line || ''
      if (key === 'id') return w.worker_no || ''
      if (key === 'totalOT') return getWorkerTotalOT(w.id)
      return ''
    }
    return [...filtered].sort((a, b) => {
      const av = getVal(a), bv = getVal(b)
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  })()

  function requestSort(key: string) {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }))
  }
  function SortIcon({ col }: { col: string }) {
    return <ArrowUpDown className="w-3 h-3 inline ml-0.5" style={{ opacity: sortConfig.key === col ? 1 : 0.35 }} />
  }

  function changeMonth(newMonth: string) {
    startTransition(() => router.push(`/plantpro/ot?month=${newMonth}`))
  }

  let totalBasic = 0, totalOT = 0
  myWorkers.forEach(w => daysArray.forEach(d => { const { basic, ot } = getDayHours(w.id, d); totalBasic += basic; totalOT += ot }))

  const currentClaims = claims.filter(c => c.date?.startsWith(month))
  const targetByProject = new Map(targets.map(t => [t.project_id, t]))
  const payrateId = payColumnIdByKey.get('payrate'), utilityId = payColumnIdByKey.get('utility'), rentalId = payColumnIdByKey.get('rental'), levyId = payColumnIdByKey.get('levy')

  const projectEfficiency = sortedActiveProjects.map(proj => {
    let projHours = 0, projCost = 0
    myWorkers.forEach(w => {
      const monthlyPct = Number(getAllocation(w.id, proj.id)) || 0
      const pv = payValueByWorker.get(w.id)
      const payrate = payrateId ? (pv?.get(payrateId) || 0) : 0
      const utility = utilityId ? (pv?.get(utilityId) || 0) : 0
      const rental = rentalId ? (pv?.get(rentalId) || 0) : 0
      const levy = levyId ? (pv?.get(levyId) || 0) : 0
      const netPay = payrate - (utility + rental + levy)
      daysArray.forEach(day => {
        const { basic, ot, allocations: dayAllocs } = getDayHours(w.id, day)
        const dayTotal = basic + ot
        const override = dayAllocs.find(a => a.project_id === proj.id)
        const pct = override ? override.percentage : monthlyPct
        const frac = pct / 100
        projHours += dayTotal * frac
        projCost += (netPay / daysInMonth(month)) * frac
      })
    })
    const t = targetByProject.get(proj.id)
    const claimSum = (type: string) => currentClaims.filter(c => c.project_id === proj.id && c.type === type).reduce((s, c) => s + Number(c.amount), 0)
    const per = (num: number, denom: number) => denom > 0 ? fmt(num / denom) : '-'
    return {
      name: proj.name,
      type: projectTypes.find(t2 => t2.id === proj.type_id)?.name || '-',
      hours: fmt(projHours, 0),
      mhProd: per(projHours, t?.production_target || 0), mhDel: per(projHours, t?.delivery_target || 0), mhGen: per(projHours, t?.general_target || 0),
      rmProd: canSeeWages ? per(projCost + claimSum('Production'), t?.production_target || 0) : '-',
      rmDel: canSeeWages ? per(projCost + claimSum('Delivery'), t?.delivery_target || 0) : '-',
      rmGen: canSeeWages ? per(projCost + claimSum('General'), t?.general_target || 0) : '-',
    }
  })

  const supervisorsWithWorkers = supervisors.filter(s => workers.some(w => w.supervisor_id === s.id))
  const approvalsBySupervisorRows = supervisorsWithWorkers.map(s => ({
    supervisor: s, approval: approvalBySupervisor.get(s.id), workerCount: workers.filter(w => w.supervisor_id === s.id).length,
  }))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search name or ID..." className="border rounded-md pl-8 pr-3 py-1.5 text-sm w-44" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">Viewing as:</label>
          <select value={currentSupervisor} onChange={e => setCurrentSupervisor(e.target.value)} className="border rounded-md px-2 py-0.5 text-sm bg-white">
            <option value="__ALL__">All Supervisors</option>
            {supervisors.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center">
              <button onClick={() => changeMonth(shiftMonth(month, -1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronLeft className="w-5 h-5" /></button>
              <span className="font-semibold px-2 flex items-center gap-1.5">{monthLabel(month)}{isPending && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}</span>
              <button onClick={() => changeMonth(shiftMonth(month, 1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronRight className="w-5 h-5" /></button>
            </div>
            {monthStatus === null ? (
              <span className="text-xs text-gray-400">Select a supervisor to see their approval status</span>
            ) : (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_STYLE[monthStatus]}`}>{monthStatus}</span>
            )}
            {monthApproval?.submitter?.full_name && (
              <span className="text-xs text-gray-500">Submitted by <strong>{monthApproval.submitter.full_name}</strong></span>
            )}
            {monthStatus === 'Approved' && monthApproval?.approver?.full_name && <span className="text-xs text-gray-500">· Approved by <strong className="text-green-600">{monthApproval.approver.full_name}</strong></span>}
            {monthStatus === 'Rejected' && monthApproval?.rejecter?.full_name && <span className="text-xs text-gray-500">· Rejected by <strong className="text-red-600">{monthApproval.rejecter.full_name}</strong></span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setHideDates(v => !v)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">{hideDates ? 'Show Dates' : 'Hide Dates'}</button>
            <button onClick={() => setHideAllocations(v => !v)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">{hideAllocations ? 'Show Allocations' : 'Hide Allocations'}</button>
            {!isLocked && (
              <>
                <button onClick={() => setShowCopyModal(true)} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200"><Copy className="w-3.5 h-3.5" /> Copy From...</button>
                <button onClick={() => confirm(`Clear all OT data for ${monthLabel(month)}?`) && guard(() => clearOtMonth(myWorkers.map(w => w.id), month), 'Clearing month…')} className="flex items-center gap-1 text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-100"><Eraser className="w-3.5 h-3.5" /> Clear Month</button>
              </>
            )}
            {currentSupervisorRow && canSubmit && monthStatus === 'Draft' && (
              <button onClick={() => guard(() => otApprovalAction(month, currentSupervisorRow.id, 'submit'))} className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700"><Send className="w-3.5 h-3.5" /> Submit for Approval</button>
            )}
            {currentSupervisorRow && canSubmit && monthStatus === 'Rejected' && (
              <button onClick={() => guard(() => otApprovalAction(month, currentSupervisorRow.id, 'resubmit'))} className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700"><Send className="w-3.5 h-3.5" /> Resubmit</button>
            )}
            {currentSupervisorRow && canApprove && monthStatus === 'Pending Approval' && (
              <>
                <button onClick={() => guard(() => otApprovalAction(month, currentSupervisorRow.id, 'approve'))} className="flex items-center gap-1 text-xs bg-green-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-700"><Check className="w-3.5 h-3.5" /> Approve</button>
                <button onClick={() => guard(() => otApprovalAction(month, currentSupervisorRow.id, 'reject'))} className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-red-700"><X className="w-3.5 h-3.5" /> Reject</button>
              </>
            )}
            {currentSupervisorRow && canApprove && (monthStatus === 'Approved' || monthStatus === 'Pending Approval') && (
              <button onClick={() => guard(() => otApprovalAction(month, currentSupervisorRow.id, 'unlock'))} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200"><Edit3 className="w-3.5 h-3.5" /> Unlock</button>
            )}
          </div>
        </div>

        {currentSupervisor === '__ALL__' && canApprove && (
          <div className="p-4 border-b">
            <h4 className="text-sm font-bold mb-2">Approvals by Supervisor — {monthLabel(month)}</h4>
            {approvalsBySupervisorRows.length === 0 ? <p className="text-xs text-gray-400">No supervisors with workers yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b text-xs text-gray-500 uppercase"><th className="pb-2">Supervisor</th><th>Workers</th><th>Status</th><th>Submitted</th><th className="text-right">Actions</th></tr></thead>
                <tbody>
                  {approvalsBySupervisorRows.map(row => {
                    const st = row.approval?.status || 'Draft'
                    return (
                      <tr key={row.supervisor.id} className="border-b border-gray-100">
                        <td className="py-1.5">{row.supervisor.name}</td>
                        <td>{row.workerCount}</td>
                        <td><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[st]}`}>{st}</span></td>
                        <td className="text-xs text-gray-500">{row.approval?.submitter?.full_name || '-'}</td>
                        <td className="text-right whitespace-nowrap">
                          {st === 'Pending Approval' && (
                            <>
                              <button onClick={() => guard(() => otApprovalAction(month, row.supervisor.id, 'approve'))} className="text-xs bg-green-600 text-white px-2 py-1 rounded mr-1">Approve</button>
                              <button onClick={() => guard(() => otApprovalAction(month, row.supervisor.id, 'reject'))} className="text-xs bg-red-600 text-white px-2 py-1 rounded">Reject</button>
                            </>
                          )}
                          {(st === 'Approved' || st === 'Pending Approval') && (
                            <button onClick={() => guard(() => otApprovalAction(month, row.supervisor.id, 'unlock'))} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded ml-1">Unlock</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-bold">
                    <td className="py-1.5">Total</td>
                    <td>{approvalsBySupervisorRows.reduce((sum, r) => sum + r.workerCount, 0)}</td>
                    <td colSpan={3} className="text-xs font-normal text-gray-500">{approvalsBySupervisorRows.length} supervisors</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        <datalist id="ot-dept-list">{distinctDepts.map(d => <option key={d} value={d} />)}</datalist>
        <div className={`overflow-auto max-h-[calc(100vh-14rem)] transition-opacity ${isPending ? 'opacity-50' : ''}`}>
          <table className="text-xs border-collapse" style={{ tableLayout: 'fixed', width: (colW.id + colW.name + colW.supervisor + colW.dept + colW.mode + colW.remarks + colW.bulk + (hideDates ? 0 : daysArray.length * colW.day) + colW.total + (hideAllocations ? 0 : sortedActiveProjects.length * colW.alloc) + colW.transfer) }}>
            <colgroup>
              <col style={{ width: colW.id }} /><col style={{ width: colW.name }} /><col style={{ width: colW.supervisor }} /><col style={{ width: colW.dept }} />
              <col style={{ width: colW.mode }} /><col style={{ width: colW.remarks }} /><col style={{ width: colW.bulk }} />
              {!hideDates && daysArray.map(d => <col key={d} style={{ width: colW.day }} />)}
              <col style={{ width: colW.total }} />
              {!hideAllocations && sortedActiveProjects.map(p => <col key={p.id} style={{ width: colW.alloc }} />)}
              <col style={{ width: colW.transfer }} />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left cursor-pointer" onClick={() => requestSort('id')}>ID <SortIcon col="id" />{grip('id')}</th>
                <th style={{ left: colW.id }} className="sticky top-0 z-30 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left cursor-pointer" onClick={() => requestSort('name')}>Name <SortIcon col="name" />{grip('name')}</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left cursor-pointer" onClick={() => requestSort('supervisor')}>Supervisor <SortIcon col="supervisor" />{grip('supervisor')}</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left cursor-pointer" onClick={() => requestSort('dept')}>Dept <SortIcon col="dept" />{grip('dept')}</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left">Mode{grip('mode')}</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left">Remarks{grip('remarks')}</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left" title="Fills every weekday. Sundays/holidays skipped.">Bulk OT{grip('bulk')}</th>
                {!hideDates && daysArray.map(d => (
                  <th key={d} className={`sticky top-0 z-20 shadow-[inset_0_-1px_0_#e5e7eb] px-0 py-0.5 text-center text-xs font-normal leading-tight ${isSunday(month, d) ? 'bg-red-50 text-red-500' : 'bg-gray-50'}`}>
                    <div className="text-[9px] text-gray-400">{'SMTWTFS'[new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, Number(d)).getDay()]}</div>
                    <div className="font-semibold">{d}</div>{grip('day')}
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-center cursor-pointer" onClick={() => requestSort('totalOT')}>Total OT <SortIcon col="totalOT" />{grip('total')}</th>
                {!hideAllocations && sortedActiveProjects.map(p => <th key={p.id} className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-center !px-1 truncate" title={p.name}>{p.name} (%){grip('alloc')}</th>)}
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-center">Transfer{grip('transfer')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleWorkers.map(w => {
                const totalOT = getWorkerTotalOT(w.id)
                const om = otMonthByWorker.get(w.id)
                return (
                  <tr key={w.id} className={`border-b border-gray-100 transition-colors duration-700 ${flashId === w.id ? 'bg-green-100' : 'hover:bg-gray-50'}`}>
                    <td className={`sticky left-0 z-10 transition-colors duration-700 ${flashId === w.id ? 'bg-green-100' : 'bg-white'} px-2 py-0.5 text-gray-500 truncate`}>{w.worker_no || '-'}</td>
                    <td style={{ left: colW.id }} className={`sticky z-10 transition-colors duration-700 ${flashId === w.id ? 'bg-green-100' : 'bg-white'} px-2 py-0.5 font-medium truncate`} title={w.name}>{w.name}</td>
                    <td className="px-2 py-0.5 text-xs text-gray-500 truncate">{w.supervisors?.name || '—'}</td>
                    <td className="px-1 py-0.5">
                      <input list="ot-dept-list" defaultValue={w.line || ''} disabled={isLocked} title="Department — edit to rename" onBlur={e => { const v = e.target.value.trim(); if (v !== (w.line || '')) guard(() => updateWorkerField(w.id, 'line', v || null)) }} className="text-xs border rounded px-1 py-0 h-5 w-full disabled:opacity-50" />
                    </td>
                    <td className="px-1 py-0.5">
                      <select defaultValue={om?.mode || 'General'} disabled={isLocked} onChange={e => guard(() => updateOtMonthMeta(w.id, month, 'mode', e.target.value))} className="text-xs border rounded px-1 py-0 h-5 bg-white w-full disabled:opacity-50">
                        <option value="Production">Production</option><option value="Delivery">Delivery</option><option value="General">General</option>
                      </select>
                    </td>
                    <td className="px-1 py-0.5"><input defaultValue={om?.remark || ''} disabled={isLocked} onBlur={e => guard(() => updateOtMonthMeta(w.id, month, 'remark', e.target.value))} className="text-xs border rounded px-1 py-0 h-5 w-full disabled:opacity-50" /></td>
                    <td className="px-1 py-0.5">
                      <div className="flex gap-1">
                        <input type="number" value={bulkValues[w.id] || ''} disabled={isLocked} onChange={e => setBulkValues(prev => ({ ...prev, [w.id]: e.target.value }))} className="flex-1 min-w-0 border rounded px-1 py-0 h-5 text-xs disabled:opacity-50" placeholder="hrs" />
                        <button disabled={isLocked || bulkBusy === w.id} title="Fill every weekday with this OT" onClick={async () => { setBulkBusy(w.id); await guard(() => bulkFillOt(w.id, month, bulkValues[w.id] || '0'), 'Filling OT…'); setBulkBusy(null); setFlashId(w.id); setTimeout(() => setFlashId(null), 1400) }} className="text-xs bg-gray-100 hover:bg-indigo-100 px-1.5 rounded disabled:opacity-50 transition-colors">{bulkBusy === w.id ? <Loader2 className="w-3 h-3 animate-spin text-indigo-600" /> : <Check className="w-3 h-3" />}</button>
                      </div>
                    </td>
                    {!hideDates && daysArray.map(day => {
                      const { basic, ot } = getDayHours(w.id, day)
                      return (
                        <td key={day} className={`px-0.5 py-0.5 ${isSunday(month, day) ? 'bg-red-50/50' : ''}`}>
                          <div className="flex flex-col w-full">
                            <input key={`b-${w.id}-${day}-${basic}`} type="number" defaultValue={basic} disabled={isLocked} title="Basic" onBlur={e => guard(() => updateOtDayHours(w.id, month, day, 'basic', e.target.value))} className="border rounded px-0.5 py-0 h-5 text-[11px] w-full disabled:opacity-50" />
                            <input key={`o-${w.id}-${day}-${ot}`} type="number" defaultValue={ot || ''} disabled={isLocked} title="OT" placeholder="0" onBlur={e => guard(() => updateOtDayHours(w.id, month, day, 'ot', e.target.value))} className="border rounded px-0.5 py-0 h-5 text-[11px] w-full disabled:opacity-50" />
                          </div>
                        </td>
                      )
                    })}
                    <td className={`px-2 py-0.5 text-center font-bold ${totalOT > 104 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalOT)}</td>
                    {!hideAllocations && sortedActiveProjects.map(p => (
                      <td key={p.id} className="px-1 py-0.5">
                        <input type="number" defaultValue={getAllocation(w.id, p.id)} disabled={isLocked} min={0} max={100} placeholder="0" onBlur={e => guard(() => updateWorkerAllocationPct(w.id, p.id, Number(e.target.value) || 0))} className="w-full border rounded px-1 py-0 h-5 text-xs disabled:opacity-50" />
                      </td>
                    ))}
                    <td className="px-1 py-0.5 text-center">
                      <button disabled={isLocked} onClick={() => { setTransferModal({ workerId: w.id, workerName: w.name }); setTransferToSup(''); setTransferFromDay(String(new Date().getDate()).padStart(2, '0')) }} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded disabled:opacity-50 whitespace-nowrap"><ArrowRightLeft className="w-3 h-3 inline mr-0.5" /> Transfer</button>
                    </td>
                  </tr>
                )
              })}
              {visibleWorkers.length === 0 && <tr><td colSpan={daysArray.length + 12} className="text-center text-gray-400 py-8">No workers found for this filter.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-6 p-4 border-t text-sm">
          <span>Total Manhours: <strong>{fmt(totalBasic + totalOT)}</strong></span>
          <span>Basic: <strong>{fmt(totalBasic)}</strong></span>
          <span>OT: <strong>{fmt(totalOT)}</strong></span>
        </div>

        <div className="p-4 border-t">
          <h4 className="text-sm font-bold mb-3">Efficiency by Project</h4>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead><tr className="text-left text-xs text-gray-500 uppercase border-b"><th className="pb-2">Project</th><th>Type</th><th>Hours</th><th>MH/Prod</th><th>MH/Del</th><th>MH/Gen</th><th>RM/Prod</th><th>RM/Del</th><th>RM/Gen</th></tr></thead>
              <tbody>
                {projectEfficiency.map(pe => (
                  <tr key={pe.name} className="border-b border-gray-100">
                    <td className="py-1.5 font-medium">{pe.name}</td><td className="text-xs text-gray-500">{pe.type}</td>
                    <td>{pe.hours}</td><td>{pe.mhProd}</td><td>{pe.mhDel}</td><td>{pe.mhGen}</td>
                    <td>{pe.rmProd}</td><td>{pe.rmDel}</td><td>{pe.rmGen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!canSeeWages && <p className="text-xs text-gray-400 mt-2">RM figures show &apos;-&apos; if your role can&apos;t see wage data.</p>}
        </div>
      </div>

      {showCopyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCopyModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Copy OT Data From...</h2>
            <p className="text-xs text-gray-400 mb-4">Select a month to copy into {monthLabel(month)}.</p>
            <input type="month" value={copyFromMonth} onChange={e => setCopyFromMonth(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCopyModal(false)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm">Cancel</button>
              <button disabled={!copyFromMonth || applying} onClick={async () => { setApplying(true); await guard(() => copyOtMonth(myWorkers.map(w => w.id), copyFromMonth, month), 'Copying month…'); setApplying(false); setShowCopyModal(false); setCopyFromMonth('') }} className="bg-indigo-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm">Copy Data</button>
            </div>
          </div>
        </div>
      )}

      {transferModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setTransferModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Transfer Worker</h2>
            <p className="text-xs text-gray-400 mb-4">Transfer <strong>{transferModal.workerName}</strong> to a different supervisor from a specific day.</p>
            <label className="block text-xs font-medium text-gray-500 mb-1">Transfer To</label>
            <select value={transferToSup} onChange={e => setTransferToSup(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-3 bg-white">
              <option value="">-- Select --</option>
              {supervisors.filter(s => s.name !== currentSupervisor).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label className="block text-xs font-medium text-gray-500 mb-1">Effective From Day</label>
            <select value={transferFromDay} onChange={e => setTransferFromDay(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-4 bg-white">
              {daysArray.map(d => <option key={d} value={d}>Day {d}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setTransferModal(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm">Cancel</button>
              <button disabled={!transferToSup} onClick={() => guard(() => transferWorker(transferModal.workerId, month, transferFromDay, Number(transferToSup))).then(() => setTransferModal(null))} className="bg-indigo-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm">Transfer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
