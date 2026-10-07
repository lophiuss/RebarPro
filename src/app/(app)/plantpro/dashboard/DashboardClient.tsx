'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Users, Clock, TrendingUp, Wallet, Gauge } from 'lucide-react'

export type MonthStat = { month: string; workers: number; basic: number; ot: number; forecastOt: number; salary: number }
export type DeptStat = { name: string; workers: number; salary: number; ot: number; forecastOt: number; hours: number }

const n0 = (v: number) => Math.round(v).toLocaleString()
const rm = (v: number) => `RM ${Math.round(v).toLocaleString()}`
const short = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))
function shiftMonth(month: string, delta: number) { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function monthLabel(month: string, style: 'long' | 'short' = 'long') { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' }) }

type Series = { key: string; label: string; color: string; value: (s: MonthStat) => number }

// Vertical bar chart, one column per month. stacked=true stacks the series
// in one bar; otherwise they sit side by side. The selected (last) month is
// highlighted.
function MonthBars({ stats, series, stacked, fmt, height = 190 }: { stats: MonthStat[]; series: Series[]; stacked?: boolean; fmt: (v: number) => string; height?: number }) {
  const max = Math.max(...stats.map(s => stacked ? series.reduce((t, x) => t + x.value(s), 0) : Math.max(...series.map(x => x.value(s)))), 1)
  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-4" style={{ height }}>
        {stats.map((s, i) => {
          const total = series.reduce((t, x) => t + x.value(s), 0)
          const selected = i === stats.length - 1
          return (
            <div key={s.month} className={`flex-1 h-full flex flex-col justify-end items-center rounded-t ${selected ? 'bg-indigo-50/70' : ''}`}>
              <div className="text-[10px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">{stacked ? short(total) : ''}</div>
              <div className={`w-full flex px-1 ${stacked ? 'flex-col-reverse items-stretch' : 'items-end justify-center gap-0.5'}`} style={{ height: `${((stacked ? total : Math.max(...series.map(x => x.value(s)))) / max) * 88}%`, minHeight: total > 0 ? 3 : 0 }}>
                {series.map(x => {
                  const v = x.value(s)
                  const h = stacked ? (total > 0 ? (v / total) * 100 : 0) : (v / Math.max(...series.map(y => y.value(s)), 1)) * 100
                  return (
                    <div key={x.key} title={`${monthLabel(s.month)} · ${x.label}: ${fmt(v)}`} className={`${stacked ? 'w-full' : 'flex-1 relative'} transition-all`} style={{ height: stacked ? `${h}%` : `${h}%`, backgroundColor: x.color, minHeight: v > 0 ? 2 : 0 }}>
                      {!stacked && v > 0 && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-slate-600 whitespace-nowrap">{short(v)}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 sm:gap-4 border-t mt-1 pt-1">
        {stats.map((s, i) => <div key={s.month} className={`flex-1 text-center text-[11px] ${i === stats.length - 1 ? 'font-bold text-indigo-700' : 'text-gray-500'}`}>{monthLabel(s.month, 'short')}</div>)}
      </div>
      <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-gray-600">
        {series.map(x => <span key={x.key} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: x.color }} />{x.label}</span>)}
      </div>
    </div>
  )
}

function Card({ icon: Icon, label, value, sub, tone = 'slate' }: { icon: any; label: string; value: string; sub?: React.ReactNode; tone?: 'slate' | 'green' | 'red' | 'indigo' }) {
  const colors = { slate: 'text-slate-800', green: 'text-green-600', red: 'text-red-600', indigo: 'text-indigo-700' }
  return (
    <div className="bg-white border rounded-xl shadow-sm p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className={`text-2xl font-bold mt-1 ${colors[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function Delta({ cur, prev, goodWhenUp = true }: { cur: number; prev: number; goodWhenUp?: boolean }) {
  if (!prev) return <span className="text-gray-400">no prior month</span>
  const pct = ((cur - prev) / prev) * 100
  const good = goodWhenUp ? pct >= 0 : pct <= 0
  return <span className={good ? 'text-green-600' : 'text-red-600'}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs last month</span>
}

export default function DashboardClient({ month, stats, depts }: { month: string; stats: MonthStat[]; depts: DeptStat[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const go = (m: string) => startTransition(() => router.push(`/plantpro/dashboard?month=${m}`))

  const cur = stats[stats.length - 1]
  const prev = stats[stats.length - 2]
  const hours = cur.basic + cur.ot
  const otGap = cur.ot - cur.forecastOt
  const otGapPct = cur.forecastOt > 0 ? (otGap / cur.forecastOt) * 100 : null
  const totalSalary = Math.max(cur.salary, 0)
  const maxDeptSalary = Math.max(...depts.map(d => d.salary), 1)

  return (
    <div className={`transition-opacity ${pending ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-1 mb-4">
        <button onClick={() => go(shiftMonth(month, -1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronLeft className="w-5 h-5" /></button>
        <span className="font-semibold px-2 w-40 text-center flex items-center justify-center gap-1.5">{monthLabel(month)}{pending && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}</span>
        <button onClick={() => go(shiftMonth(month, 1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronRight className="w-5 h-5" /></button>
        <input type="month" value={month} onChange={e => e.target.value && go(e.target.value)} className="ml-3 border rounded-md px-2 py-1 text-sm" />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-6">
        <Card icon={Users} label="Workers" value={n0(cur.workers)} sub="active this month" />
        <Card icon={Clock} label="Total Hours" value={n0(hours)} sub={<>Basic {n0(cur.basic)} · OT {n0(cur.ot)}</>} />
        <Card icon={TrendingUp} label="OT vs Forecast" value={`${otGap > 0 ? '+' : ''}${n0(otGap)} h`} tone={otGap > 0 ? 'red' : 'green'}
          sub={otGapPct === null ? 'no forecast entered' : <>{otGapPct > 0 ? '+' : ''}{otGapPct.toFixed(1)}% · actual {n0(cur.ot)} / forecast {n0(cur.forecastOt)}</>} />
        <Card icon={Wallet} label="Est. Salary Payout" value={rm(totalSalary)} tone="indigo" sub={prev ? <Delta cur={cur.salary} prev={prev.salary} goodWhenUp={false} /> : undefined} />
        <Card icon={Gauge} label="Avg per Worker" value={cur.workers ? rm(totalSalary / cur.workers) : '—'} sub={cur.workers ? `${(hours / cur.workers).toFixed(0)} h per worker` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-slate-800 text-sm">Work Hours &amp; OT by Month</h2>
          <p className="text-xs text-gray-400 mb-4">Basic and overtime hours worked (actual timesheet), last 6 months.</p>
          <MonthBars stats={stats} stacked fmt={v => `${n0(v)} h`} series={[
            { key: 'basic', label: 'Basic hours', color: '#6366f1', value: s => s.basic },
            { key: 'ot', label: 'OT hours', color: '#f59e0b', value: s => s.ot },
          ]} />
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-slate-800 text-sm">Actual OT vs Forecast OT</h2>
          <p className="text-xs text-gray-400 mb-4">Forecast = OT the supervisors planned on OT &amp; Allocation. Actual = OT keyed on the Timesheet.</p>
          <MonthBars stats={stats} fmt={v => `${n0(v)} h`} series={[
            { key: 'forecast', label: 'Forecast OT', color: '#c4b5fd', value: s => s.forecastOt },
            { key: 'actual', label: 'Actual OT', color: '#f59e0b', value: s => s.ot },
          ]} />
          <div className="flex gap-2 sm:gap-4 mt-1">
            {stats.map(s => { const d = s.ot - s.forecastOt; return <div key={s.month} className={`flex-1 text-center text-[10px] font-semibold ${s.forecastOt === 0 ? 'text-gray-300' : d > 0 ? 'text-red-600' : 'text-green-600'}`}>{s.forecastOt === 0 ? '—' : `${d > 0 ? '+' : ''}${short(d)}`}</div> })}
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-0.5">difference (actual − forecast) · red = over forecast</p>
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-slate-800 text-sm">Total Salary Payout</h2>
          <p className="text-xs text-gray-400 mb-4">Estimated from actual hours × day-type multipliers (same figure as Timesheet Est. Pay), last 6 months.</p>
          <MonthBars stats={stats} fmt={v => rm(v)} series={[{ key: 'salary', label: 'Estimated payout (RM)', color: '#10b981', value: s => Math.max(s.salary, 0) }]} />
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-slate-800 text-sm">Department Salary — {monthLabel(month)}</h2>
          <p className="text-xs text-gray-400 mb-4">By the worker&apos;s department (Line). Share of this month&apos;s total payout.</p>
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {depts.map(d => (
              <div key={d.name} className="text-xs">
                <div className="flex justify-between gap-2 mb-0.5">
                  <span className="font-semibold text-slate-700 truncate" title={d.name}>{d.name} <span className="font-normal text-gray-400">· {d.workers} workers</span></span>
                  <span className="font-semibold text-slate-800 whitespace-nowrap">{rm(d.salary)} <span className="font-normal text-gray-400">({totalSalary > 0 ? ((d.salary / totalSalary) * 100).toFixed(1) : 0}%)</span></span>
                </div>
                <div className="h-2 bg-gray-100 rounded overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(d.salary / maxDeptSalary) * 100}%` }} /></div>
              </div>
            ))}
            {depts.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No data for this month.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto max-h-[50vh]">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 uppercase text-left [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-gray-50 [&>th]:px-3 [&>th]:py-2 [&>th]:shadow-[inset_0_-1px_0_#e5e7eb]">
              <th>Department</th><th className="text-right">Workers</th><th className="text-right">Hours</th><th className="text-right">OT actual</th><th className="text-right">OT forecast</th><th className="text-right">OT diff</th><th className="text-right">Salary</th><th className="text-right">Avg / worker</th>
            </tr>
          </thead>
          <tbody>
            {depts.map(d => { const diff = d.ot - d.forecastOt; return (
              <tr key={d.name} className="border-b border-gray-100">
                <td className="px-3 py-1 font-medium">{d.name}</td>
                <td className="px-3 py-1 text-right">{d.workers}</td>
                <td className="px-3 py-1 text-right">{n0(d.hours)}</td>
                <td className="px-3 py-1 text-right">{n0(d.ot)}</td>
                <td className="px-3 py-1 text-right">{n0(d.forecastOt)}</td>
                <td className={`px-3 py-1 text-right font-semibold ${d.forecastOt === 0 ? 'text-gray-300' : diff > 0 ? 'text-red-600' : 'text-green-600'}`}>{d.forecastOt === 0 ? '—' : `${diff > 0 ? '+' : ''}${n0(diff)}`}</td>
                <td className="px-3 py-1 text-right font-semibold">{rm(d.salary)}</td>
                <td className="px-3 py-1 text-right text-gray-600">{d.workers ? rm(d.salary / d.workers) : '—'}</td>
              </tr>
            )})}
            <tr className="bg-gray-50 font-bold">
              <td className="px-3 py-1.5">Total</td><td className="px-3 py-1.5 text-right">{cur.workers}</td><td className="px-3 py-1.5 text-right">{n0(hours)}</td>
              <td className="px-3 py-1.5 text-right">{n0(cur.ot)}</td><td className="px-3 py-1.5 text-right">{n0(cur.forecastOt)}</td>
              <td className={`px-3 py-1.5 text-right ${cur.forecastOt === 0 ? 'text-gray-300' : otGap > 0 ? 'text-red-600' : 'text-green-600'}`}>{cur.forecastOt === 0 ? '—' : `${otGap > 0 ? '+' : ''}${n0(otGap)}`}</td>
              <td className="px-3 py-1.5 text-right">{rm(totalSalary)}</td><td className="px-3 py-1.5 text-right">{cur.workers ? rm(totalSalary / cur.workers) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 mt-3">Hours follow the Timesheet rules: a day with no entry counts 8 basic hours on a normal day and 0 on Sundays and public holidays, so a month still in progress already includes its remaining days. Salary is an estimate and uses each worker&apos;s current pay values for every month shown.</p>
    </div>
  )
}
