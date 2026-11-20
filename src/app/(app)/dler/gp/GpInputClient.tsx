'use client'

import React, { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, Calendar, ChevronLeft, ChevronRight, Save, CheckCircle2, AlertTriangle, X, CloudCog } from 'lucide-react'
import type { DlerDepartment, DlerFactory, DlerGpEntry, DlerProject } from '@/lib/dler-math'
import { saveGpBatch } from '../actions'

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function shiftDate(dateStr: string, delta: number): string {
  const dt = new Date(`${dateStr}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export default function GpInputClient({
  month,
  selectedDate,
  factories,
  departments,
  projects,
  entries,
}: {
  month: string
  selectedDate: string
  factories: DlerFactory[]
  departments: DlerDepartment[]
  projects: DlerProject[]
  entries: DlerGpEntry[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [periodType, setPeriodType] = useState<'monthly' | 'daily'>('monthly')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const entryMap = useMemo(() => {
    const m = new Map<string, DlerGpEntry>()
    for (const e of entries) m.set(e.entry_key, e)
    return m
  }, [entries])

  const buildDrafts = React.useCallback(
    (pType: 'monthly' | 'daily', dt: string) => {
      const keyPeriod = pType === 'monthly' ? month : dt
      const fac: Record<number, string> = {}
      const dept: Record<number, string> = {}
      const proj: Record<number, string> = {}
      for (const f of factories) {
        const e = entryMap.get(`${pType}:factory:${keyPeriod}:${f.id}`)
        fac[f.id] = e ? String(e.gross_profit) : ''
      }
      for (const d of departments) {
        const e = entryMap.get(`${pType}:department:${keyPeriod}:${d.id}`)
        dept[d.id] = e ? String(e.gross_profit) : ''
      }
      for (const p of projects) {
        const e = entryMap.get(`${pType}:project:${keyPeriod}:${p.id}`)
        proj[p.id] = e ? String(e.gross_profit) : ''
      }
      return { fac, dept, proj }
    },
    [month, factories, departments, projects, entryMap]
  )

  const [drafts, setDrafts] = useState(() => buildDrafts(periodType, selectedDate))

  React.useEffect(() => {
    setDrafts(buildDrafts(periodType, selectedDate))
  }, [buildDrafts, periodType, selectedDate])

  function n(v: string | undefined) {
    if (!v) return 0
    const x = Number(v)
    return Number.isNaN(x) ? 0 : x
  }

  function deptTotal(deptId: number) {
    const kids = projects.filter(p => p.department_id === deptId)
    return n(drafts.dept[deptId]) + kids.reduce((s, p) => s + n(drafts.proj[p.id]), 0)
  }

  function facTotal(facId: number) {
    const depts = departments.filter(d => d.factory_id === facId)
    const unassigned = projects.filter(p => p.factory_id === facId && p.department_id == null)
    return (
      n(drafts.fac[facId]) +
      depts.reduce((s, d) => s + deptTotal(d.id), 0) +
      unassigned.reduce((s, p) => s + n(drafts.proj[p.id]), 0)
    )
  }

  function goPeriod(nextMonth: string, nextDate: string) {
    router.push(`/dler/gp?month=${nextMonth}&date=${nextDate}`)
  }

  function saveAll() {
    setFeedback(null)
    const batch: Parameters<typeof saveGpBatch>[3] = []
    for (const f of factories) {
      batch.push({ target_type: 'factory', target_id: f.id, gross_profit: n(drafts.fac[f.id]) })
    }
    for (const d of departments) {
      batch.push({ target_type: 'department', target_id: d.id, gross_profit: n(drafts.dept[d.id]) })
    }
    for (const p of projects) {
      batch.push({ target_type: 'project', target_id: p.id, gross_profit: n(drafts.proj[p.id]) })
    }

    startTransition(async () => {
      try {
        await saveGpBatch(periodType, month, periodType === 'daily' ? selectedDate : null, batch)
        setFeedback({
          kind: 'ok',
          text: `Saved ${periodType === 'monthly' ? `monthly GP for ${month}` : `daily GP for ${selectedDate}`}.`,
        })
        router.refresh()
      } catch (err: any) {
        setFeedback({ kind: 'err', text: err?.message ?? 'Save failed' })
      }
    })
  }

  return (
    <div className={`max-w-5xl mx-auto p-4 md:p-6 space-y-5 transition-opacity ${isPending ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-600" />
              Gross Profit Input (Khai)
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              <CloudCog className="w-3 h-3" /> Manual Input (Stage 2: ERP Sync Ready)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter GP per Factory / Department / Project. Bold Total rows update live as you type.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPeriodType('monthly')}
              className={`px-3 py-1.5 rounded-lg transition ${periodType === 'monthly' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600'}`}
            >
              Monthly GP
            </button>
            <button
              type="button"
              onClick={() => setPeriodType('daily')}
              className={`px-3 py-1.5 rounded-lg transition ${periodType === 'daily' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600'}`}
            >
              Daily GP Entry
            </button>
          </div>

          {periodType === 'monthly' ? (
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
          ) : (
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

      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-900">
            {periodType === 'monthly' ? `Monthly Gross Profit — ${month}` : `Daily Gross Profit — ${selectedDate}`}
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={saveAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> Save All GP
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                <th className="px-4 py-2.5 text-left">Factory / Department / Project</th>
                <th className="px-4 py-2.5 text-right">Gross Profit (RM)</th>
              </tr>
            </thead>
            <tbody>
              {factories.map(f => {
                const depts = departments.filter(d => d.factory_id === f.id)
                const unassigned = projects.filter(p => p.factory_id === f.id && p.department_id == null)
                const ft = facTotal(f.id)
                return (
                  <Fragment key={f.id}>
                    <tr className="bg-slate-900 text-white font-bold">
                      <td className="px-4 py-2.5">{f.name} — Total</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">RM {fmt(ft)}</td>
                    </tr>
                    <tr className="border-b border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-1.5 pl-6 text-slate-700">{f.name} (own)</td>
                      <td className="px-4 py-1.5 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={drafts.fac[f.id] ?? ''}
                          placeholder="0"
                          onChange={e => {
                            const v = e.target.value
                            if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) {
                              setDrafts(s => ({ ...s, fac: { ...s.fac, [f.id]: v } }))
                            }
                          }}
                          className="w-36 text-right border border-slate-300 rounded-lg px-2.5 py-1.5 tabular-nums font-semibold"
                        />
                      </td>
                    </tr>

                    {depts.map(d => {
                      const kids = projects.filter(p => p.department_id === d.id)
                      const dt = deptTotal(d.id)
                      return (
                        <Fragment key={d.id}>
                          <tr className="border-t border-slate-200 bg-slate-50 font-bold text-slate-800">
                            <td className="px-4 py-2 pl-8">
                              {d.name} — Total{' '}
                              <span className="ml-1 text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                {d.kind}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">RM {fmt(dt)}</td>
                          </tr>
                          <tr className="border-b border-slate-100 hover:bg-slate-50/70">
                            <td className="px-4 py-1.5 pl-12 text-slate-600">{d.name} (own)</td>
                            <td className="px-4 py-1.5 text-right">
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={drafts.dept[d.id] ?? ''}
                                placeholder="0"
                                onChange={e => {
                                  const v = e.target.value
                                  if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) {
                                    setDrafts(s => ({ ...s, dept: { ...s.dept, [d.id]: v } }))
                                  }
                                }}
                                className="w-36 text-right border border-slate-300 rounded-lg px-2.5 py-1.5 tabular-nums"
                              />
                            </td>
                          </tr>
                          {kids.map(p => (
                            <tr key={p.id} className="border-b border-slate-100 hover:bg-emerald-50/30">
                              <td className="px-4 py-1.5 pl-16 font-medium text-slate-900">
                                {p.name}
                                {p.status === 'Inactive' && <span className="ml-2 text-[10px] text-slate-400">(Inactive)</span>}
                              </td>
                              <td className="px-4 py-1.5 text-right">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  value={drafts.proj[p.id] ?? ''}
                                  placeholder="0"
                                  onChange={e => {
                                    const v = e.target.value
                                    if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) {
                                      setDrafts(s => ({ ...s, proj: { ...s.proj, [p.id]: v } }))
                                    }
                                  }}
                                  className="w-36 text-right border border-slate-300 rounded-lg px-2.5 py-1.5 tabular-nums"
                                />
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}

                    {unassigned.map(p => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-emerald-50/30">
                        <td className="px-4 py-1.5 pl-10 font-medium text-slate-900">{p.name} (No Dept)</td>
                        <td className="px-4 py-1.5 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={drafts.proj[p.id] ?? ''}
                            placeholder="0"
                            onChange={e => {
                              const v = e.target.value
                              if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) {
                                setDrafts(s => ({ ...s, proj: { ...s.proj, [p.id]: v } }))
                              }
                            }}
                            className="w-36 text-right border border-slate-300 rounded-lg px-2.5 py-1.5 tabular-nums"
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
