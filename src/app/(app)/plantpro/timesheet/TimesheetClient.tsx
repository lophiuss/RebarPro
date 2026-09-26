'use client'

import { guard } from '../feedback'
import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ChevronLeft, ChevronRight, Settings, Calendar, Plus, Trash2, ArrowUpDown } from 'lucide-react'
import { updateTimesheetDay, updateTimesheetMultiplier, addHoliday, removeHoliday } from '../actions'
import { calcNetPay, calcMonthPay, type DayType, type Multipliers } from '@/lib/plantpro-payroll'

type Worker = { id: number; worker_no: string | null; name: string; line: string | null; designation: string | null; supervisors: { name: string } | null }
type TimesheetDay = { worker_id: number; day: string; basic: number; ot: number }
type Holiday = { date: string; label: string }
type PayColumn = { id: number; key: string; include_in_gross: boolean; include_in_net_deduct: boolean }
type PayValue = { worker_id: number; pay_column_id: number; value: number }
// DB row shape (snake_case) — distinct from plantpro-payroll's Multipliers
// (camelCase, ported verbatim from PMS). Converted at the call site below.
type MultiplierRow = { normal_ot: number; sunday_basic: number; sunday_ot: number; holiday_basic: number; holiday_ot: number }

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmt(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) }
function daysInMonth(month: string) { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate() }
function shiftMonth(month: string, delta: number) { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function monthLabel(month: string) { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }


export default function TimesheetClient({ month, workers, timesheetDays, monthHolidays, allHolidays, multiplier, payColumns, payValues, appliedOtByWorker }: {
  month: string; workers: Worker[]; timesheetDays: TimesheetDay[]; monthHolidays: Holiday[]; allHolidays: Holiday[]
  multiplier: MultiplierRow; payColumns: PayColumn[]; payValues: PayValue[]; appliedOtByWorker: Record<number, number>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const multipliers: Multipliers = {
    normalOt: multiplier.normal_ot, sundayBasic: multiplier.sunday_basic, sundayOt: multiplier.sunday_ot,
    holidayBasic: multiplier.holiday_basic, holidayOt: multiplier.holiday_ot,
  }
  const [activeTab, setActiveTab] = useState<'timesheet' | 'multipliers' | 'holidays'>('timesheet')
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayLabel, setNewHolidayLabel] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' })
  const [filterSupervisor, setFilterSupervisor] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  // Column widths (px) — drag a header's right edge to resize. All day
  // columns share one width.
  const [colW, setColW] = useState<Record<string, number>>({ id: 64, name: 150, supervisor: 100, dept: 90, day: 40, applied: 70, actual: 70, diff: 60, basic: 64, pay: 96 })
  function startResize(key: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = colW[key]
    const move = (ev: MouseEvent) => setColW(prev => ({ ...prev, [key]: Math.max(28, startW + ev.clientX - startX) }))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const grip = (key: string) => <span onMouseDown={e => startResize(key, e)} onClick={e => e.stopPropagation()} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300" />

  const daysArray = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const [y, m] = month.split('-').map(Number)
    const dow = new Date(y, m - 1, i + 1).getDay()
    return { day: String(i + 1).padStart(2, '0'), dayOfWeek: dow, isSunday: dow === 0 }
  })
  const holidaySet = useMemo(() => new Set(monthHolidays.map(h => h.date.slice(-2))), [monthHolidays])
  function getDayType(d: { day: string; isSunday: boolean }): DayType {
    if (holidaySet.has(d.day)) return 'holiday'
    if (d.isSunday) return 'sunday'
    return 'normal'
  }

  const dayByWorkerDay = useMemo(() => {
    const m = new Map<string, TimesheetDay>()
    for (const t of timesheetDays) m.set(`${t.worker_id}:${t.day}`, t)
    return m
  }, [timesheetDays])
  function getVal(workerId: number, day: string, field: 'basic' | 'ot') {
    const rec = dayByWorkerDay.get(`${workerId}:${day}`)
    if (!rec) {
      if (field === 'basic') { const d = daysArray.find(x => x.day === day); return getDayType({ day, isSunday: !!d?.isSunday }) === 'normal' ? 8 : 0 }
      return 0
    }
    return rec[field] ?? 0
  }

  const payValueByWorker = useMemo(() => {
    const m = new Map<number, Map<number, number>>()
    for (const v of payValues) { if (!m.has(v.worker_id)) m.set(v.worker_id, new Map()); m.get(v.worker_id)!.set(v.pay_column_id, v.value) }
    return m
  }, [payValues])
  const columnFlags = payColumns.map(c => ({ key: c.id, includeInGross: c.include_in_gross, includeInNetDeduct: c.include_in_net_deduct }))

  function calcWorkerMonthPay(w: Worker) {
    const values: Record<number, number> = {}
    const pv = payValueByWorker.get(w.id)
    for (const c of payColumns) values[c.id] = pv?.get(c.id) || 0
    const netPay = calcNetPay(values as any, columnFlags as any)
    const days = daysArray.map(d => ({ basic: getVal(w.id, d.day, 'basic'), ot: getVal(w.id, d.day, 'ot'), dayType: getDayType(d) }))
    const { totalBasic, totalOT, totalPay } = calcMonthPay(days, netPay, multipliers)
    const appliedOT = appliedOtByWorker[w.id] || 0
    return { totalBasic, totalOT, totalPay, appliedOT, diffOT: totalOT - appliedOT }
  }

  const distinctSupervisors = [...new Set(workers.map(w => w.supervisors?.name).filter(Boolean))].sort() as string[]
  const distinctDepartments = [...new Set(workers.map(w => w.line).filter(Boolean))].sort() as string[]

  const rows = workers
    .filter(w => !filterSupervisor || w.supervisors?.name === filterSupervisor)
    .filter(w => !filterDepartment || w.line === filterDepartment)
    .map(w => ({ worker: w, ...calcWorkerMonthPay(w) }))

  const sortedRows = (() => {
    if (!sortConfig.key) return rows
    const key = sortConfig.key
    const getSortVal = (row: typeof rows[number]): string | number => {
      if (key === 'name') return row.worker.name
      if (key === 'supervisor') return row.worker.supervisors?.name || ''
      if (key === 'line') return row.worker.line || ''
      if (key === 'totalBasic') return row.totalBasic
      if (key === 'totalOT') return row.totalOT
      if (key === 'appliedOT') return row.appliedOT
      if (key === 'diffOT') return row.diffOT
      if (key === 'id') return row.worker.worker_no || ''
      if (key === 'totalPay') return row.totalPay
      return ''
    }
    return [...rows].sort((a, b) => {
      const av = getSortVal(a), bv = getSortVal(b)
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  })()

  function requestSort(key: string) { setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' })) }
  function SortIcon({ col }: { col: string }) { return <ArrowUpDown className="w-3 h-3 inline ml-0.5" style={{ opacity: sortConfig.key === col ? 1 : 0.35 }} /> }
  function changeMonth(m: string) { startTransition(() => router.push(`/plantpro/timesheet?month=${m}`)) }
  function dayBg(d: { day: string; isSunday: boolean }) {
    const t = getDayType(d)
    if (t === 'holiday') return 'bg-purple-50'
    if (t === 'sunday') return 'bg-blue-50'
    return ''
  }

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b">
        {[{ key: 'timesheet', label: '📋 Timesheet Entry' }, { key: 'multipliers', label: '⚙️ Multiplier Config' }, { key: 'holidays', label: '🎌 Holiday Calendar' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)} className={`px-4 py-2 text-sm -mb-px border-b-2 ${activeTab === t.key ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-gray-500'}`}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'timesheet' && (
        <div className="bg-white border rounded-xl shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
            <h3 className="font-bold">Actual Hours Entry</h3>
            <div className="flex items-center">
              <button onClick={() => changeMonth(shiftMonth(month, -1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronLeft className="w-5 h-5" /></button>
              <span className="font-semibold px-2 flex items-center gap-1.5">{monthLabel(month)}{isPending && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}</span>
              <button onClick={() => changeMonth(shiftMonth(month, 1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 px-4 pb-3 text-xs text-gray-500">
            <span>🔵 Sunday (×{multiplier.sunday_basic} Basic / ×{multiplier.sunday_ot} OT)</span>
            <span>🟣 Holiday (×{multiplier.holiday_basic} Basic / ×{multiplier.holiday_ot} OT)</span>
            <span>⚪ Normal (×1.0 Basic / ×{multiplier.normal_ot} OT)</span>
          </div>
          <div className="flex gap-2 px-4 pb-3">
            <select value={filterSupervisor} onChange={e => setFilterSupervisor(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm bg-white w-40">
              <option value="">All Supervisors</option>{distinctSupervisors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm bg-white w-40">
              <option value="">All Departments</option>{distinctDepartments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className={`overflow-auto max-h-[calc(100vh-15rem)] transition-opacity ${isPending ? 'opacity-50' : ''}`}>
            <table className="text-xs border-collapse" style={{ tableLayout: 'fixed', width: colW.id + colW.name + colW.supervisor + colW.dept + daysArray.length * colW.day + colW.applied + colW.actual + colW.diff + colW.basic + colW.pay }}>
              <colgroup>
                <col style={{ width: colW.id }} /><col style={{ width: colW.name }} /><col style={{ width: colW.supervisor }} /><col style={{ width: colW.dept }} />
                {daysArray.map(d => <col key={d.day} style={{ width: colW.day }} />)}
                <col style={{ width: colW.applied }} /><col style={{ width: colW.actual }} /><col style={{ width: colW.diff }} /><col style={{ width: colW.basic }} /><col style={{ width: colW.pay }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left cursor-pointer" onClick={() => requestSort('id')}>ID <SortIcon col="id" />{grip('id')}</th>
                  <th style={{ left: colW.id }} className="sticky top-0 z-30 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left cursor-pointer" onClick={() => requestSort('name')}>Name <SortIcon col="name" />{grip('name')}</th>
                  <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left cursor-pointer whitespace-nowrap" onClick={() => requestSort('supervisor')}>Supervisor <SortIcon col="supervisor" />{grip('supervisor')}</th>
                  <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-left cursor-pointer whitespace-nowrap" onClick={() => requestSort('line')}>Dept <SortIcon col="line" />{grip('dept')}</th>
                  {daysArray.map(d => (
                    <th key={d.day} className={`sticky top-0 z-20 shadow-[inset_0_-1px_0_#e5e7eb] px-0.5 py-1 text-center text-xs ${dayBg(d) || 'bg-gray-50'}`}>
                      <div className="font-bold">{d.day}</div><div className="text-[10px] text-gray-400">{DAYS_OF_WEEK[d.dayOfWeek]}</div>{grip('day')}
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-center cursor-pointer whitespace-nowrap" title="OT hours the supervisor applied for (OT & Allocation page)" onClick={() => requestSort('appliedOT')}>Applied OT <SortIcon col="appliedOT" />{grip('applied')}</th>
                  <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-center cursor-pointer whitespace-nowrap" title="OT hours actually keyed in this timesheet" onClick={() => requestSort('totalOT')}>Actual OT <SortIcon col="totalOT" />{grip('actual')}</th>
                  <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-center cursor-pointer whitespace-nowrap" title="Actual minus Applied" onClick={() => requestSort('diffOT')}>Diff <SortIcon col="diffOT" />{grip('diff')}</th>
                  <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-center cursor-pointer whitespace-nowrap" onClick={() => requestSort('totalBasic')}>Basic <SortIcon col="totalBasic" />{grip('basic')}</th>
                  <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-2 py-1 text-center cursor-pointer whitespace-nowrap" onClick={() => requestSort('totalPay')}>Est. Pay (RM) <SortIcon col="totalPay" />{grip('pay')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(({ worker: w, totalBasic, totalOT, totalPay, appliedOT, diffOT }) => (
                  <tr key={w.id} className="border-b border-gray-100">
                    <td className="sticky left-0 z-10 bg-white px-2 py-0.5 text-gray-500 truncate">{w.worker_no || '-'}</td>
                    <td style={{ left: colW.id }} className="sticky z-10 bg-white px-2 py-0.5 font-medium truncate" title={w.name}>{w.name}</td>
                    <td className="px-2 py-0.5 text-xs text-gray-500 truncate">{w.supervisors?.name || '-'}</td>
                    <td className="px-2 py-0.5 text-xs text-gray-500 truncate">{w.line || '-'}</td>
                    {daysArray.map(d => (
                      <td key={d.day} className={`px-0.5 py-0.5 ${dayBg(d)}`}>
                        <div className="flex flex-col w-full">
                          <input type="number" defaultValue={getVal(w.id, d.day, 'basic')} title="Basic" onBlur={e => guard(() => updateTimesheetDay(w.id, month, d.day, 'basic', e.target.value))} className="border rounded px-0.5 py-0 h-5 text-[11px] w-full text-center" />
                          <input type="number" defaultValue={getVal(w.id, d.day, 'ot') || ''} title="OT" placeholder="OT" onBlur={e => guard(() => updateTimesheetDay(w.id, month, d.day, 'ot', e.target.value))} className="border rounded px-0.5 py-0 h-5 text-[11px] w-full text-center bg-amber-50" />
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-0.5 text-center text-gray-600">{fmt(appliedOT)}</td>
                    <td className="px-2 py-0.5 text-center font-bold text-amber-600">{fmt(totalOT)}</td>
                    <td className={`px-2 py-0.5 text-center font-bold ${diffOT > 0 ? 'text-red-600' : diffOT < 0 ? 'text-blue-600' : 'text-gray-400'}`} title={diffOT > 0 ? 'More OT worked than applied for' : diffOT < 0 ? 'Less OT worked than applied for' : 'Matches'}>{diffOT > 0 ? '+' : ''}{fmt(diffOT)}</td>
                    <td className="px-2 py-0.5 text-center font-bold text-indigo-600">{fmt(totalBasic)}</td>
                    <td className="px-2 py-0.5 text-center font-bold text-green-600">RM {fmt(totalPay)}</td>
                  </tr>
                ))}
                {sortedRows.length === 0 && <tr><td colSpan={daysArray.length + 10} className="text-center text-gray-400 py-8">No workers match this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'multipliers' && (
        <div className="bg-white border rounded-xl shadow-sm p-5 max-w-lg">
          <h3 className="font-bold flex items-center gap-2 mb-1"><Settings className="w-4.5 h-4.5" /> Pay Rate Multipliers</h3>
          <p className="text-xs text-gray-500 mb-4">Applied to the hourly rate for each category.</p>
          <div className="space-y-3">
            {[
              { key: 'normal_ot', label: 'Normal OT Multiplier', desc: 'Applied to OT hours on weekdays', value: multiplier.normal_ot },
              { key: 'sunday_basic', label: 'Sunday Basic Multiplier', desc: 'Applied to basic hours on Sundays', value: multiplier.sunday_basic },
              { key: 'sunday_ot', label: 'Sunday OT Multiplier', desc: 'Applied to OT hours on Sundays', value: multiplier.sunday_ot },
              { key: 'holiday_basic', label: 'Holiday Basic Multiplier', desc: 'Applied to basic hours on public holidays', value: multiplier.holiday_basic },
              { key: 'holiday_ot', label: 'Holiday OT Multiplier', desc: 'Applied to OT hours on public holidays', value: multiplier.holiday_ot },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div><div className="font-semibold text-sm">{item.label}</div><div className="text-xs text-gray-500">{item.desc}</div></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-500">×</span>
                  <input type="number" step="0.1" min={1} max={10} defaultValue={item.value} onBlur={e => guard(() => updateTimesheetMultiplier({ [item.key]: Number(e.target.value) || 1 }))} className="w-16 text-center font-bold border rounded px-2 py-1" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-indigo-50 rounded-lg text-xs text-gray-600">
            <strong className="text-indigo-700">Formula:</strong><br />
            Estimated Pay = Σ days [(Basic hrs × Daily Rate × Basic Multiplier) + (OT hrs × Daily Rate × OT Multiplier)]<br />
            <em>Daily Rate = Monthly Net Pay ÷ Days in Month</em>
          </div>
        </div>
      )}

      {activeTab === 'holidays' && (
        <div className="bg-white border rounded-xl shadow-sm p-5 max-w-xl">
          <h3 className="font-bold flex items-center gap-2 mb-1"><Calendar className="w-4.5 h-4.5" /> Public Holiday Calendar</h3>
          <p className="text-xs text-gray-500 mb-4">Days here use the holiday multipliers for pay calculation.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm w-40" />
            <input value={newHolidayLabel} onChange={e => setNewHolidayLabel(e.target.value)} placeholder="Holiday Name (e.g. Hari Raya)" className="flex-1 min-w-[160px] border rounded-md px-3 py-2 text-sm" />
            <button onClick={() => { if (!newHolidayDate) return; guard(() => addHoliday(newHolidayDate, newHolidayLabel)); setNewHolidayDate(''); setNewHolidayLabel('') }} className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Add</button>
          </div>
          {allHolidays.length === 0 ? <p className="text-gray-400 text-center py-8">No holidays defined yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b text-xs text-gray-500 uppercase"><th className="pb-2">Date</th><th>Day</th><th>Name</th><th></th></tr></thead>
              <tbody>
                {allHolidays.map(h => (
                  <tr key={h.date} className="border-b border-gray-100">
                    <td className="py-1.5 font-medium">{h.date}</td>
                    <td className="text-gray-500">{DAYS_OF_WEEK[new Date(h.date + 'T00:00:00').getDay()]}</td>
                    <td>{h.label}</td>
                    <td className="text-right"><button onClick={() => guard(() => removeHoliday(h.date))} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
