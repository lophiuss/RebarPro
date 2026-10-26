'use client'

import React, { useState, useMemo } from 'react'
import {
  LayoutDashboard, Calendar, TrendingUp, DollarSign, Beaker, CheckCircle2,
  Clock, AlertCircle, Building2, ChevronLeft, ChevronRight, BarChart3, Target
} from 'lucide-react'

export type QaqcTestRecord = {
  id: number
  running_no: string
  project: string
  supplier: string
  marking: string | null
  test_type: string
  date_cast: string | null
  date_test: string
  report_no: string | null
  email_date: string | null
  po_no: string | null
  po_amount: number | null
  invoice_no: string | null
  invoice_amount: number | null
  payment_status: 'Pending' | 'Paid' | 'Partially Paid' | 'Void'
}

export type QaqcTargetRecord = {
  id: number
  project: string
  month: string
  test_count_target: number
  spend_target: number
}

interface Props {
  tests: QaqcTestRecord[]
  targets: QaqcTargetRecord[]
  projects: string[]
}

function fmtRm(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return 'RM 0.00'
  return `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtShortRm(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `RM ${(n / 1_000).toFixed(1)}k`
  return `RM ${Math.round(n).toLocaleString()}`
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function DashboardClient({ tests, targets, projects }: Props) {
  const currentMonthDefault = new Date().toISOString().slice(0, 7)
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month')
  const [selectedMonth, setSelectedMonth] = useState(currentMonthDefault)
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [selectedProject, setSelectedProject] = useState('')

  // Filter records based on time & project
  const periodTests = useMemo(() => {
    return tests.filter(t => {
      if (selectedProject && t.project !== selectedProject) return false
      if (viewMode === 'month') {
        return t.date_test.startsWith(selectedMonth)
      } else {
        return t.date_test.startsWith(selectedYear)
      }
    })
  }, [tests, viewMode, selectedMonth, selectedYear, selectedProject])

  // Key KPI calculations
  const kpis = useMemo(() => {
    const totalTests = periodTests.length
    const totalPo = periodTests.reduce((s, t) => s + (Number(t.po_amount) || 0), 0)
    const totalInvoiced = periodTests.reduce((s, t) => s + (Number(t.invoice_amount) || 0), 0)
    const totalPaid = periodTests
      .filter(t => t.payment_status === 'Paid')
      .reduce((s, t) => s + (Number(t.invoice_amount) || 0), 0)
    const pendingPoCount = periodTests.filter(t => !t.po_no).length
    const pendingInvoiceCount = periodTests.filter(t => t.po_no && !t.invoice_no).length
    const unpaidAmount = totalInvoiced - totalPaid

    return { totalTests, totalPo, totalInvoiced, totalPaid, pendingPoCount, pendingInvoiceCount, unpaidAmount }
  }, [periodTests])

  // Project Breakdown
  const projectStats = useMemo(() => {
    const map = new Map<string, { tests: number; poSpend: number; invSpend: number }>()
    for (const t of periodTests) {
      const p = t.project || 'Unassigned'
      const cur = map.get(p) || { tests: 0, poSpend: 0, invSpend: 0 }
      cur.tests += 1
      cur.poSpend += Number(t.po_amount) || 0
      cur.invSpend += Number(t.invoice_amount) || 0
      map.set(p, cur)
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.tests - a.tests)
  }, [periodTests])

  // Test Type Breakdown
  const testTypeStats = useMemo(() => {
    const map = new Map<string, { count: number; spend: number }>()
    for (const t of periodTests) {
      const type = t.test_type || 'Other'
      const cur = map.get(type) || { count: 0, spend: 0 }
      cur.count += 1
      cur.spend += Number(t.invoice_amount || t.po_amount) || 0
      map.set(type, cur)
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
  }, [periodTests])

  // Project Spend vs Target
  const targetComparison = useMemo(() => {
    const relevantTargets = targets.filter(t => {
      if (viewMode === 'month') return t.month === selectedMonth
      return t.month.startsWith(selectedYear)
    })

    // Group targets by project
    const targetMap = new Map<string, { countTarget: number; spendTarget: number }>()
    for (const tg of relevantTargets) {
      if (selectedProject && tg.project !== selectedProject) continue
      const cur = targetMap.get(tg.project) || { countTarget: 0, spendTarget: 0 }
      cur.countTarget += tg.test_count_target || 0
      cur.spendTarget += Number(tg.spend_target) || 0
      targetMap.set(tg.project, cur)
    }

    const allProjectNames = Array.from(new Set([...projectStats.map(p => p.name), ...Array.from(targetMap.keys())]))

    return allProjectNames.map(pName => {
      const actual = projectStats.find(p => p.name === pName) || { tests: 0, poSpend: 0, invSpend: 0 }
      const tgt = targetMap.get(pName) || { countTarget: 0, spendTarget: 0 }
      const actualSpend = actual.invSpend || actual.poSpend
      const spendVariance = tgt.spendTarget > 0 ? actualSpend - tgt.spendTarget : 0
      const spendPct = tgt.spendTarget > 0 ? Math.round((actualSpend / tgt.spendTarget) * 100) : null
      return {
        project: pName,
        actualTests: actual.tests,
        targetTests: tgt.countTarget,
        actualSpend,
        targetSpend: tgt.spendTarget,
        spendVariance,
        spendPct,
      }
    }).sort((a, b) => b.actualSpend - a.actualSpend)
  }, [targets, projectStats, viewMode, selectedMonth, selectedYear, selectedProject])

  // Last 6 months trend
  const monthTrend = useMemo(() => {
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      months.push(shiftMonth(selectedMonth, -i))
    }

    const maxSpend = Math.max(
      ...months.map(m => {
        return tests
          .filter(t => t.date_test.startsWith(m) && (!selectedProject || t.project === selectedProject))
          .reduce((sum, t) => sum + (Number(t.invoice_amount || t.po_amount) || 0), 0)
      }),
      100
    )

    return months.map(m => {
      const mTests = tests.filter(t => t.date_test.startsWith(m) && (!selectedProject || t.project === selectedProject))
      const count = mTests.length
      const spend = mTests.reduce((sum, t) => sum + (Number(t.invoice_amount || t.po_amount) || 0), 0)
      return {
        month: m,
        label: new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, { month: 'short' }),
        count,
        spend,
        pct: Math.min(100, (spend / maxSpend) * 100),
      }
    })
  }, [tests, selectedMonth, selectedProject])

  return (
    <div className="space-y-6">
      {/* Control Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-md transition ${viewMode === 'month' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600'}`}
            >
              Monthly View
            </button>
            <button
              onClick={() => setViewMode('year')}
              className={`px-3 py-1.5 rounded-md transition ${viewMode === 'year' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600'}`}
            >
              Yearly View
            </button>
          </div>

          {viewMode === 'month' ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedMonth(m => shiftMonth(m, -1))}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={e => e.target.value && setSelectedMonth(e.target.value)}
                className="border rounded-lg px-2.5 py-1 text-xs font-bold bg-white text-slate-800"
              />
              <button
                onClick={() => setSelectedMonth(m => shiftMonth(m, 1))}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="border rounded-lg px-3 py-1 text-xs font-bold bg-white text-slate-800"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium">Filter Project:</label>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-xs bg-white text-slate-800 font-medium min-w-[160px]"
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
            <span>Tests Performed</span>
            <Beaker className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2">{kpis.totalTests}</div>
          <p className="text-xs text-slate-400 mt-1">in {viewMode === 'month' ? monthLabel(selectedMonth) : selectedYear}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-700">
            <span>PO Committed</span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-extrabold text-amber-900 mt-2">{fmtRm(kpis.totalPo)}</div>
          <p className="text-xs text-amber-600 font-medium mt-1">
            {kpis.pendingPoCount > 0 ? `⚠️ ${kpis.pendingPoCount} tests awaiting PO` : 'All tests covered by PO'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-700">
            <span>Invoiced Amount</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-900 mt-2">{fmtRm(kpis.totalInvoiced)}</div>
          <p className="text-xs text-slate-500 mt-1">
            {kpis.pendingInvoiceCount > 0 ? `🟣 ${kpis.pendingInvoiceCount} POs awaiting billing` : 'Up-to-date with invoices'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
            <span>Payment Breakdown</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2">{fmtRm(kpis.totalPaid)}</div>
          <p className="text-xs text-slate-500 mt-1">
            Unpaid balance: <strong className={kpis.unpaidAmount > 0 ? 'text-red-600' : 'text-slate-600'}>{fmtRm(kpis.unpaidAmount)}</strong>
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            Testing Volume & Spend by Project
          </h3>
          {projectStats.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No tests recorded for this period.</p>
          ) : (
            <div className="space-y-3">
              {projectStats.map(p => {
                const maxTests = Math.max(...projectStats.map(x => x.tests), 1)
                const pct = (p.tests / maxTests) * 100
                return (
                  <div key={p.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-800 font-semibold">{p.name}</span>
                      <span className="text-slate-500">
                        <strong>{p.tests} tests</strong> · {fmtRm(p.invSpend || p.poSpend)}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Test Type Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Beaker className="w-4 h-4 text-emerald-600" />
            Breakdown by Type of Test
          </h3>
          {testTypeStats.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No tests recorded for this period.</p>
          ) : (
            <div className="space-y-3">
              {testTypeStats.map(t => {
                const totalTestsInView = periodTests.length || 1
                const pct = Math.round((t.count / totalTestsInView) * 100)
                return (
                  <div key={t.name} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 text-xs">
                    <div className="min-w-0 pr-3">
                      <div className="font-semibold text-slate-800 truncate">{t.name}</div>
                      <div className="text-[11px] text-slate-500">{t.count} tests ({pct}%)</div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="font-bold text-slate-900">{fmtRm(t.spend)}</div>
                      <div className="text-[10px] text-slate-400">spend</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Project Testing Spend vs Target Budget */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Target className="w-4 h-4 text-rose-600" />
              Project Spend vs. Testing Target Budget ({viewMode === 'month' ? monthLabel(selectedMonth) : selectedYear})
            </h3>
          </div>

          {targetComparison.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No projects or targets configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b text-slate-400 uppercase text-[10px] pb-2">
                    <th className="pb-2">Project</th>
                    <th className="pb-2 text-center">Actual Tests</th>
                    <th className="pb-2 text-center">Target Tests</th>
                    <th className="pb-2 text-right">Actual Spend</th>
                    <th className="pb-2 text-right">Target Budget</th>
                    <th className="pb-2 text-right">Variance</th>
                    <th className="pb-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {targetComparison.map(row => {
                    const isOver = row.targetSpend > 0 && row.actualSpend > row.targetSpend
                    const hasBudget = row.targetSpend > 0

                    return (
                      <tr key={row.project} className="hover:bg-slate-50">
                        <td className="py-2.5 font-bold text-slate-800">{row.project}</td>
                        <td className="py-2.5 text-center font-semibold text-slate-700">{row.actualTests}</td>
                        <td className="py-2.5 text-center text-slate-500">{row.targetTests || '-'}</td>
                        <td className="py-2.5 text-right font-bold text-slate-900">{fmtRm(row.actualSpend)}</td>
                        <td className="py-2.5 text-right text-slate-600">{hasBudget ? fmtRm(row.targetSpend) : '-'}</td>
                        <td className={`py-2.5 text-right font-bold ${isOver ? 'text-red-600' : 'text-emerald-700'}`}>
                          {hasBudget ? `${isOver ? '+' : ''}${fmtRm(row.spendVariance)}` : '-'}
                        </td>
                        <td className="py-2.5 text-center">
                          {!hasBudget ? (
                            <span className="text-slate-400 text-[10px]">No target</span>
                          ) : isOver ? (
                            <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                              Over budget ({row.spendPct}%)
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                              Within budget ({row.spendPct}%)
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 6-Month Trajectory Bar Trend */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            Testing Spend Trend (Last 6 Months)
          </h3>
          <div className="h-44 flex items-end gap-3 sm:gap-6 pt-4 border-b pb-2">
            {monthTrend.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center h-full justify-end group">
                <span className="text-[10px] font-bold text-slate-700 mb-1 group-hover:text-indigo-600 transition">
                  {fmtShortRm(m.spend)}
                </span>
                <div className="w-full max-w-[48px] bg-indigo-100 rounded-t-lg group-hover:bg-indigo-200 transition overflow-hidden h-full flex flex-col justify-end">
                  <div
                    className="w-full bg-indigo-600 rounded-t-lg transition-all"
                    style={{ height: `${Math.max(4, m.pct)}%` }}
                    title={`${m.label}: ${fmtRm(m.spend)} (${m.count} tests)`}
                  />
                </div>
                <span className="text-[11px] font-semibold text-slate-500 mt-2">{m.label}</span>
                <span className="text-[9px] text-slate-400">{m.count} tests</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
