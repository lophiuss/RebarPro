'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DollarSign, Clock, ChevronLeft, ChevronRight, Search, Copy, RefreshCw,
  Save, Plus, CheckCircle2, AlertTriangle, X, DownloadCloud, Zap, Pencil
} from 'lucide-react'
import {
  calcPersonDayCost,
  getDayType,
  getWorkingDaysInMonth,
  listMonthDates,
  type DlerAllocation,
  type DlerDailyOt,
  type DlerDepartment,
  type DlerMonthlyPay,
  type DlerPerson,
  type DlerProject,
  type DlerSettings,
} from '@/lib/dler-math'
import {
  bulkFillDailyOt,
  copyPreviousMonthPay,
  saveDailyOtCell,
  saveDlerPerson,
  saveMonthlyPayBatch,
  syncWorkerOtFromPlantpro,
  syncWorkersFromPlantpro,
  updatePersonDetails,
  updatePersonEmpNo,
  updatePersonParentAndDept,
} from '../actions'

type PayDraft = {
  basic_pay: string
  allowance: string
  employer_statutory: string
  deductions: string
  working_days_override: string
  hourly_rate_override: string
  remarks: string
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function PayOtWorkspace({
  personType,
  month,
  settings,
  holidays,
  departments,
  projects,
  people,
  allStaff,
  allocations,
  monthlyPays,
  dailyOts,
}: {
  personType: 'WORKER' | 'STAFF'
  month: string
  settings: DlerSettings
  holidays: string[]
  departments: DlerDepartment[]
  projects: DlerProject[]
  people: DlerPerson[]
  allStaff: { id: number; name: string; emp_no?: string }[]
  allocations: DlerAllocation[]
  monthlyPays: DlerMonthlyPay[]
  dailyOts: DlerDailyOt[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<'pay' | 'ot'>('pay')
  const [query, setQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState<string>('')
  const [absentMode, setAbsentMode] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [newStaff, setNewStaff] = useState({ emp_no: '', name: '', designation: '', department_id: '', reports_to_id: '' })
  const [editingPerson, setEditingPerson] = useState<{
    id: number
    emp_no: string
    name: string
    designation: string
    department_id: string
    reports_to_id: string
    status: 'Active' | 'Inactive' | 'On Leave'
    remarks: string
  } | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const isWorker = personType === 'WORKER'
  const basePath = isWorker ? '/dler/workers' : '/dler/staff'

  const holidaySet = useMemo(() => new Set(holidays), [holidays])
  const monthDates = useMemo(() => listMonthDates(month), [month])
  const monthWorkingDays = useMemo(
    () => getWorkingDaysInMonth(month, settings.working_days_mode, Number(settings.fixed_working_days), holidaySet),
    [month, settings, holidaySet]
  )

  const projMap = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects])

  const staffChildrenByParent = useMemo(() => {
    const m = new Map<number, number[]>()
    if (!isWorker) {
      for (const p of people) {
        if (p.reports_to_id != null) {
          const arr = m.get(p.reports_to_id) ?? []
          arr.push(p.id)
          m.set(p.reports_to_id, arr)
        }
      }
    }
    return m
  }, [isWorker, people])

  function getBlockedSupervisorIds(personId: number): Set<number> {
    const blocked = new Set<number>()
    if (isWorker) return blocked
    const stack = [personId]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (blocked.has(cur)) continue
      blocked.add(cur)
      for (const cid of staffChildrenByParent.get(cur) ?? []) {
        stack.push(cid)
      }
    }
    return blocked
  }

  const allocsByPerson = useMemo(() => {
    const m = new Map<number, { name: string; pct: number }[]>()
    for (const a of allocations) {
      if (a.percentage <= 0) continue
      const arr = m.get(a.person_id) ?? []
      arr.push({ name: projMap.get(a.project_id) ?? `#${a.project_id}`, pct: a.percentage })
      m.set(a.person_id, arr)
    }
    return m
  }, [allocations, projMap])

  const initialPayDrafts = useMemo(() => {
    const payByPerson = new Map(monthlyPays.map(p => [p.person_id, p]))
    const out: Record<number, PayDraft> = {}
    for (const person of people) {
      const p = payByPerson.get(person.id)
      out[person.id] = {
        basic_pay: p && p.basic_pay ? String(p.basic_pay) : '',
        allowance: p && p.allowance ? String(p.allowance) : '',
        employer_statutory: p && p.employer_statutory ? String(p.employer_statutory) : '',
        deductions: p && p.deductions ? String(p.deductions) : '',
        working_days_override: p?.working_days_override ? String(p.working_days_override) : '',
        hourly_rate_override: p?.hourly_rate_override ? String(p.hourly_rate_override) : '',
        remarks: p?.remarks ?? '',
      }
    }
    return out
  }, [people, monthlyPays])

  const [drafts, setDrafts] = useState<Record<number, PayDraft>>(initialPayDrafts)

  // Reset drafts if people/month changes via router navigation
  React.useEffect(() => {
    setDrafts(initialPayDrafts)
  }, [initialPayDrafts])

  // OT map: `${person_id}:${work_date}` -> DlerDailyOt
  const otMap = useMemo(() => {
    const m = new Map<string, DlerDailyOt>()
    for (const o of dailyOts) {
      m.set(`${o.person_id}:${o.work_date}`, o)
    }
    return m
  }, [dailyOts])

  function grossOfDraft(d: PayDraft | undefined): number {
    if (!d) return 0
    const b = Number(d.basic_pay) || 0
    const a = Number(d.allowance) || 0
    const s = Number(d.employer_statutory) || 0
    const ded = Number(d.deductions) || 0
    return Math.max(0, Math.round((b + a + s - ded) * 100) / 100)
  }

  function updateDraft(personId: number, field: keyof PayDraft, value: string) {
    setDrafts(prev => ({
      ...prev,
      [personId]: {
        ...(prev[personId] ?? {
          basic_pay: '',
          allowance: '',
          employer_statutory: '',
          deductions: '',
          working_days_override: '',
          hourly_rate_override: '',
          remarks: '',
        }),
        [field]: value,
      },
    }))
  }

  const q = query.trim().toLowerCase()
  const filteredPeople = useMemo(() => {
    return people.filter(p => {
      if (deptFilter && String(p.department_id ?? '') !== deptFilter) return false
      if (q && !p.name.toLowerCase().includes(q) && !p.emp_no.toLowerCase().includes(q)) return false
      return true
    })
  }, [people, deptFilter, q])

  const totalPayrollSum = useMemo(() => {
    return filteredPeople.reduce((s, p) => s + grossOfDraft(drafts[p.id]), 0)
  }, [filteredPeople, drafts])

  function goMonth(nextMonth: string) {
    router.push(`${basePath}?month=${nextMonth}`)
  }

  function runAction(fn: () => Promise<void>, okText: string) {
    setFeedback(null)
    startTransition(async () => {
      try {
        await fn()
        setFeedback({ kind: 'ok', text: okText })
        router.refresh()
      } catch (err: any) {
        setFeedback({ kind: 'err', text: err?.message ?? 'Operation failed' })
      }
    })
  }

  function handleAmendId(person: DlerPerson, el: HTMLInputElement) {
    const nextVal = el.value.trim()
    if (!nextVal) {
      el.value = person.emp_no
      return
    }
    if (nextVal === person.emp_no) {
      el.value = person.emp_no
      return
    }
    setFeedback(null)
    startTransition(async () => {
      try {
        await updatePersonEmpNo(person.id, nextVal)
        setFeedback({ kind: 'ok', text: `Updated ID for ${person.name} to ${nextVal}.` })
        router.refresh()
      } catch (err: any) {
        el.value = person.emp_no
        setFeedback({ kind: 'err', text: err?.message ?? 'Failed to update ID' })
      }
    })
  }

  function handleAmendName(person: DlerPerson, el: HTMLInputElement) {
    const nextVal = el.value.trim()
    if (!nextVal) {
      el.value = person.name
      return
    }
    if (nextVal === person.name) {
      el.value = person.name
      return
    }
    setFeedback(null)
    startTransition(async () => {
      try {
        await updatePersonDetails(person.id, { name: nextVal })
        setFeedback({ kind: 'ok', text: `Updated name to ${nextVal}.` })
        router.refresh()
      } catch (err: any) {
        el.value = person.name
        setFeedback({ kind: 'err', text: err?.message ?? 'Failed to update name' })
      }
    })
  }

  function handleChangeDept(person: DlerPerson, val: string) {
    const departmentId = val ? Number(val) : null
    if ((person.department_id ?? null) === departmentId) return
    runAction(
      () => updatePersonParentAndDept(person.id, { department_id: departmentId }),
      `Updated department for ${person.name}.`
    )
  }

  function handleChangeSupervisor(person: DlerPerson, val: string) {
    const reportsToId = val ? Number(val) : null
    if ((person.reports_to_id ?? null) === reportsToId) return
    runAction(
      () => updatePersonParentAndDept(person.id, { reports_to_id: reportsToId }),
      `Updated supervisor for ${person.name}.`
    )
  }

  function openEditPerson(p: DlerPerson) {
    setEditError(null)
    setEditingPerson({
      id: p.id,
      emp_no: p.emp_no,
      name: p.name,
      designation: p.designation ?? '',
      department_id: p.department_id != null ? String(p.department_id) : '',
      reports_to_id: p.reports_to_id != null ? String(p.reports_to_id) : '',
      status: p.status,
      remarks: p.remarks ?? '',
    })
  }

  function handleSaveEditPerson(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPerson) return
    setEditError(null)
    setFeedback(null)
    const snap = editingPerson
    startTransition(async () => {
      try {
        await updatePersonDetails(snap.id, {
          emp_no: snap.emp_no,
          name: snap.name,
          designation: snap.designation || null,
          department_id: snap.department_id ? Number(snap.department_id) : null,
          reports_to_id: snap.reports_to_id ? Number(snap.reports_to_id) : null,
          status: snap.status,
          remarks: snap.remarks || null,
        })
        setEditingPerson(null)
        setFeedback({ kind: 'ok', text: `Saved details for ${snap.name.trim()}.` })
        router.refresh()
      } catch (err: any) {
        const msg = err?.message ?? 'Save failed'
        setEditError(msg)
        setFeedback({ kind: 'err', text: msg })
      }
    })
  }

  function handleSaveAllPay() {
    const rows = filteredPeople.map(p => {
      const d = drafts[p.id] ?? {
        basic_pay: '',
        allowance: '',
        employer_statutory: '',
        deductions: '',
        working_days_override: '',
        hourly_rate_override: '',
        remarks: '',
      }
      return {
        person_id: p.id,
        basic_pay: Number(d.basic_pay) || 0,
        allowance: Number(d.allowance) || 0,
        employer_statutory: Number(d.employer_statutory) || 0,
        deductions: Number(d.deductions) || 0,
        working_days_override: d.working_days_override ? Number(d.working_days_override) : null,
        hourly_rate_override: d.hourly_rate_override ? Number(d.hourly_rate_override) : null,
        remarks: d.remarks || null,
      }
    })
    runAction(() => saveMonthlyPayBatch(month, personType, rows), `Saved monthly pay for ${rows.length} ${isWorker ? 'workers' : 'staff'}.`)
  }

  return (
    <div className={`max-w-[1600px] mx-auto p-4 md:p-6 space-y-5 transition-opacity ${isPending ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            {isWorker ? <Clock className="w-6 h-6 text-teal-600" /> : <DollarSign className="w-6 h-6 text-indigo-600" />}
            {isWorker ? 'Worker Pay & Daily OT Input (Anim)' : 'Staff Pay & Daily OT Input (Laily)'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isWorker
              ? 'Isolated worker payroll & daily overtime input. Staff salaries are hidden.'
              : 'Isolated staff payroll & daily overtime input. Worker salaries are hidden.'}{' '}
            · Working days divisor: <b>{monthWorkingDays}d</b> · Total shown payroll: <b>RM {totalPayrollSum.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
          </p>
        </div>

        {/* Month Navigation & Tabs */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2 py-1">
            <button type="button" onClick={() => goMonth(shiftMonth(month, -1))} className="p-1 rounded hover:bg-slate-100 text-slate-600">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={month}
              onChange={e => e.target.value && goMonth(e.target.value)}
              className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none"
            />
            <button type="button" onClick={() => goMonth(shiftMonth(month, 1))} className="p-1 rounded hover:bg-slate-100 text-slate-600">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab('pay')}
              className={`px-3 py-1.5 rounded-lg transition ${tab === 'pay' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600'}`}
            >
              Monthly Pay ({monthLabel(month)})
            </button>
            <button
              type="button"
              onClick={() => setTab('ot')}
              className={`px-3 py-1.5 rounded-lg transition ${tab === 'ot' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600'}`}
            >
              Daily OT &amp; Attendance Grid
            </button>
          </div>
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

      {/* Filter & Action Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${isWorker ? 'worker' : 'staff'} ID or name...`}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl w-52 bg-white"
            />
          </div>
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white"
          >
            <option value="">All Departments ({people.length})</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === 'pay' ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  runAction(async () => {
                    const count = await copyPreviousMonthPay(month, personType)
                    if (count === 0) throw new Error(`No pay entries found in ${shiftMonth(month, -1)} to copy`)
                  }, `Copied pay from ${shiftMonth(month, -1)} into ${month}.`)
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Prev Month
              </button>
              {isWorker ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    runAction(async () => {
                      await syncWorkersFromPlantpro()
                    }, 'Synced worker IDs & names from HR.')
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Sync Worker IDs from HR
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddStaff(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Staff
                </button>
              )}
              <button
                type="button"
                disabled={isPending}
                onClick={handleSaveAllPay}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> Save Monthly Pay
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAbsentMode(v => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  absentMode
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                {absentMode ? 'Absent Toggle ON (Click day cell to mark Absent)' : 'Mark Absent Mode'}
              </button>
              {isWorker && (
                <>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      runAction(async () => {
                        const r = await syncWorkerOtFromPlantpro(month, 'timesheet')
                        if (r.syncedCells === 0) throw new Error('No HR timesheet rows found for this month.')
                      }, `Imported OT hours from HR Timesheet for ${month}.`)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200"
                  >
                    <DownloadCloud className="w-3.5 h-3.5" /> Pull OT from HR Timesheet
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      runAction(async () => {
                        const r = await syncWorkerOtFromPlantpro(month, 'ot_sessions')
                        if (r.syncedCells === 0) throw new Error('No approved Live OT sessions found for this month.')
                      }, `Imported approved Live OT App hours for ${month}.`)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200"
                  >
                    <Zap className="w-3.5 h-3.5" /> Pull from Live OT App
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* TAB 1: Monthly Pay Table */}
      {tab === 'pay' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-auto max-h-[68vh]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 px-3 py-2.5 text-left whitespace-nowrap">ID</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-left whitespace-nowrap min-w-[190px]">Name</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-left whitespace-nowrap min-w-[180px]">Dept / Sup</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-left whitespace-nowrap">Project %</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap">Basic Pay</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap">Allowance</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap">EPF / Stat</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap text-rose-600">Deduct</th>
                  <th className="sticky top-0 z-20 bg-emerald-50 px-3 py-2.5 text-right whitespace-nowrap text-emerald-800">Gross Cost</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap">Days</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap">RM/Day</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap">RM/Hr</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-left whitespace-nowrap">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.map(p => {
                  const d = drafts[p.id] ?? {
                    basic_pay: '',
                    allowance: '',
                    employer_statutory: '',
                    deductions: '',
                    working_days_override: '',
                    hourly_rate_override: '',
                    remarks: '',
                  }
                  const gross = grossOfDraft(d)
                  const wDays = Number(d.working_days_override) > 0 ? Number(d.working_days_override) : monthWorkingDays
                  const dayCost = calcPersonDayCost({
                    grossPay: gross,
                    workingDays: wDays,
                    standardHours: Number(settings.standard_hours_per_day) || 8,
                    hourlyRateOverride: d.hourly_rate_override ? Number(d.hourly_rate_override) : null,
                    otHours: 0,
                    dayType: 'normal',
                    isAbsent: false,
                    multipliers: { normal: 1.5, sunday: 2.0, holiday: 3.0 },
                    includeBaseOnSundayHoliday: false,
                  })
                  const allocList = allocsByPerson.get(p.id) ?? []

                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/70 ${p.status === 'Inactive' ? 'opacity-50' : ''}`}>
                      <td className="sticky left-0 z-10 bg-white px-2 py-1 whitespace-nowrap">
                        <input
                          type="text"
                          key={`${p.id}:${p.emp_no}`}
                          defaultValue={p.emp_no}
                          aria-label={`${isWorker ? 'Worker' : 'Staff'} ID for ${p.name}`}
                          title="Click to amend ID (Enter or blur to save)"
                          onBlur={e => handleAmendId(p, e.currentTarget)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            } else if (e.key === 'Escape') {
                              e.currentTarget.value = p.emp_no
                              e.currentTarget.blur()
                            }
                          }}
                          className="w-24 font-mono text-xs text-slate-700 border border-transparent hover:border-slate-300 focus:border-teal-500 focus:bg-white bg-transparent rounded px-1.5 py-0.5 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap min-w-[190px]">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            key={`name:${p.id}:${p.name}`}
                            defaultValue={p.name}
                            aria-label={`${isWorker ? 'Worker' : 'Staff'} name for ${p.name}`}
                            title="Click to edit name (Enter or blur to save)"
                            onBlur={e => handleAmendName(p, e.currentTarget)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              } else if (e.key === 'Escape') {
                                e.currentTarget.value = p.name
                                e.currentTarget.blur()
                              }
                            }}
                            className="w-40 font-semibold text-xs text-slate-900 border border-transparent hover:border-slate-300 focus:border-teal-500 focus:bg-white bg-transparent rounded px-1.5 py-0.5 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => openEditPerson(p)}
                            title="Edit all details"
                            className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 shrink-0"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                        {p.designation && <div className="px-1.5 text-[10px] font-normal text-slate-400">{p.designation}</div>}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap min-w-[180px]">
                        {(() => {
                          const blocked = getBlockedSupervisorIds(p.id)
                          return (
                            <div className="space-y-1">
                              <select
                                aria-label={`Department for ${p.name}`}
                                value={p.department_id ?? ''}
                                disabled={isPending}
                                onChange={e => handleChangeDept(p, e.target.value)}
                                className="w-full max-w-[170px] border border-slate-200 hover:border-slate-300 focus:border-teal-500 rounded px-1.5 py-0.5 text-[11px] text-slate-700 bg-white focus:outline-none"
                              >
                                <option value="">Unassigned</option>
                                {departments.map(dep => (
                                  <option key={dep.id} value={dep.id}>{dep.name}</option>
                                ))}
                              </select>
                              <select
                                aria-label={`Supervisor for ${p.name}`}
                                value={p.reports_to_id ?? ''}
                                disabled={isPending}
                                onChange={e => handleChangeSupervisor(p, e.target.value)}
                                className="w-full max-w-[170px] border border-slate-200 hover:border-slate-300 focus:border-teal-500 rounded px-1.5 py-0.5 text-[11px] text-slate-500 bg-white focus:outline-none"
                              >
                                <option value="">No Supervisor</option>
                                {allStaff
                                  .filter(s => !blocked.has(s.id))
                                  .map(s => (
                                    <option key={s.id} value={s.id}>↳ {s.name}</option>
                                  ))}
                              </select>
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-2 py-1.5 max-w-[160px]">
                        <div className="flex flex-wrap gap-1">
                          {allocList.length === 0 ? (
                            <span className="text-[10px] text-slate-400">Home Dept 100%</span>
                          ) : (
                            allocList.map((a, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-medium">
                                {a.name} {a.pct}%
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={d.basic_pay}
                          placeholder="0"
                          onChange={e => updateDraft(p.id, 'basic_pay', e.target.value)}
                          className="w-24 text-right border border-slate-200 rounded px-2 py-1 tabular-nums"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={d.allowance}
                          placeholder="0"
                          onChange={e => updateDraft(p.id, 'allowance', e.target.value)}
                          className="w-20 text-right border border-slate-200 rounded px-2 py-1 tabular-nums"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={d.employer_statutory}
                          placeholder="0"
                          onChange={e => updateDraft(p.id, 'employer_statutory', e.target.value)}
                          className="w-20 text-right border border-slate-200 rounded px-2 py-1 tabular-nums"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={d.deductions}
                          placeholder="0"
                          onChange={e => updateDraft(p.id, 'deductions', e.target.value)}
                          className="w-20 text-right border border-slate-200 rounded px-2 py-1 tabular-nums text-rose-600"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold text-emerald-700 bg-emerald-50/40 tabular-nums whitespace-nowrap">
                        {gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={d.working_days_override}
                          placeholder={String(monthWorkingDays)}
                          onChange={e => updateDraft(p.id, 'working_days_override', e.target.value)}
                          className="w-14 text-right border border-slate-200 rounded px-1.5 py-1 tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-600 tabular-nums whitespace-nowrap">
                        {dayCost.baseCost.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-600 tabular-nums whitespace-nowrap">
                        {dayCost.hourlyRate.toFixed(2)}
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={d.remarks}
                          onChange={e => updateDraft(p.id, 'remarks', e.target.value)}
                          placeholder="Notes..."
                          className="w-28 border border-slate-200 rounded px-2 py-1"
                        />
                      </td>
                    </tr>
                  )
                })}
                {filteredPeople.length === 0 && (
                  <tr>
                    <td colSpan={13} className="text-center py-8 text-slate-400">No records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Daily OT & Attendance Grid */}
      {tab === 'ot' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Type daily OT hours per cell (saves automatically on blur).{' '}
              <span className="inline-block w-2.5 h-2.5 rounded-xs bg-amber-100 border border-amber-300 align-middle mx-1" /> Sunday ({settings.sunday_ot_multiplier}×)
              <span className="inline-block w-2.5 h-2.5 rounded-xs bg-rose-100 border border-rose-300 align-middle mx-1" /> Public Holiday ({settings.holiday_ot_multiplier}×)
            </span>
          </div>
          <div className="overflow-auto max-h-[68vh]">
            <table className="text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 px-2 py-2 text-left whitespace-nowrap w-[96px] min-w-[96px]">ID</th>
                  <th className="sticky left-[96px] top-0 z-30 bg-slate-50 px-2.5 py-2 text-left whitespace-nowrap min-w-[165px] border-r border-slate-200">Name</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-1.5 py-2 text-center whitespace-nowrap">Fill</th>
                  {monthDates.map(dt => {
                    const dType = getDayType(dt, holidaySet)
                    const bg =
                      dType === 'holiday'
                        ? 'bg-rose-100 text-rose-800'
                        : dType === 'sunday'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-50 text-slate-600'
                    return (
                      <th key={dt} className={`sticky top-0 z-20 px-1 py-2 text-center min-w-[44px] ${bg}`} title={dt}>
                        {dt.slice(8, 10)}
                      </th>
                    )
                  })}
                  <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2 text-right whitespace-nowrap text-indigo-800">Total OT(h)</th>
                  <th className="sticky top-0 z-20 bg-amber-50 px-2.5 py-2 text-right whitespace-nowrap text-amber-900">OT RM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.map(p => {
                  const d = drafts[p.id]
                  const gross = grossOfDraft(d)
                  const wDays = Number(d?.working_days_override) > 0 ? Number(d?.working_days_override) : monthWorkingDays
                  let totalOtHours = 0
                  let totalOtRm = 0
                  for (const dt of monthDates) {
                    const row = otMap.get(`${p.id}:${dt}`)
                    const otH = Number(row?.ot_hours ?? 0)
                    totalOtHours += otH
                    const c = calcPersonDayCost({
                      grossPay: gross,
                      workingDays: wDays,
                      standardHours: Number(settings.standard_hours_per_day) || 8,
                      hourlyRateOverride: d?.hourly_rate_override ? Number(d.hourly_rate_override) : null,
                      otHours: otH,
                      dayType: row?.day_type ?? getDayType(dt, holidaySet),
                      isAbsent: row?.is_absent ?? false,
                      multipliers: {
                        normal: Number(settings.normal_ot_multiplier) || 1.5,
                        sunday: Number(settings.sunday_ot_multiplier) || 2.0,
                        holiday: Number(settings.holiday_ot_multiplier) || 3.0,
                      },
                      includeBaseOnSundayHoliday: settings.include_base_on_sunday_holiday,
                    })
                    totalOtRm += c.otCost
                  }

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="sticky left-0 z-10 bg-white px-1.5 py-1 whitespace-nowrap w-[96px] min-w-[96px]">
                        <input
                          type="text"
                          key={`${p.id}:${p.emp_no}`}
                          defaultValue={p.emp_no}
                          aria-label={`${isWorker ? 'Worker' : 'Staff'} ID for ${p.name}`}
                          title="Click to amend ID (Enter or blur to save)"
                          onBlur={e => handleAmendId(p, e.currentTarget)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            } else if (e.key === 'Escape') {
                              e.currentTarget.value = p.emp_no
                              e.currentTarget.blur()
                            }
                          }}
                          className="w-20 font-mono text-[11px] text-slate-700 border border-transparent hover:border-slate-300 focus:border-teal-500 focus:bg-white bg-transparent rounded px-1 py-0.5 focus:outline-none"
                        />
                      </td>
                      <td className="sticky left-[96px] z-10 bg-white px-2 py-1 font-semibold text-slate-900 whitespace-nowrap border-r border-slate-200 min-w-[165px] max-w-[180px]" title={p.name}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate">{p.name}</span>
                          <button
                            type="button"
                            onClick={() => openEditPerson(p)}
                            title="Edit ID, Name, Dept, Supervisor..."
                            className="p-0.5 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 shrink-0"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const raw = prompt(`Fill weekday OT hours for ${p.name} in ${month}:`, '2')
                            if (raw === null) return
                            const val = Number(raw)
                            if (Number.isNaN(val) || val < 0) return
                            runAction(() => bulkFillDailyOt(personType, p.id, month, val), `Filled ${val}h OT for ${p.name}.`)
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-teal-100 text-[10px] font-semibold text-slate-600 hover:text-teal-800"
                          title="Bulk fill normal-day OT hours"
                        >
                          Fill
                        </button>
                      </td>
                      {monthDates.map(dt => {
                        const dType = getDayType(dt, holidaySet)
                        const row = otMap.get(`${p.id}:${dt}`)
                        const otVal = row?.ot_hours ? String(row.ot_hours) : ''
                        const isAbsent = row?.is_absent ?? false
                        const cellBg = isAbsent
                          ? 'bg-rose-100'
                          : dType === 'holiday'
                          ? 'bg-rose-50/60'
                          : dType === 'sunday'
                          ? 'bg-amber-50/60'
                          : ''

                        return (
                          <td key={dt} className={`p-0.5 text-center ${cellBg}`}>
                            {absentMode ? (
                              <button
                                type="button"
                                onClick={() =>
                                  runAction(
                                    () => saveDailyOtCell(personType, p.id, dt, { is_absent: !isAbsent }),
                                    `${p.name} (${dt}) marked ${!isAbsent ? 'Absent' : 'Present'}.`
                                  )
                                }
                                className={`w-10 py-1 rounded text-[10px] font-bold ${
                                  isAbsent ? 'bg-rose-600 text-white' : 'bg-white border border-slate-200 text-slate-400 hover:border-rose-400'
                                }`}
                              >
                                {isAbsent ? 'ABS' : otVal || '·'}
                              </button>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={24}
                                step="0.5"
                                defaultValue={otVal}
                                placeholder={isAbsent ? 'ABS' : ''}
                                onBlur={e => {
                                  const nextVal = Number(e.target.value) || 0
                                  const prevVal = Number(row?.ot_hours ?? 0)
                                  if (nextVal === prevVal) return
                                  runAction(
                                    () => saveDailyOtCell(personType, p.id, dt, { ot_hours: nextVal }),
                                    `Saved OT (${p.name} · ${dt})`
                                  )
                                }}
                                className={`w-10 text-center border rounded py-0.5 tabular-nums ${
                                  isAbsent
                                    ? 'border-rose-400 bg-rose-50 text-rose-700'
                                    : row?.source === 'ot_app_sync'
                                    ? 'border-indigo-300 bg-indigo-50/40'
                                    : 'border-slate-200 bg-white'
                                }`}
                              />
                            )}
                          </td>
                        )
                      })}
                      <td className="px-2.5 py-1 text-right font-bold text-indigo-700 bg-indigo-50/40 tabular-nums whitespace-nowrap">
                        {totalOtHours.toFixed(1)}h
                      </td>
                      <td className="px-2.5 py-1 text-right font-bold text-amber-800 bg-amber-50/40 tabular-nums whitespace-nowrap">
                        {totalOtRm.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Worker / Staff Details Modal */}
      {editingPerson && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditPerson}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-base font-bold text-slate-900">
                Edit {isWorker ? 'Worker' : 'Staff'} Details
              </h2>
              <button type="button" onClick={() => setEditingPerson(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {editError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="block font-semibold text-slate-600">
                {isWorker ? 'Worker' : 'Staff'} ID *
                <input
                  required
                  value={editingPerson.emp_no}
                  onChange={e => setEditingPerson({ ...editingPerson, emp_no: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-normal text-slate-900"
                />
              </label>

              <label className="block font-semibold text-slate-600">
                Name *
                <input
                  required
                  value={editingPerson.name}
                  onChange={e => setEditingPerson({ ...editingPerson, name: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-normal text-slate-900"
                />
              </label>

              <label className="block font-semibold text-slate-600">
                Designation
                <input
                  value={editingPerson.designation}
                  onChange={e => setEditingPerson({ ...editingPerson, designation: e.target.value })}
                  placeholder="e.g. Supervisor / Concretor"
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-normal text-slate-900"
                />
              </label>

              <label className="block font-semibold text-slate-600">
                Status
                <select
                  value={editingPerson.status}
                  onChange={e =>
                    setEditingPerson({
                      ...editingPerson,
                      status: e.target.value as 'Active' | 'Inactive' | 'On Leave',
                    })
                  }
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-normal text-slate-900"
                >
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>

              <label className="block font-semibold text-slate-600">
                Home Department
                <select
                  value={editingPerson.department_id}
                  onChange={e => setEditingPerson({ ...editingPerson, department_id: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-normal text-slate-900"
                >
                  <option value="">Unassigned</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>

              <label className="block font-semibold text-slate-600">
                Supervisor / Reports To
                <select
                  value={editingPerson.reports_to_id}
                  onChange={e => setEditingPerson({ ...editingPerson, reports_to_id: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-normal text-slate-900"
                >
                  <option value="">(None / Top level)</option>
                  {(() => {
                    const blocked = getBlockedSupervisorIds(editingPerson.id)
                    return allStaff
                      .filter(s => !blocked.has(s.id))
                      .map(s => (
                        <option key={s.id} value={s.id}>
                          {s.emp_no ? `${s.name} (${s.emp_no})` : s.name}
                        </option>
                      ))
                  })()}
                </select>
              </label>

              <label className="block sm:col-span-2 font-semibold text-slate-600">
                Remarks
                <input
                  value={editingPerson.remarks}
                  onChange={e => setEditingPerson({ ...editingPerson, remarks: e.target.value })}
                  placeholder="Optional remarks..."
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-normal text-slate-900"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setEditingPerson(null)}
                className="px-4 py-2 rounded-xl border text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Staff Modal (Laily / Admin) */}
      {showAddStaff && !isWorker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={e => {
              e.preventDefault()
              runAction(async () => {
                await saveDlerPerson({
                  person_type: 'STAFF',
                  emp_no: newStaff.emp_no,
                  name: newStaff.name,
                  designation: newStaff.designation || null,
                  department_id: newStaff.department_id ? Number(newStaff.department_id) : null,
                  reports_to_id: newStaff.reports_to_id ? Number(newStaff.reports_to_id) : null,
                  status: 'Active',
                })
                setShowAddStaff(false)
                setNewStaff({ emp_no: '', name: '', designation: '', department_id: '', reports_to_id: '' })
              }, 'Staff member added.')
            }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-base font-bold text-slate-900">Add Staff Member</h2>
              <button type="button" onClick={() => setShowAddStaff(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <label className="block text-xs font-semibold text-slate-600">
              Staff ID *
              <input required value={newStaff.emp_no} onChange={e => setNewStaff({ ...newStaff, emp_no: e.target.value })} placeholder="e.g. STF-101" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Name *
              <input required value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Designation
              <input value={newStaff.designation} onChange={e => setNewStaff({ ...newStaff, designation: e.target.value })} placeholder="e.g. Engineer / HR" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Home Department
              <select value={newStaff.department_id} onChange={e => setNewStaff({ ...newStaff, department_id: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Unassigned</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Reports To
              <select value={newStaff.reports_to_id} onChange={e => setNewStaff({ ...newStaff, reports_to_id: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">(Top level)</option>
                {allStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowAddStaff(false)} className="px-4 py-2 rounded-xl border text-xs font-semibold">Cancel</button>
              <button type="submit" disabled={isPending} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold">Add Staff</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
