'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Calendar, ChevronLeft, ChevronRight, Save, CheckCircle2, AlertTriangle, X, CloudCog } from 'lucide-react'
import { listMonthDates, type DlerDailyM3, type DlerDepartment, type DlerProject } from '@/lib/dler-math'
import { saveDailyM3Batch } from '../actions'

function shiftDate(dateStr: string, delta: number): string {
  const dt = new Date(`${dateStr}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

export default function M3InputClient({
  month,
  selectedDate,
  departments,
  projects,
  entries,
}: {
  month: string
  selectedDate: string
  departments: DlerDepartment[]
  projects: DlerProject[]
  entries: DlerDailyM3[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'daily' | 'matrix'>('daily')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const monthDates = useMemo(() => listMonthDates(month), [month])
  const productionDepts = useMemo(() => departments.filter(d => d.kind === 'production'), [departments])
  const deptMap = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])

  const entryMap = useMemo(() => {
    const m = new Map<string, DlerDailyM3>()
    for (const e of entries) m.set(e.entry_key, e)
    return m
  }, [entries])

  // Daily form drafts keyed by `project:${id}` or `department:${id}`
  const buildDailyDrafts = React.useCallback(
    (dt: string) => {
      const out: Record<string, { val: string; remarks: string }> = {}
      for (const p of projects) {
        const e = entryMap.get(`project:${dt}:${p.id}`)
        out[`project:${p.id}`] = {
          val: e ? String(e.m3_volume) : '',
          remarks: e?.remarks ?? '',
        }
      }
      for (const d of productionDepts) {
        const e = entryMap.get(`department:${dt}:${d.id}`)
        out[`department:${d.id}`] = {
          val: e ? String(e.m3_volume) : '',
          remarks: e?.remarks ?? '',
        }
      }
      return out
    },
    [projects, productionDepts, entryMap]
  )

  const [dailyDrafts, setDailyDrafts] = useState(() => buildDailyDrafts(selectedDate))

  React.useEffect(() => {
    setDailyDrafts(buildDailyDrafts(selectedDate))
  }, [buildDailyDrafts, selectedDate])

  function goPeriod(nextMonth: string, nextDate: string) {
    router.push(`/dler/m3?month=${nextMonth}&date=${nextDate}`)
  }

  const dailyTotal = useMemo(() => {
    return Object.values(dailyDrafts).reduce((s, d) => s + (Number(d.val) || 0), 0)
  }, [dailyDrafts])

  function saveDaily() {
    setFeedback(null)
    const batch: Parameters<typeof saveDailyM3Batch>[0] = []
    for (const p of projects) {
      const d = dailyDrafts[`project:${p.id}`]
      batch.push({
        entry_date: selectedDate,
        target_type: 'project',
        project_id: p.id,
        m3_volume: Number(d?.val) || 0,
        remarks: d?.remarks || null,
      })
    }
    for (const dep of productionDepts) {
      const d = dailyDrafts[`department:${dep.id}`]
      batch.push({
        entry_date: selectedDate,
        target_type: 'department',
        department_id: dep.id,
        m3_volume: Number(d?.val) || 0,
        remarks: d?.remarks || null,
      })
    }

    startTransition(async () => {
      try {
        await saveDailyM3Batch(batch)
        setFeedback({ kind: 'ok', text: `Saved m³ production for ${selectedDate}.` })
        router.refresh()
      } catch (err: any) {
        setFeedback({ kind: 'err', text: err?.message ?? 'Save failed' })
      }
    })
  }

  function saveMatrixCell(targetType: 'project' | 'department', targetId: number, dt: string, val: number) {
    setFeedback(null)
    startTransition(async () => {
      try {
        await saveDailyM3Batch([
          {
            entry_date: dt,
            target_type: targetType,
            project_id: targetType === 'project' ? targetId : null,
            department_id: targetType === 'department' ? targetId : null,
            m3_volume: val,
          },
        ])
        setFeedback({ kind: 'ok', text: `Updated ${dt} m³.` })
        router.refresh()
      } catch (err: any) {
        setFeedback({ kind: 'err', text: err?.message ?? 'Update failed' })
      }
    })
  }

  return (
    <div className={`max-w-[1600px] mx-auto p-4 md:p-6 space-y-5 transition-opacity ${isPending ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Boxes className="w-6 h-6 text-sky-600" />
              Daily m³ Volume Input (David)
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              <CloudCog className="w-3 h-3" /> Manual Input (Stage 2: ERP Sync Ready)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter daily concrete production volume (m³) per project &amp; production department.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode('daily')}
              className={`px-3 py-1.5 rounded-lg transition ${mode === 'daily' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600'}`}
            >
              Daily Input
            </button>
            <button
              type="button"
              onClick={() => setMode('matrix')}
              className={`px-3 py-1.5 rounded-lg transition ${mode === 'matrix' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600'}`}
            >
              Monthly m³ Matrix
            </button>
          </div>

          {mode === 'daily' ? (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2 py-1">
              <button type="button" onClick={() => { const d = shiftDate(selectedDate, -1); goPeriod(d.slice(0, 7), d) }} className="p-1 hover:bg-slate-100 rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => e.target.value && goPeriod(e.target.value.slice(0, 7), e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none"
              />
              <button type="button" onClick={() => { const d = shiftDate(selectedDate, 1); goPeriod(d.slice(0, 7), d) }} className="p-1 hover:bg-slate-100 rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2 py-1">
              <button type="button" onClick={() => { const m = shiftMonth(month, -1); goPeriod(m, `${m}-01`) }} className="p-1 hover:bg-slate-100 rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="month"
                value={month}
                onChange={e => e.target.value && goPeriod(e.target.value, `${e.target.value}-01`)}
                className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none"
              />
              <button type="button" onClick={() => { const m = shiftMonth(month, 1); goPeriod(m, `${m}-01`) }} className="p-1 hover:bg-slate-100 rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs font-medium ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {feedback.text}
          </span>
          <button onClick={() => setFeedback(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {mode === 'daily' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-900">
              Date: {selectedDate} · Total Output: <span className="text-sky-700">{dailyTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} m³</span>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={saveDaily}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> Save Daily m³
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                  <th className="px-4 py-2.5 text-left">Project / Department</th>
                  <th className="px-4 py-2.5 text-left">Department Type</th>
                  <th className="px-4 py-2.5 text-right">Volume (m³)</th>
                  <th className="px-4 py-2.5 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map(p => {
                  const key = `project:${p.id}`
                  const d = dailyDrafts[key] ?? { val: '', remarks: '' }
                  const deptName = p.department_id ? deptMap.get(p.department_id)?.name : 'Unassigned'
                  return (
                    <tr key={key} className="hover:bg-sky-50/30">
                      <td className="px-4 py-2 font-semibold text-slate-900">{p.name}</td>
                      <td className="px-4 py-2 text-slate-500">{deptName}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          value={d.val}
                          placeholder="0.0"
                          onChange={e => setDailyDrafts(prev => ({ ...prev, [key]: { ...d, val: e.target.value } }))}
                          className="w-28 text-right border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={d.remarks}
                          placeholder="Optional remarks..."
                          onChange={e => setDailyDrafts(prev => ({ ...prev, [key]: { ...d, remarks: e.target.value } }))}
                          className="w-full max-w-xs border border-slate-200 rounded-lg px-2.5 py-1.5"
                        />
                      </td>
                    </tr>
                  )
                })}

                <tr className="bg-slate-50/80">
                  <td colSpan={4} className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Direct Department m³ (Optional — e.g. Batching Plant own output not under a project)
                  </td>
                </tr>
                {productionDepts.map(dep => {
                  const key = `department:${dep.id}`
                  const d = dailyDrafts[key] ?? { val: '', remarks: '' }
                  return (
                    <tr key={key} className="hover:bg-sky-50/30">
                      <td className="px-4 py-2 font-semibold text-slate-800">{dep.name} (Direct)</td>
                      <td className="px-4 py-2 text-slate-500">Department Direct</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          value={d.val}
                          placeholder="0.0"
                          onChange={e => setDailyDrafts(prev => ({ ...prev, [key]: { ...d, val: e.target.value } }))}
                          className="w-28 text-right border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={d.remarks}
                          placeholder="Optional remarks..."
                          onChange={e => setDailyDrafts(prev => ({ ...prev, [key]: { ...d, remarks: e.target.value } }))}
                          className="w-full max-w-xs border border-slate-200 rounded-lg px-2.5 py-1.5"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            Click any cell to edit daily m³ for {month} (saves automatically when leaving the field).
          </div>
          <div className="overflow-auto max-h-[68vh]">
            <table className="text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 px-3 py-2 text-left whitespace-nowrap min-w-[150px] border-r border-slate-200">
                    Project / Dept
                  </th>
                  {monthDates.map(dt => (
                    <th key={dt} className="sticky top-0 z-20 bg-slate-50 px-1 py-2 text-center min-w-[46px]" title={dt}>
                      {dt.slice(8, 10)}
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-sky-50 px-3 py-2 text-right whitespace-nowrap text-sky-800">Total m³</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map(p => {
                  const rowSum = monthDates.reduce(
                    (s, dt) => s + (Number(entryMap.get(`project:${dt}:${p.id}`)?.m3_volume) || 0),
                    0
                  )
                  return (
                    <tr key={`p-${p.id}`} className="hover:bg-slate-50/70">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1 font-semibold text-slate-900 whitespace-nowrap border-r border-slate-200">
                        {p.name}
                      </td>
                      {monthDates.map(dt => {
                        const existing = entryMap.get(`project:${dt}:${p.id}`)
                        const v = existing?.m3_volume ? String(existing.m3_volume) : ''
                        return (
                          <td key={dt} className="p-0.5 text-center">
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              defaultValue={v}
                              onBlur={e => {
                                const next = Number(e.target.value) || 0
                                const prev = Number(existing?.m3_volume ?? 0)
                                if (next !== prev) saveMatrixCell('project', p.id, dt, next)
                              }}
                              className="w-11 text-center border border-slate-200 rounded py-0.5 tabular-nums"
                            />
                          </td>
                        )
                      })}
                      <td className="px-3 py-1 text-right font-bold text-sky-700 bg-sky-50/40 tabular-nums whitespace-nowrap">
                        {rowSum.toFixed(1)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
