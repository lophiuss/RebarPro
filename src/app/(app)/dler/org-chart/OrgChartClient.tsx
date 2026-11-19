'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Network, Table2, Plus, Search, RefreshCw, Pencil, Trash2, X,
  Building2, FolderKanban, Users, ChevronDown, ChevronRight, Minus, Maximize2, CheckCircle2, AlertTriangle
} from 'lucide-react'
import type { DlerRole } from '../guard'
import type { DlerAllocation, DlerDepartment, DlerPerson, DlerProject } from '@/lib/dler-math'
import {
  saveDlerPerson,
  deleteDlerPerson,
  updatePersonParentAndDept,
  savePersonProjectAllocations,
  syncWorkersFromPlantpro,
  syncStaffFromLogins,
} from '../actions'

type ScopeMode = 'overall' | 'department' | 'project'
type ViewStyle = 'tree' | 'matrix'
type TypeFilter = 'ALL' | 'STAFF' | 'WORKER'

interface StaffNode {
  person: DlerPerson
  staffChildren: StaffNode[]
  workers: DlerPerson[]
}

export default function OrgChartClient({
  role,
  departments,
  projects,
  people,
  allocations,
  logins,
}: {
  role: DlerRole
  departments: DlerDepartment[]
  projects: DlerProject[]
  people: DlerPerson[]
  allocations: DlerAllocation[]
  logins: { id: string; name: string; email: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [scope, setScope] = useState<ScopeMode>('overall')
  const [selectedDeptId, setSelectedDeptId] = useState<number>(departments[0]?.id ?? 0)
  const [selectedProjId, setSelectedProjId] = useState<number>(projects.find(p => p.status === 'Active')?.id ?? projects[0]?.id ?? 0)
  const [viewStyle, setViewStyle] = useState<ViewStyle>('tree')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState(100)
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set())
  const [expandedCrews, setExpandedCrews] = useState<Set<number>>(new Set())
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Modal state for Add / Edit Person + Project % Splits
  const [modalPerson, setModalPerson] = useState<{
    id?: number
    person_type: 'STAFF' | 'WORKER'
    emp_no: string
    name: string
    designation: string
    department_id: string
    reports_to_id: string
    status: 'Active' | 'Inactive' | 'On Leave'
    remarks: string
    profile_id: string
    allocs: Record<number, string>
  } | null>(null)

  const canEditType = (pt: 'STAFF' | 'WORKER') =>
    role === 'admin' || (role === 'hr_worker' && pt === 'WORKER') || (role === 'hr_staff' && pt === 'STAFF')

  const canAddStaff = canEditType('STAFF')
  const canAddWorker = canEditType('WORKER')

  const deptMap = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])
  const projMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])
  const loginById = useMemo(() => new Map(logins.map(l => [l.id, l])), [logins])
  const emailOf = (p: DlerPerson) => (p.profile_id ? loginById.get(p.profile_id)?.email ?? '' : '')
  const personMap = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const activeProjects = useMemo(() => projects.filter(p => p.status === 'Active'), [projects])
  const staffList = useMemo(() => people.filter(p => p.person_type === 'STAFF'), [people])

  // Map person_id -> Map<project_id, percentage>
  const allocByPerson = useMemo(() => {
    const m = new Map<number, Map<number, number>>()
    for (const a of allocations) {
      if (!m.has(a.person_id)) m.set(a.person_id, new Map())
      m.get(a.person_id)!.set(a.project_id, Number(a.percentage) || 0)
    }
    return m
  }, [allocations])

  function totalPctOf(personId: number): number {
    const m = allocByPerson.get(personId)
    if (!m) return 0
    let s = 0
    for (const v of m.values()) s += v
    return Math.round(s * 100) / 100
  }

  function personAllocsList(personId: number) {
    const m = allocByPerson.get(personId)
    if (!m) return []
    const out: { projectId: number; name: string; pct: number }[] = []
    for (const [pid, pct] of m.entries()) {
      if (pct > 0) {
        out.push({ projectId: pid, name: projMap.get(pid)?.name ?? `#${pid}`, pct })
      }
    }
    return out.sort((a, b) => b.pct - a.pct)
  }

  // Filter people based on scope, typeFilter, and search query
  const q = query.trim().toLowerCase()
  const filteredPeople = useMemo(() => {
    return people.filter(p => {
      if (typeFilter !== 'ALL' && p.person_type !== typeFilter) return false
      if (scope === 'department' && p.department_id !== selectedDeptId) return false
      if (scope === 'project') {
        const pct = allocByPerson.get(p.id)?.get(selectedProjId) ?? 0
        if (pct <= 0) return false
      }
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          p.emp_no.toLowerCase().includes(q) ||
          emailOf(p).toLowerCase().includes(q) ||
          (p.designation ?? '').toLowerCase().includes(q)
        if (!hit) return false
      }
      return true
    })
  }, [people, typeFilter, scope, selectedDeptId, selectedProjId, allocByPerson, q])

  // Summary metrics for the active scope
  const scopeStats = useMemo(() => {
    const staffCount = filteredPeople.filter(p => p.person_type === 'STAFF').length
    const workerCount = filteredPeople.filter(p => p.person_type === 'WORKER').length
    const fte =
      scope === 'project'
        ? filteredPeople.reduce((s, p) => s + (allocByPerson.get(p.id)?.get(selectedProjId) ?? 0) / 100, 0)
        : filteredPeople.length
    return { staffCount, workerCount, fte }
  }, [filteredPeople, scope, selectedProjId, allocByPerson])

  // Build hierarchical tree for Staff + Workers under them
  const { roots, unassignedWorkers } = useMemo(() => {
    const visibleSet = new Set(filteredPeople.map(p => p.id))
    // Keep staff ancestors of visible people so tree paths stay intact when filtered
    const keepIds = new Set(visibleSet)
    for (const p of filteredPeople) {
      let cur = p.reports_to_id
      const guard = new Set<number>()
      while (cur && !guard.has(cur)) {
        guard.add(cur)
        keepIds.add(cur)
        cur = personMap.get(cur)?.reports_to_id ?? null
      }
    }

    const staffShown = people.filter(p => p.person_type === 'STAFF' && keepIds.has(p.id))
    const staffShownIds = new Set(staffShown.map(s => s.id))
    const workersShown = filteredPeople.filter(p => p.person_type === 'WORKER')

    const childrenMap = new Map<number | null, DlerPerson[]>()
    for (const s of staffShown) {
      const pid = s.reports_to_id && staffShownIds.has(s.reports_to_id) ? s.reports_to_id : null
      const arr = childrenMap.get(pid) ?? []
      arr.push(s)
      childrenMap.set(pid, arr)
    }

    const workersBySup = new Map<number, DlerPerson[]>()
    const orphanWorkers: DlerPerson[] = []
    for (const w of workersShown) {
      if (w.reports_to_id && staffShownIds.has(w.reports_to_id)) {
        const arr = workersBySup.get(w.reports_to_id) ?? []
        arr.push(w)
        workersBySup.set(w.reports_to_id, arr)
      } else {
        orphanWorkers.push(w)
      }
    }

    const buildNode = (s: DlerPerson, depth: number): StaffNode => ({
      person: s,
      staffChildren: depth > 15 ? [] : (childrenMap.get(s.id) ?? []).map(c => buildNode(c, depth + 1)),
      workers: workersBySup.get(s.id) ?? [],
    })

    return {
      roots: (childrenMap.get(null) ?? []).map(r => buildNode(r, 0)),
      unassignedWorkers: orphanWorkers,
    }
  }, [filteredPeople, people, personMap])

  function openAddModal(pt: 'STAFF' | 'WORKER', defaultParentId?: number | null) {
    setModalPerson({
      person_type: pt,
      emp_no: '',
      name: '',
      designation: '',
      department_id: scope === 'department' && selectedDeptId ? String(selectedDeptId) : '',
      reports_to_id: defaultParentId ? String(defaultParentId) : '',
      status: 'Active',
      remarks: '',
      profile_id: '',
      allocs: scope === 'project' && selectedProjId ? { [selectedProjId]: '100' } : {},
    })
  }

  function openEditModal(p: DlerPerson) {
    const m = allocByPerson.get(p.id)
    const allocs: Record<number, string> = {}
    if (m) {
      for (const [pid, pct] of m.entries()) {
        if (pct > 0) allocs[pid] = String(pct)
      }
    }
    setModalPerson({
      id: p.id,
      person_type: p.person_type,
      emp_no: p.emp_no,
      name: p.name,
      designation: p.designation ?? '',
      department_id: p.department_id != null ? String(p.department_id) : '',
      reports_to_id: p.reports_to_id != null ? String(p.reports_to_id) : '',
      status: p.status,
      remarks: p.remarks ?? '',
      profile_id: p.profile_id ?? '',
      allocs,
    })
  }

  async function handleSaveModal(e: React.FormEvent) {
    e.preventDefault()
    if (!modalPerson) return
    setFeedback(null)
    const allocRows = Object.entries(modalPerson.allocs)
      .map(([pid, pct]) => ({ project_id: Number(pid), percentage: Number(pct) || 0 }))
      .filter(r => r.percentage > 0)
    const sumPct = allocRows.reduce((s, r) => s + r.percentage, 0)
    if (sumPct > 100.01) {
      setFeedback({ kind: 'err', text: `Total project % (${sumPct.toFixed(1)}%) cannot exceed 100%` })
      return
    }

    startTransition(async () => {
      try {
        const savedId = await saveDlerPerson({
          id: modalPerson.id ?? null,
          person_type: modalPerson.person_type,
          emp_no: modalPerson.emp_no,
          name: modalPerson.name,
          designation: modalPerson.designation || null,
          department_id: modalPerson.department_id ? Number(modalPerson.department_id) : null,
          reports_to_id: modalPerson.reports_to_id ? Number(modalPerson.reports_to_id) : null,
          status: modalPerson.status,
          remarks: modalPerson.remarks || null,
          profile_id: modalPerson.profile_id || null,
        })

        await savePersonProjectAllocations(savedId, allocRows)
        setModalPerson(null)
        setFeedback({ kind: 'ok', text: 'Saved successfully.' })
        router.refresh()
      } catch (err: any) {
        setFeedback({ kind: 'err', text: err?.message ?? 'Save failed' })
      }
    })
  }

  async function handleSyncLogins() {
    setSyncing(true)
    setFeedback(null)
    try {
      const res = await syncStaffFromLogins()
      setFeedback({ kind: 'ok', text: res.inserted ? `Added ${res.inserted} login(s) to the org chart as Staff.` : 'All logins are already in the org chart.' })
      router.refresh()
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err?.message ?? 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncFromHr() {
    setSyncing(true)
    setFeedback(null)
    try {
      const res = await syncWorkersFromPlantpro()
      setFeedback({
        kind: 'ok',
        text: `Synced from HR: ${res.inserted} new workers added, ${res.updated} existing updated.`,
      })
      router.refresh()
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err?.message ?? 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  function runInline(fn: () => Promise<void>, okText = 'Updated') {
    setFeedback(null)
    startTransition(async () => {
      try {
        await fn()
        setFeedback({ kind: 'ok', text: okText })
        router.refresh()
      } catch (err: any) {
        setFeedback({ kind: 'err', text: err?.message ?? 'Update failed' })
      }
    })
  }

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Network className="w-6 h-6 text-teal-600" />
            DLER Org Chart &amp; Project % Assignment
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Isolated from Meetings Org Chart · Showing{' '}
            <b>{scopeStats.staffCount}</b> Staff &amp; <b>{scopeStats.workerCount}</b> Workers
            {scope === 'project' && <> · Allocated FTE: <b>{scopeStats.fte.toFixed(2)}</b></>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canAddStaff && (
            <button
              type="button"
              disabled={syncing}
              onClick={handleSyncLogins}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 disabled:opacity-50"
              title="Add every AlphaVision login that is not yet in the org chart"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync Staff from Logins
            </button>
          )}
          {canAddStaff && (
            <button
              type="button"
              onClick={() => openAddModal('STAFF', null)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Add Staff
            </button>
          )}
          {canAddWorker && (
            <>
              <button
                type="button"
                onClick={() => openAddModal('WORKER', null)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add Worker
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={handleSyncFromHr}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing…' : 'Sync Worker IDs from HR'}
              </button>
            </>
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

      {/* Switcher Bar: Overall / By Department / By Project + View Style */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Scope Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setScope('overall')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  scope === 'overall' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" /> Overall
              </button>
              <button
                type="button"
                onClick={() => setScope('department')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  scope === 'department' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" /> By Department
              </button>
              <button
                type="button"
                onClick={() => setScope('project')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  scope === 'project' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderKanban className="w-3.5 h-3.5" /> By Project
              </button>
            </div>

            {/* Type filter */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              {(['ALL', 'STAFF', 'WORKER'] as TypeFilter[]).map(tf => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTypeFilter(tf)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    typeFilter === tf ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tf === 'ALL' ? 'All' : tf === 'STAFF' ? 'Staff' : 'Workers'}
                </button>
              ))}
            </div>
          </div>

          {/* Search + Tree/Matrix Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search ID, name, role..."
                className="pl-8 pr-7 py-1.5 text-xs border border-slate-300 rounded-xl w-52 bg-white"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setViewStyle('tree')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewStyle === 'tree' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Network className="w-3.5 h-3.5" /> Visual Org Tree
              </button>
              <button
                type="button"
                onClick={() => setViewStyle('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewStyle === 'matrix' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" /> Allocation Matrix
              </button>
            </div>
          </div>
        </div>

        {/* Department or Project Pills */}
        {scope === 'department' && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
            {departments.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDeptId(d.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                  selectedDeptId === d.id
                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}

        {scope === 'project' && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
            {activeProjects.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProjId(p.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                  selectedProjId === p.id
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* VIEW 1: Visual Org Tree */}
      {viewStyle === 'tree' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              Staff &amp; Supervisors sit in the org hierarchy; Workers under each Supervisor can be expanded or edited inline.
            </span>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-lg border bg-white text-xs overflow-hidden">
                <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="px-2 py-1 hover:bg-slate-50"><Minus className="w-3.5 h-3.5" /></button>
                <span className="px-2 tabular-nums font-medium">{zoom}%</span>
                <button onClick={() => setZoom(z => Math.min(130, z + 10))} className="px-2 py-1 hover:bg-slate-50"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <button onClick={() => setZoom(100)} className="px-2.5 py-1 text-xs rounded-lg border bg-white hover:bg-slate-50 flex items-center gap-1">
                <Maximize2 className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>

          <div
            className="overflow-auto p-6 min-h-[420px] bg-slate-50"
            style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '18px 18px' }}
          >
            <div style={{ zoom: zoom / 100 }} className="space-y-8">
              {roots.length === 0 && unassignedWorkers.length === 0 ? (
                <div className="text-center py-16 text-sm text-slate-400">No people match this filter.</div>
              ) : (
                <>
                  {roots.length > 0 && (
                    <div className="flex flex-wrap items-start justify-center gap-8">
                      {roots.map(root => (
                        <TreeNodeBlock
                          key={root.person.id}
                          node={root}
                          depth={0}
                          deptMap={deptMap}
                          personAllocsList={personAllocsList}
                          collapsedIds={collapsedIds}
                          setCollapsedIds={setCollapsedIds}
                          expandedCrews={expandedCrews}
                          setExpandedCrews={setExpandedCrews}
                          canEditType={canEditType}
                          onAddChild={parentId => openAddModal(canAddStaff ? 'STAFF' : 'WORKER', parentId)}
                          onEdit={openEditModal}
                          scope={scope}
                          selectedProjId={selectedProjId}
                          emailOf={emailOf}
                        />
                      ))}
                    </div>
                  )}

                  {unassignedWorkers.length > 0 && (
                    <div className="max-w-5xl mx-auto bg-white border border-amber-200 rounded-2xl p-4 shadow-xs">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800">
                          Workers Not Assigned to a Supervisor ({unassignedWorkers.length})
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {unassignedWorkers.map(w => (
                          <WorkerMiniCard
                            key={w.id}
                            worker={w}
                            deptName={w.department_id ? deptMap.get(w.department_id)?.name : undefined}
                            allocs={personAllocsList(w.id)}
                            canEdit={canEditType('WORKER')}
                            onEdit={() => openEditModal(w)}
                            highlightProjId={scope === 'project' ? selectedProjId : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Allocation Matrix Table */}
      {viewStyle === 'matrix' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 px-3 py-2.5 text-left whitespace-nowrap">Type</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2.5 text-left whitespace-nowrap">ID</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2.5 text-left whitespace-nowrap min-w-[160px]">Name</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2.5 text-left whitespace-nowrap">Home Dept</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2.5 text-left whitespace-nowrap">Reports To</th>
                  <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2.5 text-center whitespace-nowrap">Total %</th>
                  {activeProjects.map(pr => (
                    <th
                      key={pr.id}
                      className={`sticky top-0 z-20 px-2 py-2.5 text-center whitespace-nowrap min-w-[76px] ${
                        scope === 'project' && selectedProjId === pr.id ? 'bg-sky-100 text-sky-900' : 'bg-slate-50'
                      }`}
                    >
                      {pr.name} %
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.map(p => {
                  const editable = canEditType(p.person_type)
                  const pAllocs = allocByPerson.get(p.id)
                  const total = totalPctOf(p.id)
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.person_type === 'STAFF'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-teal-50 text-teal-700 border border-teal-200'
                          }`}
                        >
                          {p.person_type}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-slate-600 whitespace-nowrap">{p.emp_no}</td>
                      <td className="px-3 py-1.5 font-semibold text-slate-900 whitespace-nowrap">
                        <div>{p.name}</div>
                        {p.designation && <div className="text-[10px] font-normal text-slate-400">{p.designation}</div>}
                        {emailOf(p) ? <div className="text-[10px] font-normal text-sky-600">{emailOf(p)}</div> : p.person_type === 'STAFF' ? <div className="text-[10px] font-normal text-amber-600">no login linked</div> : null}
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          disabled={!editable || isPending}
                          value={p.department_id ?? ''}
                          onChange={e =>
                            runInline(() =>
                              updatePersonParentAndDept(p.id, {
                                department_id: e.target.value ? Number(e.target.value) : null,
                              })
                            )
                          }
                          className="border border-slate-200 rounded-md px-1.5 py-1 text-xs bg-white disabled:bg-slate-50 disabled:text-slate-500"
                        >
                          <option value="">—</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          disabled={!editable || isPending}
                          value={p.reports_to_id ?? ''}
                          onChange={e =>
                            runInline(() =>
                              updatePersonParentAndDept(p.id, {
                                reports_to_id: e.target.value ? Number(e.target.value) : null,
                              })
                            )
                          }
                          className="border border-slate-200 rounded-md px-1.5 py-1 text-xs bg-white disabled:bg-slate-50 disabled:text-slate-500 max-w-[140px]"
                        >
                          <option value="">(Top / None)</option>
                          {staffList
                            .filter(s => s.id !== p.id)
                            .map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                            total === 100
                              ? 'bg-emerald-100 text-emerald-800'
                              : total > 100
                              ? 'bg-rose-100 text-rose-800'
                              : total > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {total}%
                        </span>
                      </td>
                      {activeProjects.map(pr => {
                        const val = pAllocs?.get(pr.id) ?? 0
                        return (
                          <td
                            key={pr.id}
                            className={`px-1.5 py-1.5 text-center ${
                              scope === 'project' && selectedProjId === pr.id ? 'bg-sky-50/50' : ''
                            }`}
                          >
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={5}
                              disabled={!editable || isPending}
                              defaultValue={val || ''}
                              placeholder="0"
                              onBlur={e => {
                                const nextVal = Number(e.target.value) || 0
                                if (nextVal === val) return
                                const nextRows = activeProjects
                                  .map(ap => ({
                                    project_id: ap.id,
                                    percentage: ap.id === pr.id ? nextVal : pAllocs?.get(ap.id) ?? 0,
                                  }))
                                  .filter(r => r.percentage > 0)
                                runInline(() => savePersonProjectAllocations(p.id, nextRows), 'Project % saved')
                              }}
                              className="w-14 text-right border border-slate-200 rounded px-1.5 py-1 text-xs tabular-nums disabled:bg-slate-50"
                            />
                          </td>
                        )
                      })}
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {editable && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(p)}
                              className="p-1 text-slate-500 hover:text-indigo-600"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Delete ${p.name}?`)) {
                                  runInline(() => deleteDlerPerson(p.id), 'Deleted')
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filteredPeople.length === 0 && (
                  <tr>
                    <td colSpan={7 + activeProjects.length} className="text-center py-8 text-slate-400">
                      No matching staff or workers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalPerson && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveModal} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {modalPerson.id ? 'Edit' : 'Add'} {modalPerson.person_type === 'STAFF' ? 'Staff Member' : 'Worker'}
              </h2>
              <button type="button" onClick={() => setModalPerson(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="font-semibold text-slate-600">
                    {modalPerson.person_type === 'STAFF' ? 'Staff ID' : 'Worker ID'} *
                  </span>
                  <input
                    required
                    value={modalPerson.emp_no}
                    onChange={e => setModalPerson({ ...modalPerson, emp_no: e.target.value })}
                    placeholder={modalPerson.person_type === 'STAFF' ? 'e.g. STF-010' : 'e.g. 100700'}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-600">Full Name *</span>
                  <input
                    required
                    value={modalPerson.name}
                    onChange={e => setModalPerson({ ...modalPerson, name: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-600">Designation / Role</span>
                  <input
                    value={modalPerson.designation}
                    onChange={e => setModalPerson({ ...modalPerson, designation: e.target.value })}
                    placeholder="e.g. Site Supervisor / Welder"
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-600">Status</span>
                  <select
                    value={modalPerson.status}
                    onChange={e => setModalPerson({ ...modalPerson, status: e.target.value as any })}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-600">Home Department</span>
                  <select
                    value={modalPerson.department_id}
                    onChange={e => setModalPerson({ ...modalPerson, department_id: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Unassigned</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.kind})</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="font-semibold text-slate-600">Linked login (email) — optional, can be linked later</span>
                  <select
                    value={modalPerson.profile_id}
                    onChange={e => setModalPerson({ ...modalPerson, profile_id: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Not linked to a login</option>
                    {logins
                      .filter(l => l.id === modalPerson.profile_id || !people.some(pp => pp.profile_id === l.id))
                      .map(l => (
                        <option key={l.id} value={l.id}>{l.name || '(no name)'} — {l.email}</option>
                      ))}
                  </select>
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-600">Reports To (Supervisor / HOD)</span>
                  <select
                    value={modalPerson.reports_to_id}
                    onChange={e => setModalPerson({ ...modalPerson, reports_to_id: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">(Top level / None)</option>
                    {staffList
                      .filter(s => s.id !== modalPerson.id)
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.emp_no})</option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800">Project Assignment (%)</span>
                  <span className="text-xs font-bold text-teal-700">
                    Total:{' '}
                    {Object.values(modalPerson.allocs).reduce((s, v) => s + (Number(v) || 0), 0)}% / 100%
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {activeProjects.map(pr => (
                    <label key={pr.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="truncate font-medium text-slate-700" title={pr.name}>{pr.name}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={modalPerson.allocs[pr.id] ?? ''}
                        onChange={e =>
                          setModalPerson({
                            ...modalPerson,
                            allocs: { ...modalPerson.allocs, [pr.id]: e.target.value },
                          })
                        }
                        placeholder="0"
                        className="w-14 text-right border border-slate-300 rounded px-1.5 py-0.5 text-xs"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setModalPerson(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function TreeNodeBlock({
  node,
  depth,
  deptMap,
  personAllocsList,
  collapsedIds,
  setCollapsedIds,
  expandedCrews,
  setExpandedCrews,
  canEditType,
  onAddChild,
  onEdit,
  scope,
  selectedProjId,
  emailOf,
}: {
  node: StaffNode
  depth: number
  deptMap: Map<number, DlerDepartment>
  personAllocsList: (pid: number) => { projectId: number; name: string; pct: number }[]
  collapsedIds: Set<number>
  setCollapsedIds: React.Dispatch<React.SetStateAction<Set<number>>>
  expandedCrews: Set<number>
  setExpandedCrews: React.Dispatch<React.SetStateAction<Set<number>>>
  canEditType: (pt: 'STAFF' | 'WORKER') => boolean
  onAddChild: (parentId: number) => void
  onEdit: (p: DlerPerson) => void
  scope: ScopeMode
  selectedProjId: number
  emailOf: (p: DlerPerson) => string
}) {
  const { person, staffChildren, workers } = node
  const isCollapsed = collapsedIds.has(person.id)
  const crewExpanded = expandedCrews.has(person.id) || workers.length <= 6 || scope !== 'overall'
  const allocs = personAllocsList(person.id)
  const deptName = person.department_id ? deptMap.get(person.department_id)?.name : null
  const headerColours = ['bg-slate-900', 'bg-indigo-700', 'bg-teal-700', 'bg-cyan-700']
  const headerBg = headerColours[depth % headerColours.length]

  return (
    <div className="flex flex-col items-center">
      {/* Staff Card */}
      <div className="w-64 rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden">
        <div className={`${headerBg} text-white px-3 py-2 flex items-start justify-between gap-2`}>
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-white/75">{person.emp_no} · STAFF</div>
            <div className="font-bold text-sm truncate">{person.name}</div>
            {person.designation && <div className="text-[11px] text-white/80 truncate">{person.designation}</div>}
            {emailOf(person) && <div className="text-[10px] text-white/70 truncate">{emailOf(person)}</div>}
          </div>
          {canEditType('STAFF') && (
            <button
              type="button"
              onClick={() => onEdit(person)}
              className="p-1 rounded hover:bg-white/20 text-white/80 hover:text-white shrink-0"
              title="Edit Staff"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="p-2.5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px]">
              {deptName ?? 'No Dept'}
            </span>
            {allocs.map(a => (
              <span
                key={a.projectId}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  scope === 'project' && a.projectId === selectedProjId
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-50 text-sky-800 border border-sky-200'
                }`}
              >
                {a.name} {a.pct}%
              </span>
            ))}
          </div>

          {/* Direct Workers under this Staff/Supervisor */}
          {workers.length > 0 && (
            <div className="border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() =>
                  setExpandedCrews(prev => {
                    const next = new Set(prev)
                    if (next.has(person.id)) next.delete(person.id)
                    else next.add(person.id)
                    return next
                  })
                }
                className="w-full flex items-center justify-between text-[11px] font-bold text-teal-700 hover:text-teal-900"
              >
                <span>Crew Workers ({workers.length})</span>
                {crewExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {crewExpanded && (
                <div className="mt-1.5 space-y-1 max-h-56 overflow-y-auto pr-0.5">
                  {workers.map(w => (
                    <WorkerMiniCard
                      key={w.id}
                      worker={w}
                      deptName={w.department_id ? deptMap.get(w.department_id)?.name : undefined}
                      allocs={personAllocsList(w.id)}
                      canEdit={canEditType('WORKER')}
                      onEdit={() => onEdit(w)}
                      highlightProjId={scope === 'project' ? selectedProjId : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            {(canEditType('STAFF') || canEditType('WORKER')) && (
              <button
                type="button"
                onClick={() => onAddChild(person.id)}
                className="text-[10px] font-semibold text-indigo-600 hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Add under
              </button>
            )}
            {staffChildren.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setCollapsedIds(prev => {
                    const next = new Set(prev)
                    if (next.has(person.id)) next.delete(person.id)
                    else next.add(person.id)
                    return next
                  })
                }
                className="ml-auto text-[10px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-0.5"
              >
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {staffChildren.length} sub-seats
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Connector & Children */}
      {!isCollapsed && staffChildren.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-0.5 h-5 bg-slate-300" />
          <div className="flex items-start gap-6 relative pt-4 border-t-2 border-slate-300">
            {staffChildren.map(child => (
              <TreeNodeBlock
                key={child.person.id}
                node={child}
                depth={depth + 1}
                deptMap={deptMap}
                personAllocsList={personAllocsList}
                collapsedIds={collapsedIds}
                setCollapsedIds={setCollapsedIds}
                expandedCrews={expandedCrews}
                setExpandedCrews={setExpandedCrews}
                canEditType={canEditType}
                onAddChild={onAddChild}
                onEdit={onEdit}
                scope={scope}
                selectedProjId={selectedProjId}
                emailOf={emailOf}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WorkerMiniCard({
  worker,
  deptName,
  allocs,
  canEdit,
  onEdit,
  highlightProjId,
}: {
  worker: DlerPerson
  deptName?: string
  allocs: { projectId: number; name: string; pct: number }[]
  canEdit: boolean
  onEdit: () => void
  highlightProjId?: number
}) {
  return (
    <div className="flex items-start justify-between gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
      <div className="min-w-0">
        <div className="font-semibold text-slate-800 truncate">
          <span className="font-mono text-[10px] text-slate-500 mr-1">{worker.emp_no}</span>
          {worker.name}
        </div>
        <div className="flex flex-wrap items-center gap-1 mt-0.5">
          {deptName && <span className="text-[9px] px-1 rounded bg-white border border-slate-200 text-slate-600">{deptName}</span>}
          {allocs.map(a => (
            <span
              key={a.projectId}
              className={`text-[9px] px-1 rounded font-semibold ${
                highlightProjId === a.projectId ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-800'
              }`}
            >
              {a.name} {a.pct}%
            </span>
          ))}
        </div>
      </div>
      {canEdit && (
        <button type="button" onClick={onEdit} className="p-0.5 text-slate-400 hover:text-teal-700 shrink-0" title="Edit Worker & Project %">
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
