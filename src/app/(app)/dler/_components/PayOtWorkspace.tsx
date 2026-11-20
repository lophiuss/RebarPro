'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DollarSign, Clock, ChevronLeft, ChevronRight, Search, Copy, RefreshCw,
  Save, Plus, CheckCircle2, AlertTriangle, X, DownloadCloud, Zap, Pencil,
  Download, Upload, FileSpreadsheet
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
  gross_pay: string
  working_days_override: string
  hourly_rate_override: string
  remarks: string
}

type ImportMatchedRow = {
  person_id: number
  emp_no: string
  name: string
  gross_pay: number
  working_days_override: number | null
  remarks: string | null
}

type ImportParseResult = {
  fileName: string
  sheetName: string
  totalRows: number
  matched: ImportMatchedRow[]
  skippedBlank: number
  duplicateIdsCount: number
  errors: { rowNum: number; ref: string; reason: string }[]
}

function normalizeColKey(k: string): string {
  return k.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function pickColValue(normRow: Record<string, string>, aliases: string[]): string | undefined {
  for (const a of aliases) {
    if (normRow[a] !== undefined) return normRow[a]
  }
  return undefined
}

function parseGrossPayCell(raw: string): { ok: true; value: number | null } | { ok: false; reason: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  const cleaned = trimmed.replace(/^(rm|myr)\s*/i, '').replace(/,/g, '').replace(/\s+/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, reason: `Invalid Gross Pay "${trimmed}"` }
  }
  const num = Number(cleaned)
  if (!Number.isFinite(num)) {
    return { ok: false, reason: `Invalid Gross Pay "${trimmed}"` }
  }
  if (num < 0) {
    return { ok: false, reason: `Gross Pay cannot be negative (${trimmed})` }
  }
  return { ok: true, value: Math.round((num + Number.EPSILON) * 100) / 100 }
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
  const [importModal, setImportModal] = useState<{
    month: string
    parsed: ImportParseResult | null
    parsing: boolean
    error: string | null
  } | null>(null)

  const isWorker = personType === 'WORKER'
  const basePath = isWorker ? '/dler/workers' : '/dler/staff'

  const holidaySet = useMemo(() => new Set(holidays), [holidays])
  const monthDates = useMemo(() => listMonthDates(month), [month])
  const monthWorkingDays = useMemo(
    () => getWorkingDaysInMonth(month, settings.working_days_mode, Number(settings.fixed_working_days), holidaySet),
    [month, settings, holidaySet]
  )

  const deptMap = useMemo(() => new Map(departments.map(d => [d.id, d.name])), [departments])
  const projMap = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects])
  const staffNameMap = useMemo(() => new Map(allStaff.map(s => [s.id, s.name])), [allStaff])

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
      const grossVal = p
        ? Number(p.gross_pay) ||
          Math.max(
            0,
            (Number(p.basic_pay) || 0) +
              (Number(p.allowance) || 0) +
              (Number(p.employer_statutory) || 0) -
              (Number(p.deductions) || 0)
          )
        : 0
      out[person.id] = {
        gross_pay: grossVal ? String(grossVal) : '',
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
    return Math.max(0, Math.round((Number(d.gross_pay) || 0) * 100) / 100)
  }

  function updateDraft(personId: number, field: keyof PayDraft, value: string) {
    setDrafts(prev => ({
      ...prev,
      [personId]: {
        ...(prev[personId] ?? {
          gross_pay: '',
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
        gross_pay: '',
        working_days_override: '',
        hourly_rate_override: '',
        remarks: '',
      }
      return {
        person_id: p.id,
        gross_pay: grossOfDraft(d),
        working_days_override: d.working_days_override ? Number(d.working_days_override) : null,
        hourly_rate_override: d.hourly_rate_override ? Number(d.hourly_rate_override) : null,
        remarks: d.remarks || null,
      }
    })
    runAction(
      () => saveMonthlyPayBatch(month, personType, rows),
      `Saved monthly Gross Pay for ${rows.length} ${isWorker ? 'workers' : 'staff'}.`
    )
  }

  async function handleExportTemplate() {
    setFeedback(null)
    try {
      const XLSX = await import('xlsx')
      const headers = [
        'ID',
        'Name',
        'Department',
        'Supervisor',
        'Gross Pay (RM)',
        'Working Days Override',
        'Remarks',
      ]
      const rows = [...people]
        .sort((a, b) => a.emp_no.localeCompare(b.emp_no))
        .map(p => {
          const d = drafts[p.id]
          const grossVal = d?.gross_pay?.trim()
          const daysVal = d?.working_days_override?.trim()
          return {
            ID: p.emp_no,
            Name: p.name,
            Department: p.department_id ? deptMap.get(p.department_id) ?? '' : '',
            Supervisor: p.reports_to_id ? staffNameMap.get(p.reports_to_id) ?? '' : '',
            'Gross Pay (RM)': grossVal ? Number(grossVal) || 0 : '',
            'Working Days Override': daysVal ? Number(daysVal) || '' : '',
            Remarks: d?.remarks ?? '',
          }
        })

      const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
      ws['!cols'] = [14, 28, 18, 22, 16, 22, 28].map(wch => ({ wch }))

      const infoRows = [
        ['DLER Monthly Pay Template', `${isWorker ? 'Workers' : 'Staff'} (${month})`],
        [],
        ['Instructions:'],
        ['1. Keep the "ID" column unchanged — rows are matched to your DLER roster by ID.'],
        ['2. Fill in "Gross Pay (RM)" using plain numbers (e.g. 2450.50).'],
        ['3. Leave "Gross Pay (RM)" blank to skip updating a person; type 0 explicitly to set RM 0.'],
        [`4. "Working Days Override" is optional (1–31; default for this company is ${monthWorkingDays} days).`],
        ['5. Save as .xlsx or .csv, click "Import by Month", pick the target Month, and upload this file.'],
      ]
      const wsInfo = XLSX.utils.aoa_to_sheet(infoRows)
      wsInfo['!cols'] = [{ wch: 78 }, { wch: 24 }]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Monthly Pay')
      XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions')

      XLSX.writeFile(wb, `DLER_${isWorker ? 'Worker' : 'Staff'}_Pay_Template_${month}.xlsx`)
      setFeedback({
        kind: 'ok',
        text: `Exported ${isWorker ? 'Worker' : 'Staff'} Pay template for ${month} (${rows.length} rows).`,
      })
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err?.message ?? 'Failed to export Excel template' })
    }
  }

  async function handleImportFile(file: File) {
    setImportModal(prev => (prev ? { ...prev, parsing: true, error: null, parsed: null } : null))
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.Sheets['Monthly Pay'] ? 'Monthly Pay' : wb.SheetNames[0]
      if (!sheetName) throw new Error('The uploaded workbook has no sheets.')
      const ws = wb.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: '' })
      if (rawRows.length === 0) throw new Error(`Sheet "${sheetName}" is empty.`)

      const firstNormKeys = new Set(Object.keys(rawRows[0]).map(normalizeColKey))
      const grossAliases = ['gross pay rm', 'gross pay', 'gross', 'gross cost', 'monthly pay', 'salary', 'pay', 'amount']
      const idAliases = ['id', 'emp no', 'emp id', 'worker id', 'staff id', 'employee id', 'worker no']
      const nameAliases = ['name', 'full name', 'worker name', 'staff name']
      const daysAliases = ['working days override', 'working days', 'days']
      const remarkAliases = ['remarks', 'remark', 'notes', 'note']

      if (!grossAliases.some(a => firstNormKeys.has(a))) {
        throw new Error('Could not find a "Gross Pay (RM)" column in the selected sheet.')
      }
      if (!idAliases.some(a => firstNormKeys.has(a)) && !nameAliases.some(a => firstNormKeys.has(a))) {
        throw new Error('Could not find an "ID" or "Name" column in the selected sheet.')
      }

      const personByEmpNo = new Map<string, DlerPerson>()
      const nameCount = new Map<string, number>()
      const personByUniqueName = new Map<string, DlerPerson>()
      for (const p of people) {
        personByEmpNo.set(p.emp_no.trim().toUpperCase(), p)
        const nk = p.name.trim().toLowerCase()
        nameCount.set(nk, (nameCount.get(nk) ?? 0) + 1)
      }
      for (const p of people) {
        const nk = p.name.trim().toLowerCase()
        if (nameCount.get(nk) === 1) personByUniqueName.set(nk, p)
      }

      const matchedById = new Map<number, ImportMatchedRow>()
      const errors: { rowNum: number; ref: string; reason: string }[] = []
      let skippedBlank = 0
      let duplicateIdsCount = 0
      let totalRows = 0

      rawRows.forEach((raw, idx) => {
        const rowNum = idx + 2
        const normRow: Record<string, string> = {}
        for (const [k, v] of Object.entries(raw)) {
          normRow[normalizeColKey(k)] = String(v ?? '').trim()
        }
        if (Object.values(normRow).every(v => !v)) return
        totalRows++

        const idVal = (pickColValue(normRow, idAliases) ?? '').trim()
        const nameVal = (pickColValue(normRow, nameAliases) ?? '').trim()
        const grossRaw = pickColValue(normRow, grossAliases) ?? ''
        const daysRaw = (pickColValue(normRow, daysAliases) ?? '').trim()
        const remarksRaw = (pickColValue(normRow, remarkAliases) ?? '').trim()

        let person: DlerPerson | undefined
        if (idVal) {
          person = personByEmpNo.get(idVal.toUpperCase())
          if (!person) {
            errors.push({ rowNum, ref: idVal, reason: `ID "${idVal}" not found in ${isWorker ? 'Workers' : 'Staff'}` })
            return
          }
        } else if (nameVal) {
          const nk = nameVal.toLowerCase()
          if ((nameCount.get(nk) ?? 0) > 1) {
            errors.push({ rowNum, ref: nameVal, reason: `Multiple people named "${nameVal}" — please fill ID` })
            return
          }
          person = personByUniqueName.get(nk)
          if (!person) {
            errors.push({ rowNum, ref: nameVal, reason: `Name "${nameVal}" not found` })
            return
          }
        } else {
          return
        }

        const parsedGross = parseGrossPayCell(grossRaw)
        if (!parsedGross.ok) {
          errors.push({ rowNum, ref: person.emp_no, reason: parsedGross.reason })
          return
        }
        if (parsedGross.value === null) {
          skippedBlank++
          return
        }

        let workingDaysOverride: number | null = null
        if (daysRaw) {
          const dNum = Number(daysRaw)
          if (!Number.isFinite(dNum) || dNum < 1 || dNum > 31) {
            errors.push({ rowNum, ref: person.emp_no, reason: `Invalid Working Days Override "${daysRaw}" (must be 1–31)` })
            return
          }
          workingDaysOverride = dNum
        }

        if (matchedById.has(person.id)) duplicateIdsCount++
        matchedById.set(person.id, {
          person_id: person.id,
          emp_no: person.emp_no,
          name: person.name,
          gross_pay: parsedGross.value,
          working_days_override: workingDaysOverride,
          remarks: remarksRaw || null,
        })
      })

      setImportModal(prev =>
        prev
          ? {
              ...prev,
              parsing: false,
              parsed: {
                fileName: file.name,
                sheetName,
                totalRows,
                matched: Array.from(matchedById.values()),
                skippedBlank,
                duplicateIdsCount,
                errors,
              },
            }
          : null
      )
    } catch (err: any) {
      setImportModal(prev =>
        prev ? { ...prev, parsing: false, parsed: null, error: err?.message ?? 'Failed to parse file' } : null
      )
    }
  }

  function handleConfirmImport() {
    if (!importModal?.parsed || importModal.parsed.matched.length === 0) return
    const targetMonth = importModal.month
    const rows = importModal.parsed.matched.map(r => ({
      person_id: r.person_id,
      gross_pay: r.gross_pay,
      working_days_override: r.working_days_override,
      remarks: r.remarks,
    }))
    setFeedback(null)
    startTransition(async () => {
      try {
        await saveMonthlyPayBatch(targetMonth, personType, rows)
        setImportModal(null)
        setFeedback({
          kind: 'ok',
          text: `Imported ${rows.length} ${isWorker ? 'worker' : 'staff'} Gross Pay row(s) into ${targetMonth}.`,
        })
        if (targetMonth !== month) {
          router.push(`${basePath}?month=${targetMonth}`)
        } else {
          router.refresh()
        }
      } catch (err: any) {
        const msg = err?.message ?? 'Import failed'
        setImportModal(prev => (prev ? { ...prev, error: msg } : null))
        setFeedback({ kind: 'err', text: msg })
      }
    })
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
                onClick={handleExportTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200"
                title="Download Excel template pre-filled with current roster"
              >
                <Download className="w-3.5 h-3.5" /> Export Template
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setImportModal({ month, parsed: null, parsing: false, error: null })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold border border-sky-200"
                title="Import monthly Gross Pay from Excel / CSV"
              >
                <Upload className="w-3.5 h-3.5" /> Import by Month
              </button>
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
            <table className="w-full min-w-[1260px] text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 px-2.5 py-2.5 text-left whitespace-nowrap w-[108px] min-w-[108px] max-w-[108px] border-r border-slate-200">ID</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2.5 text-left whitespace-nowrap w-[210px] min-w-[210px]">Name</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-left whitespace-nowrap w-[155px] min-w-[155px] max-w-[155px]">Department</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-left whitespace-nowrap w-[170px] min-w-[170px] max-w-[170px]">Supervisor</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2.5 text-left whitespace-nowrap min-w-[170px] max-w-[220px]">Project %</th>
                  <th className="sticky top-0 z-20 bg-emerald-50 px-3 py-2.5 text-right whitespace-nowrap text-emerald-800 min-w-[130px]">Gross Pay (RM)</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap min-w-[72px]">Days</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap min-w-[82px]">RM/Day</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-right whitespace-nowrap min-w-[76px]">RM/Hr</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-2 py-2.5 text-left whitespace-nowrap min-w-[140px]">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.map(p => {
                  const d = drafts[p.id] ?? {
                    gross_pay: '',
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
                  const blocked = getBlockedSupervisorIds(p.id)

                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/70 ${p.status === 'Inactive' ? 'opacity-50' : ''}`}>
                      <td className="sticky left-0 z-10 bg-white px-2 py-1.5 whitespace-nowrap w-[108px] min-w-[108px] max-w-[108px] border-r border-slate-200">
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
                          className="w-full font-mono text-xs text-slate-700 border border-transparent hover:border-slate-300 focus:border-teal-500 focus:bg-white bg-transparent rounded px-1.5 py-0.5 focus:outline-none"
                        />
                      </td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap w-[210px] min-w-[210px]">
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
                        {p.designation && <div className="px-1.5 text-[10px] font-normal text-slate-400 truncate max-w-[190px]">{p.designation}</div>}
                      </td>
                      <td className="px-2 py-1.5 w-[155px] min-w-[155px] max-w-[155px]">
                        <select
                          aria-label={`Department for ${p.name}`}
                          value={p.department_id ?? ''}
                          disabled={isPending}
                          onChange={e => handleChangeDept(p, e.target.value)}
                          className="block w-full truncate border border-slate-200 hover:border-slate-300 focus:border-teal-500 rounded px-2 py-1 text-[11px] text-slate-700 bg-white focus:outline-none"
                        >
                          <option value="">Unassigned</option>
                          {departments.map(dep => (
                            <option key={dep.id} value={dep.id}>{dep.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 w-[170px] min-w-[170px] max-w-[170px]">
                        <select
                          aria-label={`Supervisor for ${p.name}`}
                          value={p.reports_to_id ?? ''}
                          disabled={isPending}
                          onChange={e => handleChangeSupervisor(p, e.target.value)}
                          className="block w-full truncate border border-slate-200 hover:border-slate-300 focus:border-teal-500 rounded px-2 py-1 text-[11px] text-slate-600 bg-white focus:outline-none"
                        >
                          <option value="">No Supervisor</option>
                          {allStaff
                            .filter(s => !blocked.has(s.id))
                            .map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                      </td>
                      <td className="px-2.5 py-1.5 min-w-[170px] max-w-[220px] whitespace-normal align-top">
                        <div className="flex flex-wrap gap-1">
                          {allocList.length === 0 ? (
                            <span className="text-[10px] text-slate-400">Home Dept 100%</span>
                          ) : (
                            allocList.map((a, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-medium whitespace-nowrap">
                                {a.name} {a.pct}%
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right bg-emerald-50/30 min-w-[130px]">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={d.gross_pay}
                          placeholder="0.00"
                          onChange={e => updateDraft(p.id, 'gross_pay', e.target.value)}
                          className="w-28 text-right border border-emerald-200 focus:border-emerald-500 bg-white rounded px-2 py-1 font-semibold text-emerald-900 tabular-nums focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-1.5 text-right min-w-[72px]">
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
                      <td className="px-2 py-1.5 text-right text-slate-600 tabular-nums whitespace-nowrap min-w-[82px]">
                        {dayCost.baseCost.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-600 tabular-nums whitespace-nowrap min-w-[76px]">
                        {dayCost.hourlyRate.toFixed(2)}
                      </td>
                      <td className="px-1.5 py-1.5 min-w-[140px]">
                        <input
                          type="text"
                          value={d.remarks}
                          onChange={e => updateDraft(p.id, 'remarks', e.target.value)}
                          placeholder="Notes..."
                          className="w-full min-w-[120px] border border-slate-200 rounded px-2 py-1"
                        />
                      </td>
                    </tr>
                  )
                })}
                {filteredPeople.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-slate-400">No records found.</td>
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

      {/* Import Monthly Gross Pay Modal */}
      {importModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                Import {isWorker ? 'Worker' : 'Staff'} Monthly Gross Pay by Month
              </div>
              <button
                type="button"
                disabled={isPending || importModal.parsing}
                onClick={() => setImportModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block font-semibold text-slate-700">
                  Target Month *
                  <input
                    type="month"
                    value={importModal.month}
                    disabled={isPending || importModal.parsing}
                    onChange={e =>
                      e.target.value &&
                      setImportModal(prev => (prev ? { ...prev, month: e.target.value } : null))
                    }
                    className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 bg-white"
                  />
                </label>

                <label className="block font-semibold text-slate-700">
                  Upload Excel / CSV File (.xlsx, .xls, .csv) *
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    disabled={isPending || importModal.parsing}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleImportFile(f)
                    }}
                    className="mt-1 w-full text-xs text-slate-600 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                <span>
                  Matches by <b>ID</b> (or unique Name if ID is blank). Blank <b>Gross Pay (RM)</b> rows are skipped.
                </span>
                <button
                  type="button"
                  onClick={handleExportTemplate}
                  className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline shrink-0"
                >
                  <Download className="w-3 h-3" /> Download Template
                </button>
              </div>

              {importModal.parsing && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sky-800 font-medium">
                  Reading workbook…
                </div>
              )}

              {importModal.error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-800 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importModal.error}</span>
                </div>
              )}

              {importModal.parsed && (() => {
                const parsed = importModal.parsed
                const importTotal = parsed.matched.reduce((s, r) => s + r.gross_pay, 0)
                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                        Matched: {parsed.matched.length} row(s)
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-800 font-semibold tabular-nums">
                        Total Gross: RM {importTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {parsed.skippedBlank > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-semibold">
                          Blank skipped: {parsed.skippedBlank}
                        </span>
                      )}
                      {parsed.duplicateIdsCount > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                          Duplicate IDs (last row used): {parsed.duplicateIdsCount}
                        </span>
                      )}
                      {parsed.errors.length > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                          Skipped issues: {parsed.errors.length}
                        </span>
                      )}
                    </div>

                    {parsed.errors.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 max-h-28 overflow-y-auto space-y-1 text-[11px] text-amber-900">
                        {parsed.errors.map((err, i) => (
                          <div key={i}>
                            Row {err.rowNum} ({err.ref}): {err.reason}
                          </div>
                        ))}
                      </div>
                    )}

                    {parsed.matched.length > 0 ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                        <table className="w-full text-[11px] border-collapse">
                          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                            <tr>
                              <th className="px-3 py-1.5 text-left">ID</th>
                              <th className="px-3 py-1.5 text-left">Name</th>
                              <th className="px-3 py-1.5 text-right">Gross Pay (RM)</th>
                              <th className="px-3 py-1.5 text-right">Days</th>
                              <th className="px-3 py-1.5 text-left">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {parsed.matched.map(r => (
                              <tr key={r.person_id} className="hover:bg-slate-50/60">
                                <td className="px-3 py-1 font-mono text-slate-600">{r.emp_no}</td>
                                <td className="px-3 py-1 font-semibold text-slate-900">{r.name}</td>
                                <td className="px-3 py-1 text-right font-bold text-emerald-700 tabular-nums">
                                  {r.gross_pay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-3 py-1 text-right text-slate-600 tabular-nums">
                                  {r.working_days_override ?? '—'}
                                </td>
                                <td className="px-3 py-1 text-slate-500 truncate max-w-[140px]">{r.remarks ?? ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        No valid rows with Gross Pay found to import.
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setImportModal(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || importModal.parsing || !importModal.parsed || importModal.parsed.matched.length === 0}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {isPending
                  ? 'Importing…'
                  : `Import ${importModal.parsed?.matched.length ?? 0} Row(s) into ${importModal.month}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
