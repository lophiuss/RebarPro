'use client'

import React, { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Boxes, Calendar, ChevronLeft, ChevronRight, Save, CheckCircle2, AlertTriangle, X, CloudCog, RefreshCw,
} from 'lucide-react'
import { daysInMonth, listMonthDates, type DlerDailyM3, type DlerDepartment, type DlerProject } from '@/lib/dler-math'
import { saveDailyM3Batch, syncM3FromCastcore } from '../actions'

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

function formatM3(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function deptAccent(name: string): {
  card: string
  label: string
  badge: string
  groupHeader: string
  subtotalBg: string
  subtotalText: string
} {
  const lower = name.trim().toLowerCase()
  if (lower === 'building') {
    return {
      card: 'border-indigo-200 bg-indigo-50/50',
      label: 'text-indigo-700',
      badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      groupHeader: 'bg-indigo-50/90 text-indigo-900',
      subtotalBg: 'bg-indigo-50',
      subtotalText: 'text-indigo-950',
    }
  }
  if (lower === 'tunnel') {
    return {
      card: 'border-teal-200 bg-teal-50/50',
      label: 'text-teal-700',
      badge: 'bg-teal-100 text-teal-800 border-teal-200',
      groupHeader: 'bg-teal-50/90 text-teal-900',
      subtotalBg: 'bg-teal-50',
      subtotalText: 'text-teal-950',
    }
  }
  if (lower === 'sbg') {
    return {
      card: 'border-amber-200 bg-amber-50/50',
      label: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      groupHeader: 'bg-amber-50/90 text-amber-900',
      subtotalBg: 'bg-amber-50',
      subtotalText: 'text-amber-950',
    }
  }
  return {
    card: 'border-slate-200 bg-slate-50/70',
    label: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    groupHeader: 'bg-slate-100 text-slate-800',
    subtotalBg: 'bg-slate-100',
    subtotalText: 'text-slate-900',
  }
}

export default function M3InputClient({
  month,
  selectedDate,
  departments,
  projects,
  entries,
  castcoreConfigured,
}: {
  month: string
  selectedDate: string
  departments: DlerDepartment[]
  projects: DlerProject[]
  entries: DlerDailyM3[]
  castcoreConfigured: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'daily' | 'matrix'>('daily')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null)

  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [syncRangeMode, setSyncRangeMode] = useState<'month' | 'day' | '7days'>('month')
  const [overwriteManual, setOverwriteManual] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const monthDates = useMemo(() => listMonthDates(month), [month])
  const productionDepts = useMemo(() => departments.filter(d => d.kind === 'production'), [departments])
  const deptMap = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])

  const entryMap = useMemo(() => {
    const m = new Map<string, DlerDailyM3>()
    for (const e of entries) m.set(e.entry_key, e)
    return m
  }, [entries])

  const { savedSyncedCount, lastSyncedLabel } = useMemo(() => {
    let cnt = 0
    let latestIso = ''
    for (const e of entries) {
      if (e.source === 'erp_sync') {
        if (Number(e.m3_volume) > 0) cnt++
        if (e.updated_at && e.updated_at > latestIso) latestIso = e.updated_at
      }
    }
    let label: string | null = null
    if (latestIso) {
      const dt = new Date(latestIso)
      if (!Number.isNaN(dt.getTime())) {
        label = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kuala_Lumpur',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(dt)
      }
    }
    return { savedSyncedCount: cnt, lastSyncedLabel: label }
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

  const dailyDeptSummary = useMemo(() => {
    const totalsByDeptKey = new Map<string, number>()
    for (const p of projects) {
      const val = Number(dailyDrafts[`project:${p.id}`]?.val) || 0
      const key = p.department_id != null ? `dept-${p.department_id}` : 'unassigned'
      totalsByDeptKey.set(key, (totalsByDeptKey.get(key) ?? 0) + val)
    }
    for (const dep of productionDepts) {
      const val = Number(dailyDrafts[`department:${dep.id}`]?.val) || 0
      if (val > 0 || totalsByDeptKey.has(`dept-${dep.id}`)) {
        totalsByDeptKey.set(`dept-${dep.id}`, (totalsByDeptKey.get(`dept-${dep.id}`) ?? 0) + val)
      }
    }
    const items: { key: string; name: string; total: number }[] = []
    for (const dep of departments) {
      const k = `dept-${dep.id}`
      if (totalsByDeptKey.has(k)) {
        items.push({ key: k, name: dep.name, total: Math.round((totalsByDeptKey.get(k) ?? 0) * 10000) / 10000 })
      }
    }
    if (totalsByDeptKey.has('unassigned')) {
      items.push({
        key: 'unassigned',
        name: 'Unassigned',
        total: Math.round((totalsByDeptKey.get('unassigned') ?? 0) * 10000) / 10000,
      })
    }
    return items
  }, [dailyDrafts, projects, departments, productionDepts])

  const matrixSummary = useMemo(() => {
    type MatrixGroup = {
      key: string
      deptId: number | null
      name: string
      projects: DlerProject[]
      hasDirectM3: boolean
      directDailyTotals: Record<string, number>
      dailyTotals: Record<string, number>
      monthTotal: number
    }

    const projsByDept = new Map<number | null, DlerProject[]>()
    for (const p of projects) {
      const k = p.department_id ?? null
      const arr = projsByDept.get(k) ?? []
      arr.push(p)
      projsByDept.set(k, arr)
    }

    const groups: MatrixGroup[] = []

    const pushGroup = (key: string, deptId: number | null, name: string, groupProjects: DlerProject[]) => {
      const directDailyTotals: Record<string, number> = {}
      const dailyTotals: Record<string, number> = {}
      let hasDirectM3 = false
      let monthTotal = 0

      for (const dt of monthDates) {
        let daySum = 0
        for (const p of groupProjects) {
          daySum += Number(entryMap.get(`project:${dt}:${p.id}`)?.m3_volume) || 0
        }
        const directVal =
          deptId != null ? Number(entryMap.get(`department:${dt}:${deptId}`)?.m3_volume) || 0 : 0
        if (directVal > 0) hasDirectM3 = true
        directDailyTotals[dt] = directVal
        const total = Math.round((daySum + directVal) * 10000) / 10000
        dailyTotals[dt] = total
        monthTotal += total
      }

      groups.push({
        key,
        deptId,
        name,
        projects: groupProjects,
        hasDirectM3,
        directDailyTotals,
        dailyTotals,
        monthTotal: Math.round(monthTotal * 10000) / 10000,
      })
    }

    for (const dep of departments) {
      const groupProjects = projsByDept.get(dep.id) ?? []
      const hasAnyDirect = monthDates.some(
        dt => (Number(entryMap.get(`department:${dt}:${dep.id}`)?.m3_volume) || 0) > 0
      )
      if (groupProjects.length > 0 || hasAnyDirect) {
        pushGroup(`dept-${dep.id}`, dep.id, dep.name, groupProjects)
      }
    }

    const unassignedProjects = projsByDept.get(null) ?? []
    if (unassignedProjects.length > 0) {
      pushGroup('unassigned', null, 'Unassigned', unassignedProjects)
    }

    const overallDailyTotals: Record<string, number> = {}
    let overallMonthTotal = 0
    for (const dt of monthDates) {
      let dtSum = 0
      for (const g of groups) {
        dtSum += g.dailyTotals[dt] ?? 0
      }
      overallDailyTotals[dt] = Math.round(dtSum * 10000) / 10000
      overallMonthTotal += dtSum
    }

    return {
      groups,
      overallDailyTotals,
      overallMonthTotal: Math.round(overallMonthTotal * 10000) / 10000,
    }
  }, [departments, projects, monthDates, entryMap])

  function saveDaily() {
    setFeedback(null)
    const batch: Parameters<typeof saveDailyM3Batch>[0] = []
    for (const p of projects) {
      const d = dailyDrafts[`project:${p.id}`]
      const nextVol = Number(d?.val) || 0
      const nextRemarks = d?.remarks?.trim() || null
      const existing = entryMap.get(`project:${selectedDate}:${p.id}`)
      const prevVol = existing ? Number(existing.m3_volume) || 0 : 0
      const prevRemarks = existing?.remarks?.trim() || null
      if (existing ? nextVol !== prevVol || nextRemarks !== prevRemarks : nextVol !== 0 || nextRemarks !== null) {
        batch.push({
          entry_date: selectedDate,
          target_type: 'project',
          project_id: p.id,
          m3_volume: nextVol,
          remarks: nextRemarks,
        })
      }
    }
    for (const dep of productionDepts) {
      const d = dailyDrafts[`department:${dep.id}`]
      const nextVol = Number(d?.val) || 0
      const nextRemarks = d?.remarks?.trim() || null
      const existing = entryMap.get(`department:${selectedDate}:${dep.id}`)
      const prevVol = existing ? Number(existing.m3_volume) || 0 : 0
      const prevRemarks = existing?.remarks?.trim() || null
      if (existing ? nextVol !== prevVol || nextRemarks !== prevRemarks : nextVol !== 0 || nextRemarks !== null) {
        batch.push({
          entry_date: selectedDate,
          target_type: 'department',
          department_id: dep.id,
          m3_volume: nextVol,
          remarks: nextRemarks,
        })
      }
    }

    if (batch.length === 0) {
      setFeedback({ kind: 'ok', text: 'No changes to save.' })
      return
    }

    startTransition(async () => {
      try {
        await saveDailyM3Batch(batch)
        setFeedback({ kind: 'ok', text: `Saved ${batch.length} updated m³ row(s) for ${selectedDate}.` })
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

  function getSyncRange(): { startDate: string; endDate: string } {
    if (syncRangeMode === 'day') {
      return { startDate: selectedDate, endDate: selectedDate }
    }
    if (syncRangeMode === '7days') {
      return { startDate: shiftDate(selectedDate, -6), endDate: selectedDate }
    }
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
    return { startDate: `${month}-01`, endDate: monthEnd }
  }

  async function handleRunCastcoreSync() {
    const { startDate, endDate } = getSyncRange()
    setFeedback(null)
    setSyncError(null)
    setSyncing(true)
    try {
      const res = await syncM3FromCastcore({
        startDate,
        endDate,
        overwriteManual,
      })
      const totalCastStr = res.totalCastM3Synced.toLocaleString(undefined, { maximumFractionDigits: 2 })
      const parts: string[] = []
      if (res.upsertedRows === 0 && res.unchangedRows > 0) {
        parts.push(
          `Already up to date in Supabase (${res.startDate} to ${res.endDate}) · ${res.unchangedRows} cell(s) unchanged (${totalCastStr} m³ cast across ${res.matchedProjects} project(s))`
        )
      } else if (res.upsertedRows > 0) {
        const diffBits: string[] = []
        if (res.insertedRows > 0) diffBits.push(`${res.insertedRows} new`)
        if (res.updatedRows > 0) diffBits.push(`${res.updatedRows} updated`)
        if (res.zeroClearedRows > 0) diffBits.push(`${res.zeroClearedRows} cleared`)
        if (res.unchangedRows > 0) diffBits.push(`${res.unchangedRows} unchanged`)
        parts.push(
          `Saved to Supabase (${res.startDate} to ${res.endDate}): ${diffBits.join(', ')} (${totalCastStr} m³ cast across ${res.matchedProjects} project(s))`
        )
      } else {
        parts.push(
          `Castcore sync (${res.startDate} to ${res.endDate}): 0 cells changed (${totalCastStr} m³ across ${res.matchedProjects} matched project(s))`
        )
      }
      if (res.skippedManualRows > 0) parts.push(`${res.skippedManualRows} manual cell(s) skipped`)
      if (res.unmappedWithVolume.length > 0) {
        parts.push(
          `Unmapped with cast m³: ${res.unmappedWithVolume
            .map(u => `${u.code} (${u.totalCastM3.toFixed(2)} m³)`)
            .join(', ')}`
        )
      }
      if (res.upsertedRows === 0 && res.unchangedRows === 0 && res.skippedManualRows === 0 && !res.partial) {
        parts.push(
          `No non-zero casting records found in Castcore for ${res.startDate} to ${res.endDate} — try Full Month or Last 7 Days.`
        )
      }
      if (res.partial) {
        const errNote =
          res.partialProjects.length > 0
            ? res.partialProjects.map(pp => `${pp.code}: ${pp.error}`).join('; ')
            : 'Partial response from Castcore — affected projects skipped; retry later.'
        parts.push(`Partial warning: ${errNote}`)
      }
      setFeedback({ kind: res.partial ? 'warn' : 'ok', text: parts.join(' · ') })
      setSyncModalOpen(false)
      router.refresh()
    } catch (err: any) {
      setSyncError(err?.message ?? 'Castcore sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const previewRange = getSyncRange()

  return (
    <div className={`max-w-[1600px] mx-auto p-4 md:p-6 space-y-5 transition-opacity ${isPending ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Boxes className="w-6 h-6 text-sky-600" />
              Daily m³ Volume Input (David)
            </h1>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                castcoreConfigured
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <CloudCog className="w-3 h-3" />
              {castcoreConfigured ? 'Castcore Sync Connected' : 'Castcore Env Missing'}
            </span>
            {savedSyncedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                Saved in DB: {savedSyncedCount} cell(s){lastSyncedLabel ? ` · ${lastSyncedLabel} MYT` : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter or sync daily precast casting volume (m³) per project &amp; production department.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={syncing || isPending}
            onClick={() => {
              if (!castcoreConfigured) {
                setFeedback({
                  kind: 'err',
                  text: 'Castcore API is not configured on this server (missing CASTCORE_API_HOST / CASTCORE_API_KEY env vars).',
                })
                return
              }
              setSyncError(null)
              setSyncModalOpen(true)
            }}
            title={
              castcoreConfigured
                ? 'Pull daily Casting Volume (m³) from Castcore Production Summary API'
                : 'Set CASTCORE_API_HOST and CASTCORE_API_KEY in server env vars'
            }
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-semibold shadow-xs disabled:opacity-50 ${
              castcoreConfigured ? 'bg-teal-600 hover:bg-teal-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync from Castcore'}
          </button>

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
              : feedback.kind === 'warn'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </span>
          <button onClick={() => setFeedback(null)} className="shrink-0 ml-2"><X className="w-4 h-4" /></button>
        </div>
      )}

      {mode === 'daily' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-bold text-slate-900">
                Date: {selectedDate} · Total Output:{' '}
                <span className="text-sky-700">{formatM3(dailyTotal)} m³</span>
              </div>
              {dailyDeptSummary.map(item => {
                const ac = deptAccent(item.name)
                return (
                  <span
                    key={item.key}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border tabular-nums ${ac.badge}`}
                  >
                    {item.name}: {formatM3(item.total)} m³
                  </span>
                )
              })}
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
                  const existing = entryMap.get(`project:${selectedDate}:${p.id}`)
                  const d = dailyDrafts[key] ?? { val: '', remarks: '' }
                  const deptName = p.department_id ? deptMap.get(p.department_id)?.name : 'Unassigned'
                  return (
                    <tr key={key} className="hover:bg-sky-50/30">
                      <td className="px-4 py-2 font-semibold text-slate-900">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{p.name}</span>
                          {p.erp_code ? (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {p.erp_code}
                            </span>
                          ) : (
                            <span className="text-[10px] font-normal text-slate-400 italic">Unmapped</span>
                          )}
                          {existing?.source === 'erp_sync' ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-semibold">
                              Castcore
                            </span>
                          ) : existing?.source === 'manual' ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                              Manual
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-500">{deptName}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={d.val}
                          placeholder="0.0"
                          onChange={e => {
                            const v = e.target.value
                            if (v === '' || /^\d*\.?\d*$/.test(v)) {
                              setDailyDrafts(prev => ({ ...prev, [key]: { ...d, val: v } }))
                            }
                          }}
                          className={`w-28 text-right border rounded-lg px-2.5 py-1.5 font-semibold tabular-nums ${
                            existing?.source === 'erp_sync' ? 'border-sky-300 bg-sky-50/40' : 'border-slate-300'
                          }`}
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
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={d.val}
                          placeholder="0.0"
                          onChange={e => {
                            const v = e.target.value
                            if (v === '' || /^\d*\.?\d*$/.test(v)) {
                              setDailyDrafts(prev => ({ ...prev, [key]: { ...d, val: v } }))
                            }
                          }}
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
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Click any cell to edit daily m³ for {month} (saves automatically when leaving the field).</span>
            <span className="inline-flex flex-wrap items-center gap-2 text-[11px]">
              {savedSyncedCount > 0 && (
                <span>
                  Saved in DB: <b>{savedSyncedCount}</b> synced cell(s){lastSyncedLabel ? ` (${lastSyncedLabel} MYT)` : ''} ·
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded bg-sky-50 border border-sky-200 align-middle" /> Castcore Synced
              </span>
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 px-4 py-3 border-b border-slate-200 bg-white">
            {matrixSummary.groups.map(g => {
              const ac = deptAccent(g.name)
              const pct =
                matrixSummary.overallMonthTotal > 0
                  ? ((g.monthTotal / matrixSummary.overallMonthTotal) * 100).toFixed(1)
                  : null
              return (
                <div key={g.key} className={`rounded-xl border px-3.5 py-2.5 ${ac.card}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-bold uppercase tracking-wider truncate ${ac.label}`}>
                      {g.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium shrink-0">
                      {g.projects.length} proj
                    </span>
                  </div>
                  <div className="mt-1 text-base font-extrabold text-slate-900 tabular-nums">
                    {formatM3(g.monthTotal)} m³
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                    {pct ? `${pct}% of total` : 'No output'}
                  </div>
                </div>
              )
            })}
            <div className="rounded-xl border border-slate-900 bg-slate-900 text-white px-3.5 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Overall Total ({month})
              </div>
              <div className="mt-1 text-base font-extrabold tabular-nums">
                {formatM3(matrixSummary.overallMonthTotal)} m³
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                {matrixSummary.groups.length} group(s) · {projects.length} projects
              </div>
            </div>
          </div>

          <div className="overflow-auto max-h-[68vh]">
            <table className="text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 px-3 py-2 text-left whitespace-nowrap min-w-[180px] border-r border-slate-200">
                    Project / Dept
                  </th>
                  {monthDates.map(dt => (
                    <th key={dt} className="sticky top-0 z-20 bg-slate-50 px-1 py-2 text-center min-w-[48px]" title={dt}>
                      {dt.slice(8, 10)}
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-sky-50 px-3 py-2 text-right whitespace-nowrap text-sky-800">Total m³</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrixSummary.groups.map(g => {
                  const ac = deptAccent(g.name)
                  const directMonthSum = g.deptId != null
                    ? monthDates.reduce((s, dt) => s + (g.directDailyTotals[dt] ?? 0), 0)
                    : 0
                  return (
                    <React.Fragment key={g.key}>
                      <tr className="border-t border-slate-200">
                        <td
                          className={`sticky left-0 z-10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap border-r border-slate-200 ${ac.groupHeader}`}
                        >
                          {g.name} ({g.projects.length})
                        </td>
                        <td colSpan={monthDates.length + 1} className={ac.groupHeader} />
                      </tr>

                      {g.projects.map(p => {
                        const rowSum = monthDates.reduce(
                          (s, dt) => s + (Number(entryMap.get(`project:${dt}:${p.id}`)?.m3_volume) || 0),
                          0
                        )
                        return (
                          <tr key={`p-${p.id}`} className="hover:bg-slate-50/70">
                            <td className="sticky left-0 z-10 bg-white px-3 py-1 font-semibold text-slate-900 whitespace-nowrap border-r border-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span>{p.name}</span>
                                {p.erp_code ? (
                                  <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                    {p.erp_code}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-normal text-slate-400 italic">Unmapped</span>
                                )}
                              </div>
                            </td>
                            {monthDates.map(dt => {
                              const existing = entryMap.get(`project:${dt}:${p.id}`)
                              const v = existing?.m3_volume ? String(existing.m3_volume) : ''
                              return (
                                <td key={dt} className="p-0.5 text-center">
                                  <input
                                    key={`m3-${p.id}-${dt}-${v}-${existing?.source ?? ''}`}
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    defaultValue={v}
                                    title={
                                      existing?.source === 'erp_sync'
                                        ? 'Synced from Castcore (edit to override manually)'
                                        : existing?.source === 'manual'
                                        ? 'Manual entry'
                                        : undefined
                                    }
                                    onChange={e => {
                                      const cleaned = e.currentTarget.value.replace(/[^0-9.]/g, '')
                                      if (cleaned !== e.currentTarget.value) e.currentTarget.value = cleaned
                                    }}
                                    onBlur={e => {
                                      const raw = e.currentTarget.value.trim()
                                      if (raw !== '' && !/^\d*(\.\d+)?$/.test(raw)) {
                                        e.currentTarget.value = v
                                        return
                                      }
                                      const next = raw === '' ? 0 : Number(raw)
                                      const prev = Number(existing?.m3_volume ?? 0)
                                      if (next !== prev) saveMatrixCell('project', p.id, dt, next)
                                    }}
                                    className={`w-12 text-center border rounded py-0.5 tabular-nums ${
                                      existing?.source === 'erp_sync'
                                        ? 'bg-sky-50/50 border-sky-200 text-sky-900'
                                        : 'border-slate-200'
                                    }`}
                                  />
                                </td>
                              )
                            })}
                            <td className="px-3 py-1 text-right font-bold text-sky-700 bg-sky-50/40 tabular-nums whitespace-nowrap">
                              {formatM3(rowSum)}
                            </td>
                          </tr>
                        )
                      })}

                      {g.deptId != null && g.hasDirectM3 && (
                        <tr className="hover:bg-slate-50/70">
                          <td className="sticky left-0 z-10 bg-white px-3 py-1 font-semibold text-slate-700 whitespace-nowrap border-r border-slate-200">
                            {g.name} (Direct)
                          </td>
                          {monthDates.map(dt => {
                            const existing = entryMap.get(`department:${dt}:${g.deptId}`)
                            const v = existing?.m3_volume ? String(existing.m3_volume) : ''
                            return (
                              <td key={dt} className="p-0.5 text-center">
                                <input
                                  key={`m3-dept-${g.deptId}-${dt}-${v}-${existing?.source ?? ''}`}
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  defaultValue={v}
                                  onChange={e => {
                                    const cleaned = e.currentTarget.value.replace(/[^0-9.]/g, '')
                                    if (cleaned !== e.currentTarget.value) e.currentTarget.value = cleaned
                                  }}
                                  onBlur={e => {
                                    const raw = e.currentTarget.value.trim()
                                    if (raw !== '' && !/^\d*(\.\d+)?$/.test(raw)) {
                                      e.currentTarget.value = v
                                      return
                                    }
                                    const next = raw === '' ? 0 : Number(raw)
                                    const prev = Number(existing?.m3_volume ?? 0)
                                    if (next !== prev) saveMatrixCell('department', g.deptId!, dt, next)
                                  }}
                                  className="w-12 text-center border border-slate-200 rounded py-0.5 tabular-nums"
                                />
                              </td>
                            )
                          })}
                          <td className="px-3 py-1 text-right font-bold text-sky-700 bg-sky-50/40 tabular-nums whitespace-nowrap">
                            {formatM3(directMonthSum)}
                          </td>
                        </tr>
                      )}

                      <tr className="border-t border-b border-slate-200 font-bold">
                        <td
                          className={`sticky left-0 z-10 px-3 py-1.5 whitespace-nowrap border-r border-slate-200 ${ac.subtotalBg} ${ac.subtotalText}`}
                        >
                          {g.name} Total
                        </td>
                        {monthDates.map(dt => {
                          const daySum = g.dailyTotals[dt] ?? 0
                          return (
                            <td
                              key={dt}
                              className={`px-1 py-1.5 text-center tabular-nums ${ac.subtotalBg} ${ac.subtotalText}`}
                            >
                              {daySum > 0 ? formatM3(daySum) : '—'}
                            </td>
                          )
                        })}
                        <td
                          className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${ac.subtotalBg} ${ac.subtotalText}`}
                        >
                          {formatM3(g.monthTotal)}
                        </td>
                      </tr>
                    </React.Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 bottom-0 z-30 bg-slate-900 text-white font-bold px-3 py-2 whitespace-nowrap border-r border-slate-700">
                    Overall Total
                  </td>
                  {monthDates.map(dt => {
                    const dayTotal = matrixSummary.overallDailyTotals[dt] ?? 0
                    return (
                      <td
                        key={dt}
                        className="sticky bottom-0 z-20 bg-slate-900 text-slate-100 text-center font-semibold tabular-nums px-1 py-2"
                      >
                        {dayTotal > 0 ? formatM3(dayTotal) : '—'}
                      </td>
                    )
                  })}
                  <td className="sticky bottom-0 z-20 bg-sky-700 text-white text-right font-extrabold tabular-nums px-3 py-2 whitespace-nowrap">
                    {formatM3(matrixSummary.overallMonthTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {syncModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <RefreshCw className="w-4 h-4 text-teal-600" />
                Sync Casting m³ from Castcore
              </div>
              <button
                type="button"
                disabled={syncing}
                onClick={() => setSyncModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {syncError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{syncError}</span>
                </div>
              )}

              <div>
                <div className="font-semibold text-slate-700 mb-1.5">Date Range (max 31 days per request)</div>
                <div className="space-y-2">
                  {[
                    {
                      value: 'month' as const,
                      title: `Full Month (${month})`,
                      desc: `${month}-01 to ${month}-${String(daysInMonth(month)).padStart(2, '0')}`,
                    },
                    {
                      value: 'day' as const,
                      title: `Selected Date (${selectedDate})`,
                      desc: `Single day sync for ${selectedDate}`,
                    },
                    {
                      value: '7days' as const,
                      title: 'Last 7 Days',
                      desc: `${shiftDate(selectedDate, -6)} to ${selectedDate}`,
                    },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={syncing}
                      onClick={() => setSyncRangeMode(opt.value)}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition ${
                        syncRangeMode === opt.value
                          ? 'border-teal-500 bg-teal-50/70 text-teal-950'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-semibold">{opt.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  disabled={syncing}
                  checked={overwriteManual}
                  onChange={e => setOverwriteManual(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>
                  <span className="font-semibold text-slate-900 block">Overwrite manually edited cells</span>
                  <span className="text-[11px] text-slate-500">
                    Leave unchecked to protect cells entered manually in DLER; only Castcore-synced or empty cells are updated.
                  </span>
                </span>
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600 space-y-1">
                <div>
                  Pulls <b>Casting volume (m³)</b> for <b>{previewRange.startDate}</b> to <b>{previewRange.endDate}</b> matched by project <b>ERP Code</b> (max 31 days/request, 60 req/min limit).
                </div>
                <div>
                  Synced values are saved permanently in Supabase — re-syncing only updates cells that changed in Castcore.
                </div>
                <div>
                  Manage project ERP code mappings in{' '}
                  <Link href="/dler/config" className="font-semibold text-teal-700 hover:underline">
                    DLER &gt; Config
                  </Link>
                  .
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={syncing}
                onClick={() => setSyncModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={handleRunCastcoreSync}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing from Castcore…' : 'Start Sync'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
