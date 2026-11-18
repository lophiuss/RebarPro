'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Boxes, Calendar, ChevronLeft, ChevronRight, Users,
  DollarSign, Layers, Building2, FolderKanban, GitFork, Loader2, Info
} from 'lucide-react'
import { getDlerDashboardData } from '../actions'
import type {
  AggregatedMetricRow,
  DlerDashboardResult,
} from '@/lib/dler-math'

type MetricMode = 'gp' | 'm3'
type PeriodMode = 'daily' | 'monthly'
type BreakdownTab = 'departments' | 'projects' | 'tree'

function fmtRm(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `RM ${Math.round(n).toLocaleString()}`
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`
  if (Math.abs(n) >= 1_000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

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

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function DlerBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-400">—</span>
  }
  const cls =
    value >= 3
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : value >= 1.5
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : 'bg-rose-100 text-rose-800 border-rose-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums border ${cls}`}>
      {value.toFixed(2)}
    </span>
  )
}

function CostPerM3Badge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-400">—</span>
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums bg-sky-50 text-sky-800 border border-sky-200">
      RM {value.toFixed(2)}/m³
    </span>
  )
}

export default function DashboardClient({ initialData }: { initialData: DlerDashboardResult }) {
  const router = useRouter()
  const [data, setData] = useState<DlerDashboardResult>(initialData)
  const [metric, setMetric] = useState<MetricMode>('gp')
  const [period, setPeriod] = useState<PeriodMode>('daily')
  const [tab, setTab] = useState<BreakdownTab>('departments')
  const [isPending, startTransition] = useTransition()

  function loadPeriod(nextMonth: string, nextDate: string) {
    startTransition(async () => {
      const next = await getDlerDashboardData(nextMonth, nextDate)
      setData(next)
      router.replace(`/dler/dashboard?month=${next.month}&date=${next.selectedDate}`, { scroll: false })
    })
  }

  const activeRowsDept =
    period === 'daily' ? data.daily.byDepartment : data.monthly.byDepartment[data.month] ?? []
  const activeRowsProj =
    period === 'daily' ? data.daily.byProject : data.monthly.byProject[data.month] ?? []
  const activeRowsFac =
    period === 'daily' ? data.daily.byFactory : data.monthly.byFactory[data.month] ?? []

  const summary = period === 'daily' ? data.daily.summary : data.monthly.summary
  const periodLabel = period === 'daily' ? data.selectedDate : monthLabel(data.month)

  // Daily / Monthly chart bars
  const dailyMax = Math.max(
    ...data.daily.series.map(d => Math.max(d.totalCost, metric === 'gp' ? Math.max(0, d.grossProfit) : d.m3Volume)),
    1
  )
  const monthlyMax = Math.max(
    ...data.monthly.trend.map(m => Math.max(m.totalCost, metric === 'gp' ? Math.max(0, m.grossProfit) : m.m3Volume)),
    1
  )

  const totalCostSafe = Math.max(summary.totalCost, 1)
  const staffPct = (summary.staffCost / totalCostSafe) * 100
  const workerBasePct = (summary.workerBaseCost / totalCostSafe) * 100
  const workerOtPct = (summary.workerOtCost / totalCostSafe) * 100

  return (
    <div className={`max-w-7xl mx-auto p-4 md:p-6 space-y-6 transition-opacity ${isPending ? 'opacity-65' : ''}`}>
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-teal-600" />
              DLER &amp; Productivity Dashboard
            </h1>
            {isPending && <Loader2 className="w-4 h-4 animate-spin text-teal-600" />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Direct Labour Efficiency Ratio · Viewing{' '}
            <span className="font-semibold text-slate-700">{period === 'daily' ? `Daily (${data.selectedDate})` : `Monthly (${monthLabel(data.month)})`}</span>
            {' · '}Working days divisor: <span className="font-semibold">{data.workingDaysInMonth}d</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Metric Switcher: GP vs m3 */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setMetric('gp')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                metric === 'gp' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" /> See by GP (DLER)
            </button>
            <button
              type="button"
              onClick={() => setMetric('m3')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                metric === 'm3' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" /> See by m³
            </button>
          </div>

          {/* Period Switcher: Daily vs Monthly */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setPeriod('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === 'daily' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily View
            </button>
            <button
              type="button"
              onClick={() => setPeriod('monthly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === 'monthly' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly View
            </button>
          </div>

          {/* Date or Month Picker */}
          {period === 'daily' ? (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2 py-1">
              <button
                type="button"
                onClick={() => {
                  const next = shiftDate(data.selectedDate, -1)
                  loadPeriod(next.slice(0, 7), next)
                }}
                className="p-1 rounded hover:bg-slate-100 text-slate-600"
                title="Previous day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={data.selectedDate}
                onChange={e => e.target.value && loadPeriod(e.target.value.slice(0, 7), e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const next = shiftDate(data.selectedDate, 1)
                  loadPeriod(next.slice(0, 7), next)
                }}
                className="p-1 rounded hover:bg-slate-100 text-slate-600"
                title="Next day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2 py-1">
              <button
                type="button"
                onClick={() => {
                  const nextM = shiftMonth(data.month, -1)
                  loadPeriod(nextM, `${nextM}-01`)
                }}
                className="p-1 rounded hover:bg-slate-100 text-slate-600"
                title="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="month"
                value={data.month}
                onChange={e => e.target.value && loadPeriod(e.target.value, `${e.target.value}-01`)}
                className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const nextM = shiftMonth(data.month, 1)
                  loadPeriod(nextM, `${nextM}-01`)
                }}
                className="p-1 rounded hover:bg-slate-100 text-slate-600"
                title="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metric === 'gp' ? (
          <>
            <KpiCard
              title={`Gross Profit · ${periodLabel}`}
              value={fmtRm(summary.grossProfit)}
              sub={period === 'daily' ? `MTD: ${fmtRm(data.mtd.grossProfit)}` : 'Factory & project GP total'}
              accent="text-emerald-700"
            />
            <KpiCard
              title={`Total Labour Cost · ${periodLabel}`}
              value={fmtRm(summary.totalCost)}
              sub={period === 'daily' ? `MTD: ${fmtRm(data.mtd.totalCost)}` : `Staff ${fmtRm(summary.staffCost)} · Workers ${fmtRm(summary.workerBaseCost + summary.workerOtCost)}`}
              accent="text-slate-900"
            />
            <KpiCard
              title={`DLER (GP ÷ Cost) · ${periodLabel}`}
              value={summary.dler != null ? summary.dler.toFixed(2) : '—'}
              sub={period === 'daily' ? `MTD DLER: ${data.mtd.dler != null ? data.mtd.dler.toFixed(2) : '—'}` : 'Higher ratio = stronger labour efficiency'}
              accent={summary.dler != null && summary.dler >= 3 ? 'text-emerald-600' : summary.dler != null && summary.dler >= 1.5 ? 'text-amber-600' : 'text-rose-600'}
            />
            <KpiCard
              title="Output m³ & Active Crew"
              value={`${fmtNum(summary.m3Volume, 1)} m³`}
              sub={
                period === 'daily'
                  ? `Active: ${data.daily.summary.activeStaff} staff · ${data.daily.summary.activeWorkers} workers`
                  : `Cost/m³: ${summary.costPerM3 != null ? `RM ${summary.costPerM3.toFixed(2)}` : '—'}`
              }
              accent="text-sky-700"
            />
          </>
        ) : (
          <>
            <KpiCard
              title={`Concrete Output (m³) · ${periodLabel}`}
              value={`${fmtNum(summary.m3Volume, 1)} m³`}
              sub={period === 'daily' ? `MTD: ${fmtNum(data.mtd.m3Volume, 1)} m³` : 'Total volume across projects & depts'}
              accent="text-sky-700"
            />
            <KpiCard
              title={`Total Labour Cost · ${periodLabel}`}
              value={fmtRm(summary.totalCost)}
              sub={period === 'daily' ? `MTD: ${fmtRm(data.mtd.totalCost)}` : 'Staff + Worker Base + Worker OT'}
              accent="text-slate-900"
            />
            <KpiCard
              title={`Labour Cost / m³ · ${periodLabel}`}
              value={summary.costPerM3 != null ? `RM ${summary.costPerM3.toFixed(2)}` : '—'}
              sub={period === 'daily' ? `MTD: ${data.mtd.costPerM3 != null ? `RM ${data.mtd.costPerM3.toFixed(2)}/m³` : '—'}` : 'Lower RM/m³ = higher efficiency'}
              accent="text-indigo-700"
            />
            <KpiCard
              title="m³ per RM 1,000 Labour"
              value={summary.m3Per1kCost != null ? `${summary.m3Per1kCost.toFixed(2)} m³` : '—'}
              sub={`GP DLER: ${summary.dler != null ? summary.dler.toFixed(2) : '—'}`}
              accent="text-teal-700"
            />
          </>
        )}
      </div>

      {/* Labour Cost Composition Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-teal-600" />
            Labour Cost Composition ({periodLabel})
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600" />
              Staff (Base + OT): <b>{fmtRm(summary.staffCost)}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-teal-500" />
              Worker Base: <b>{fmtRm(summary.workerBaseCost)}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
              Worker OT: <b>{fmtRm(summary.workerOtCost)}</b>
            </span>
          </div>
        </div>
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
          {summary.totalCost > 0 ? (
            <>
              <div className="bg-indigo-600 h-full transition-all" style={{ width: `${staffPct}%` }} title={`Staff: ${staffPct.toFixed(1)}%`} />
              <div className="bg-teal-500 h-full transition-all" style={{ width: `${workerBasePct}%` }} title={`Worker Base: ${workerBasePct.toFixed(1)}%`} />
              <div className="bg-amber-500 h-full transition-all" style={{ width: `${workerOtPct}%` }} title={`Worker OT: ${workerOtPct.toFixed(1)}%`} />
            </>
          ) : null}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {period === 'daily' ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Daily {metric === 'gp' ? 'Gross Profit vs Labour Cost' : 'm³ Volume & Labour Cost'} — {monthLabel(data.month)}
                </h2>
                <p className="text-xs text-slate-400">Click any day bar to inspect that date&apos;s breakdown below</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                {metric === 'gp' ? (
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Daily GP</span>
                ) : (
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-sky-500" /> Daily m³</span>
                )}
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-slate-700" /> Labour Cost</span>
              </div>
            </div>

            {metric === 'm3' ? (
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[680px] flex items-end gap-1.5 h-52 pt-6 border-b border-slate-200">
                  {data.daily.series.map(pt => {
                    const isSel = pt.date === data.selectedDate
                    const maxM3 = Math.max(...data.daily.series.map(x => x.m3Volume), 1)
                    const maxCost = Math.max(...data.daily.series.map(x => x.totalCost), 1)
                    const m3H = (pt.m3Volume / maxM3) * 100
                    const costH = (pt.totalCost / maxCost) * 100
                    return (
                      <button
                        key={pt.date}
                        type="button"
                        onClick={() => loadPeriod(data.month, pt.date)}
                        title={`${pt.date} (${pt.dayType})\nm³: ${pt.m3Volume.toFixed(1)}\nLabour: ${fmtRm(pt.totalCost)}\nRM/m³: ${pt.costPerM3 != null ? pt.costPerM3.toFixed(2) : '—'}`}
                        className={`flex-1 h-full flex flex-col justify-end items-center rounded-t px-0.5 transition ${
                          isSel ? 'bg-sky-50 ring-1 ring-sky-400' : pt.dayType !== 'normal' ? 'bg-amber-50/50 hover:bg-slate-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-full flex items-end justify-center gap-0.5 h-[82%]">
                          <div className="w-1/2 bg-sky-500 rounded-t-xs" style={{ height: `${pt.m3Volume > 0 ? Math.max(m3H, 4) : 0}%` }} />
                          <div className="w-1/2 bg-slate-700 rounded-t-xs" style={{ height: `${pt.totalCost > 0 ? Math.max(costH, 4) : 0}%` }} />
                        </div>
                        <span className={`text-[10px] mt-1 ${isSel ? 'font-bold text-sky-700' : pt.dayType !== 'normal' ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>
                          {pt.day}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[680px] flex items-end gap-1.5 h-52 pt-6 border-b border-slate-200">
                  {data.daily.series.map(pt => {
                    const isSel = pt.date === data.selectedDate
                    const gpH = (Math.max(0, pt.grossProfit) / dailyMax) * 100
                    const costH = (pt.totalCost / dailyMax) * 100
                    return (
                      <button
                        key={pt.date}
                        type="button"
                        onClick={() => loadPeriod(data.month, pt.date)}
                        title={`${pt.date} (${pt.dayType})\nGP: ${fmtRm(pt.grossProfit)}\nLabour: ${fmtRm(pt.totalCost)}\nDLER: ${pt.dler != null ? pt.dler.toFixed(2) : '—'}`}
                        className={`flex-1 h-full flex flex-col justify-end items-center rounded-t px-0.5 transition ${
                          isSel ? 'bg-teal-50 ring-1 ring-teal-400' : pt.dayType !== 'normal' ? 'bg-amber-50/50 hover:bg-slate-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-full flex items-end justify-center gap-0.5 h-[82%]">
                          <div className="w-1/2 bg-emerald-500 rounded-t-xs" style={{ height: `${pt.grossProfit > 0 ? Math.max(gpH, 3) : 0}%` }} />
                          <div className="w-1/2 bg-slate-700 rounded-t-xs" style={{ height: `${pt.totalCost > 0 ? Math.max(costH, 3) : 0}%` }} />
                        </div>
                        <span className={`text-[10px] mt-1 ${isSel ? 'font-bold text-teal-700' : pt.dayType !== 'normal' ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>
                          {pt.day}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 mb-1">6-Month Trend ({metric === 'gp' ? 'GP vs Labour Cost' : 'm³ Volume & Labour Cost'})</h2>
              <p className="text-xs text-slate-400 mb-4">Click a month to drill into it</p>
              <div className="flex items-end gap-3 h-52 pt-6 border-b border-slate-200">
                {data.monthly.trend.map(pt => {
                  const isSel = pt.month === data.month
                  const valPrimary = metric === 'gp' ? Math.max(0, pt.grossProfit) : pt.m3Volume
                  const pH = metric === 'gp'
                    ? (valPrimary / monthlyMax) * 100
                    : (valPrimary / Math.max(...data.monthly.trend.map(x => x.m3Volume), 1)) * 100
                  const cH = metric === 'gp'
                    ? (pt.totalCost / monthlyMax) * 100
                    : (pt.totalCost / Math.max(...data.monthly.trend.map(x => x.totalCost), 1)) * 100
                  return (
                    <button
                      key={pt.month}
                      type="button"
                      onClick={() => loadPeriod(pt.month, `${pt.month}-01`)}
                      className={`flex-1 h-full flex flex-col justify-end items-center rounded-t px-1 transition ${isSel ? 'bg-teal-50/70 ring-1 ring-teal-300' : 'hover:bg-slate-50'}`}
                    >
                      <div className="text-[10px] font-bold text-slate-700 mb-1">
                        {metric === 'gp' ? (pt.dler != null ? pt.dler.toFixed(2) : '—') : `${fmtShort(pt.m3Volume)}m³`}
                      </div>
                      <div className="w-full flex items-end justify-center gap-1 h-[76%] px-2">
                        <div className={`w-1/2 rounded-t ${metric === 'gp' ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ height: `${valPrimary > 0 ? Math.max(pH, 4) : 0}%` }} />
                        <div className="w-1/2 bg-slate-700 rounded-t" style={{ height: `${pt.totalCost > 0 ? Math.max(cH, 4) : 0}%` }} />
                      </div>
                      <span className={`text-[11px] mt-1.5 ${isSel ? 'font-bold text-teal-700' : 'text-slate-500'}`}>{pt.month}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 mb-1">Top Departments — {monthLabel(data.month)}</h2>
              <p className="text-xs text-slate-400 mb-4">{metric === 'gp' ? 'Gross Profit vs Labour Cost' : 'm³ Produced vs Labour Cost'}</p>
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {[...activeRowsDept]
                  .sort((a, b) => b.totalCost - a.totalCost)
                  .slice(0, 8)
                  .map(d => {
                    const maxC = Math.max(...activeRowsDept.map(x => x.totalCost), 1)
                    return (
                      <div key={d.id} className="text-xs">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-semibold text-slate-800">{d.name}</span>
                          <span className="text-slate-600 tabular-nums">
                            {fmtRm(d.totalCost)} ·{' '}
                            {metric === 'gp' ? <DlerBadge value={d.dler} /> : <CostPerM3Badge value={d.costPerM3} />}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(d.totalCost / maxC) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Breakdown Section */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {period === 'daily' ? `Daily Breakdown — ${data.selectedDate}` : `Monthly Breakdown — ${monthLabel(data.month)}`}
            </h2>
            <p className="text-xs text-slate-500">
              {tab === 'departments'
                ? 'Department labour cost = 100% of staff & workers in that home department. Support depts also show benchmark vs Factory Total.'
                : tab === 'projects'
                ? 'Project labour cost = sum of each staff & worker cost × their assigned Project %.'
                : 'Factory → Department → Project rollup tree.'}
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-slate-200/70 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab('departments')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${tab === 'departments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Building2 className="w-3.5 h-3.5" /> By Department ({activeRowsDept.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('projects')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${tab === 'projects' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <FolderKanban className="w-3.5 h-3.5" /> By Project ({activeRowsProj.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('tree')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${tab === 'tree' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <GitFork className="w-3.5 h-3.5" /> Tree View
            </button>
          </div>
        </div>

        <div className="p-4">
          {tab === 'departments' && (
            <BreakdownTable rows={activeRowsDept} metric={metric} showKind showBenchmark />
          )}
          {tab === 'projects' && (
            <BreakdownTable rows={activeRowsProj} metric={metric} showFte />
          )}
          {tab === 'tree' && (
            <TreeHierarchy
              data={data}
              facRows={activeRowsFac}
              deptRows={activeRowsDept}
              projRows={activeRowsProj}
              metric={metric}
            />
          )}

          {period === 'daily' && metric === 'gp' && (
            <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                Where GP is entered monthly by Khai without a daily override, Daily GP is automatically prorated by that day&apos;s m³ share (when m³ is recorded) or evenly across the month&apos;s {data.workingDaysInMonth} working days.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, sub, accent }: { title: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      <div className={`text-2xl font-extrabold mt-1 tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

function BreakdownTable({
  rows,
  metric,
  showKind,
  showBenchmark,
  showFte,
}: {
  rows: AggregatedMetricRow[]
  metric: MetricMode
  showKind?: boolean
  showBenchmark?: boolean
  showFte?: boolean
}) {
  if (rows.length === 0) {
    return <p className="text-center text-sm text-slate-400 py-8">No records configured yet.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
            <th className="px-3 py-2.5 text-left">Name</th>
            <th className="px-3 py-2.5 text-right">{showFte ? 'FTE' : 'Staff / Worker'}</th>
            <th className="px-3 py-2.5 text-right">Staff Cost</th>
            <th className="px-3 py-2.5 text-right">Worker Base</th>
            <th className="px-3 py-2.5 text-right">Worker OT</th>
            <th className="px-3 py-2.5 text-right">Total Labour</th>
            {metric === 'gp' ? (
              <>
                <th className="px-3 py-2.5 text-right">Gross Profit</th>
                <th className="px-3 py-2.5 text-right">DLER</th>
                {showBenchmark && <th className="px-3 py-2.5 text-right">vs Factory</th>}
              </>
            ) : (
              <>
                <th className="px-3 py-2.5 text-right">Output (m³)</th>
                <th className="px-3 py-2.5 text-right">Cost / m³</th>
                <th className="px-3 py-2.5 text-right">m³ / RM 1k</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-sky-50/40 transition-colors">
              <td className="px-3 py-2.5 font-semibold text-slate-900">
                <div className="flex items-center gap-2">
                  <span>{r.name}</span>
                  {showKind && r.kind && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${r.kind === 'production' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>
                      {r.kind}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                {showFte ? (r.fteAllocated ?? 0).toFixed(2) : `${r.headcountStaff} / ${r.headcountWorker}`}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmtRm(r.staffCost)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmtRm(r.workerBaseCost)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">{fmtRm(r.workerOtCost)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-900">{fmtRm(r.totalCost)}</td>
              {metric === 'gp' ? (
                <>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{fmtRm(r.grossProfit)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <DlerBadge value={r.dler} />
                  </td>
                  {showBenchmark && (
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      {r.kind === 'support' && r.grossProfit === 0 && r.benchmarkFactoryDler != null ? (
                        <span title="Factory Total GP ÷ Support Dept Cost">{r.benchmarkFactoryDler.toFixed(1)}× Fac</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                </>
              ) : (
                <>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-sky-700">{fmtNum(r.m3Volume, 1)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <CostPerM3Badge value={r.costPerM3} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {r.m3Per1kCost != null ? r.m3Per1kCost.toFixed(2) : '—'}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TreeHierarchy({
  data,
  facRows,
  deptRows,
  projRows,
  metric,
}: {
  data: DlerDashboardResult
  facRows: AggregatedMetricRow[]
  deptRows: AggregatedMetricRow[]
  projRows: AggregatedMetricRow[]
  metric: MetricMode
}) {
  const facMap = new Map(facRows.map(r => [r.id, r]))
  const deptMap = new Map(deptRows.map(r => [r.id, r]))
  const projMap = new Map(projRows.map(r => [r.id, r]))

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-200">
      {data.factories.map(f => {
        const fRow = facMap.get(f.id)
        const depts = data.departments.filter(d => d.factory_id === f.id)
        return (
          <details key={f.id} open className="group">
            <summary className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white cursor-pointer list-none">
              <div className="font-bold text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-400" />
                <span>{f.name} — Total</span>
              </div>
              {fRow && <TreeStats row={fRow} metric={metric} dark />}
            </summary>
            <div className="divide-y divide-slate-100 bg-white">
              {depts.map(d => {
                const dRow = deptMap.get(d.id)
                const kids = data.projects.filter(p => p.department_id === d.id)
                return (
                  <details key={d.id} open={kids.length > 0}>
                    <summary className="flex items-center justify-between pl-8 pr-4 py-2.5 bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer list-none">
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                        <span>{d.name}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase">{d.kind}</span>
                      </div>
                      {dRow && <TreeStats row={dRow} metric={metric} />}
                    </summary>
                    {kids.length > 0 && (
                      <div className="divide-y divide-slate-100">
                        {kids.map(p => {
                          const pRow = projMap.get(p.id)
                          return (
                            <div key={p.id} className="flex items-center justify-between pl-14 pr-4 py-2 text-xs hover:bg-sky-50/40">
                              <span className="font-medium text-slate-700">{p.name}</span>
                              {pRow && <TreeStats row={pRow} metric={metric} />}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </details>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}

function TreeStats({ row, metric, dark }: { row: AggregatedMetricRow; metric: MetricMode; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-4 text-xs tabular-nums ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
      {metric === 'gp' ? (
        <>
          <span>GP {fmtRm(row.grossProfit)}</span>
          <span>Labour {fmtRm(row.totalCost)}</span>
          <DlerBadge value={row.dler} />
        </>
      ) : (
        <>
          <span>{fmtNum(row.m3Volume, 1)} m³</span>
          <span>Labour {fmtRm(row.totalCost)}</span>
          <CostPerM3Badge value={row.costPerM3} />
        </>
      )}
    </div>
  )
}
