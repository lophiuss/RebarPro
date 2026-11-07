'use client'

import React, { useState, useTransition } from 'react'
import {
  ArrowLeftRight, Users, Building2, UserCheck, CheckCircle2,
  AlertCircle, Network, Calendar, ShieldCheck
} from 'lucide-react'
import { transferWorkers, type TransferWorkerPayload } from '../transfer-actions'

type Worker = { id: number; name: string; worker_no: string | null; line: string | null; supervisor_id: number | null }
type Supervisor = { id: number; name: string }
type Movement = {
  id: number
  worker_id: number
  effective_date: string
  from_supervisor_id: number | null
  to_supervisor_id: number | null
  from_line: string | null
  to_line: string | null
  reason: string | null
  transfer_type: string | null
  created_at: string
  worker?: { name: string; worker_no: string | null }
}

export default function TransfersClient({
  workers,
  supervisors,
  initialMovements,
  departments,
}: {
  workers: Worker[]
  supervisors: Supervisor[]
  initialMovements: Movement[]
  departments: string[]
}) {
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<'transfer' | 'org' | 'history'>('transfer')
  const [movements, setMovements] = useState<Movement[]>(initialMovements)

  // Form
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([])
  const [targetSupervisorId, setTargetSupervisorId] = useState<number | undefined>(undefined)
  const [targetLine, setTargetLine] = useState<string>('')
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState<string>('')
  const [transferType, setTransferType] = useState<'permanent' | 'temporary'>('permanent')
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const supNameMap = new Map(supervisors.map(s => [s.id, s.name]))

  function handleTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedWorkerIds.length) return
    setMsg(null)

    startTransition(async () => {
      try {
        const res = await transferWorkers({
          workerIds: selectedWorkerIds,
          toSupervisorId: targetSupervisorId,
          toLine: targetLine || undefined,
          effectiveDate,
          reason,
          transferType,
        })
        setMsg({ type: 'success', text: `Successfully transferred ${res.count} worker(s)!` })
        setSelectedWorkerIds([])
        setReason('')
        setTargetLine('')
        setTargetSupervisorId(undefined)
      } catch (err: any) {
        setMsg({ type: 'error', text: err?.message || 'Transfer failed.' })
      }
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            Worker Transfers &amp; Org Structure
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Supervisor Reassignment, Department Transfers &amp; Org Hierarchy
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setTab('transfer')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === 'transfer' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Transfer Worker
          </button>
          <button
            type="button"
            onClick={() => setTab('org')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
              tab === 'org' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Network className="w-3.5 h-3.5" /> Org Chart
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === 'history' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Transfer History
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* TAB 1: Transfer Form */}
      {tab === 'transfer' && (
        <form onSubmit={handleTransfer} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 max-w-xl mx-auto">
          <h2 className="text-base font-bold text-slate-900">Transfer Worker(s)</h2>
          <p className="text-xs text-slate-400">
            Reassign supervisor or department. Future overtime plans will be reassigned automatically.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Worker(s) <span className="text-blue-600">({selectedWorkerIds.length} selected)</span>
            </label>
            <div className="border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
              {workers.map(w => (
                <label key={w.id} className="flex items-center justify-between text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedWorkerIds.includes(w.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedWorkerIds(prev => [...prev, w.id])
                        else setSelectedWorkerIds(prev => prev.filter(id => id !== w.id))
                      }}
                      className="w-3.5 h-3.5 rounded text-blue-600"
                    />
                    <span className="font-medium">{w.name} {w.worker_no ? `(${w.worker_no})` : ''}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{w.line || 'Unassigned'} · {supNameMap.get(w.supervisor_id || 0) || 'No Sup'}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Supervisor</label>
              <select
                value={targetSupervisorId ?? ''}
                onChange={e => setTargetSupervisorId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
              >
                <option value="">Keep Existing Supervisor</option>
                {supervisors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Department / Line</label>
              <select
                value={targetLine}
                onChange={e => setTargetLine(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
              >
                <option value="">Keep Existing Line</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Effective Date</label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Transfer Type</label>
              <select
                value={transferType}
                onChange={e => setTransferType(e.target.value as any)}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
              >
                <option value="permanent">Permanent Transfer</option>
                <option value="temporary">Temporary Loan</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Transfer Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Reassigned to Line B for precast beam production surge"
              className="w-full text-xs border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || !selectedWorkerIds.length || (!targetSupervisorId && !targetLine)}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-xs"
          >
            Confirm &amp; Execute Transfer
          </button>
        </form>
      )}

      {/* TAB 2: Visual Org Chart */}
      {tab === 'org' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Network className="w-4 h-4 text-blue-600" /> Plant Reporting Org Hierarchy
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supervisors.map(s => {
              const assigned = workers.filter(w => w.supervisor_id === s.id)
              return (
                <div key={s.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900">{s.name}</span>
                        <p className="text-[10px] text-slate-400">Supervisor</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-[10px]">
                      {assigned.length} workers
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-1 max-h-40 overflow-y-auto">
                    {assigned.map(w => (
                      <div key={w.id} className="p-2 rounded-lg bg-white border border-slate-200/80 text-[11px] flex items-center justify-between">
                        <span className="font-medium text-slate-700">{w.name}</span>
                        <span className="text-[10px] text-slate-400">{w.line || '—'}</span>
                      </div>
                    ))}
                    {assigned.length === 0 && (
                      <p className="text-[11px] text-slate-400 italic">No workers assigned.</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 3: History */}
      {tab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Transfer Audit History</h2>
          <div className="divide-y divide-slate-100">
            {movements.map(m => (
              <div key={m.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold text-slate-900">
                    {m.worker?.name || `Worker #${m.worker_id}`}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <span>{supNameMap.get(m.from_supervisor_id || 0) || m.from_line || 'Previous'}</span>
                    <span>&rarr;</span>
                    <span className="font-semibold text-blue-700">{supNameMap.get(m.to_supervisor_id || 0) || m.to_line || 'New'}</span>
                    <span className="text-slate-400">· Effective: {m.effective_date}</span>
                  </div>
                  {m.reason && <p className="text-[11px] text-slate-600 italic mt-0.5">&ldquo;{m.reason}&rdquo;</p>}
                </div>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] uppercase font-semibold self-start sm:self-center">
                  {m.transfer_type || 'permanent'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
