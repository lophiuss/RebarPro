'use client'

import React, { useState, useTransition } from 'react'
import {
  BarChart3, Users, Clock, DollarSign, Calendar, Filter,
  Building2, Briefcase, TrendingUp, Layers
} from 'lucide-react'
import { getWorkforceAnalytics } from '../analytics-actions'

type HourlyStat = { hour: string; activeWorkers: number; basicHours: number; otHours: number; wageCost: number | null }
type DeptStat = { department: string; workers: number; basicHours: number; otHours: number; totalHours: number; totalWages: number | null }
type ProjectStat = { projectId: number; projectName: string; hours: number; wages: number | null }

export default function WorkforceAnalyticsClient({
  initialMonth,
  initialData,
  departments,
  projects,
}: {
  initialMonth: string
  initialData: {
    canSeeWages: boolean
    hourlyStats: HourlyStat[]
    byDepartment: DeptStat[]
    byProject: ProjectStat[]
  }
  departments: string[]
  projects: { id: number; name: string }[]
}) {
  const [isPending, startTransition] = useTransition()
  const [month, setMonth] = useState(initialMonth)
  const [singleDate, setSingleDate] = useState(`${initialMonth}-01`)
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined)
  const [data, setData] = useState(initialData)
  const [view, setView] = useState<'hourly' | 'department' | 'project'>('hourly')

  function refresh() {
    startTransition(async () => {
      const res = await getWorkforceAnalytics({
        month,
        date: singleDate,
        line: selectedDept || undefined,
        projectId: selectedProject,
      })
      setData(res)
    })
  }

  const totalBasic = data.byDepartment.reduce((sum, d) => sum + d.basicHours, 0)
  const totalOt = data.byDepartment.reduce((sum, d) => sum + d.otHours, 0)
  const totalHours = totalBasic + totalOt
  const totalWages = data.canSeeWages ? data.byDepartment.reduce((sum, d) => sum + (d.totalWages || 0), 0) : null
  const totalWorkers = data.byDepartment.reduce((sum, d) => sum + d.workers, 0)

  const maxHourWorkers = Math.max(...data.hourlyStats.map(h => h.activeWorkers), 1)

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24">
      {/* Top Banner & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Workforce Manhour &amp; Labor Cost Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time hours, OT distribution, and project labor costs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={e => { setMonth(e.target.value); setSingleDate(`${e.target.value}-01`) }}
            className="text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white"
          />
          <button
            type="button"
            onClick={refresh}
            disabled={isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
          >
            {isPending ? 'Updating...' : 'Apply Filters'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <Users className="w-3.5 h-3.5 text-blue-600" /> Active Workers
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{totalWorkers}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">across active lines</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <Clock className="w-3.5 h-3.5 text-indigo-600" /> Total Manhours
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{totalHours.toLocaleString()}h</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Basic {totalBasic.toLocaleString()}h · <span className="text-amber-600 font-semibold">OT {totalOt.toLocaleString()}h</span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-amber-500" /> Overtime Ratio
          </div>
          <div className="text-2xl font-extrabold text-amber-600">
            {totalHours > 0 ? `${((totalOt / totalHours) * 100).toFixed(1)}%` : '0%'}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">of plant labor hours</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Est. Labor Cost
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {data.canSeeWages && totalWages !== null ? `RM ${totalWages.toLocaleString()}` : '—'}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {data.canSeeWages ? 'Calculated via hourly pay multipliers' : 'Restricted to HR / Admin'}
          </p>
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setView('hourly')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            view === 'hourly' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5 inline mr-1" /> By Hour (Intraday Curve)
        </button>
        <button
          type="button"
          onClick={() => setView('department')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            view === 'department' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 inline mr-1" /> By Department (Line)
        </button>
        <button
          type="button"
          onClick={() => setView('project')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            view === 'project' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5 inline mr-1" /> By Project
        </button>
      </div>

      {/* VIEW 1: Hourly Intraday Curve */}
      {view === 'hourly' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Intraday Active Workforce Curve</h2>
              <p className="text-xs text-slate-400">Worker presence and OT clocking across 24 hours ({singleDate})</p>
            </div>
            <input
              type="date"
              value={singleDate}
              onChange={e => setSingleDate(e.target.value)}
              className="text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white"
            />
          </div>

          <div className="h-64 flex items-end gap-1.5 pt-8 px-2 border-b border-slate-200">
            {data.hourlyStats.map(h => {
              const pct = (h.activeWorkers / maxHourWorkers) * 100
              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  {h.activeWorkers > 0 && (
                    <span className="text-[10px] font-bold text-slate-600 mb-1">
                      {h.activeWorkers}
                    </span>
                  )}
                  <div
                    className="w-full bg-indigo-500 hover:bg-indigo-600 rounded-t-sm transition-all"
                    style={{ height: `${Math.max(pct, h.activeWorkers > 0 ? 8 : 2)}%` }}
                  />
                  <span className="text-[9px] text-slate-400 mt-2 rotate-[-45deg] origin-top-left sm:rotate-0">
                    {h.hour.slice(0, 2)}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-center gap-6 text-xs text-slate-500 pt-2">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-xs bg-indigo-500" /> Active Workers</span>
          </div>
        </div>
      )}

      {/* VIEW 2: Department Breakdown */}
      {view === 'department' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Department / Line Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
                  <th className="py-2.5">Department</th>
                  <th className="py-2.5 text-right">Headcount</th>
                  <th className="py-2.5 text-right">Basic (h)</th>
                  <th className="py-2.5 text-right">OT (h)</th>
                  <th className="py-2.5 text-right">Total Hours</th>
                  {data.canSeeWages && <th className="py-2.5 text-right">Labor Cost (RM)</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.byDepartment.map(d => (
                  <tr key={d.department} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold text-slate-800">{d.department}</td>
                    <td className="py-3 text-right">{d.workers}</td>
                    <td className="py-3 text-right">{d.basicHours.toLocaleString()}</td>
                    <td className="py-3 text-right text-amber-600 font-medium">{d.otHours.toLocaleString()}</td>
                    <td className="py-3 text-right font-bold">{d.totalHours.toLocaleString()}</td>
                    {data.canSeeWages && (
                      <td className="py-3 text-right font-mono font-medium text-emerald-700">
                        {d.totalWages !== null ? `RM ${d.totalWages.toLocaleString()}` : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: Project Breakdown */}
      {view === 'project' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Project Manhours &amp; Labor Allocation</h2>
          {data.byProject.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No project work hours clocked for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
                    <th className="py-2.5">Project Name</th>
                    <th className="py-2.5 text-right">Clocked Hours</th>
                    {data.canSeeWages && <th className="py-2.5 text-right">Est. Labor Cost</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byProject.map(p => (
                    <tr key={p.projectId} className="hover:bg-slate-50">
                      <td className="py-3 font-semibold text-slate-800">{p.projectName}</td>
                      <td className="py-3 text-right font-bold">{p.hours.toLocaleString()} h</td>
                      {data.canSeeWages && (
                        <td className="py-3 text-right font-mono font-medium text-emerald-700">
                          {p.wages !== null ? `RM ${p.wages.toLocaleString()}` : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
