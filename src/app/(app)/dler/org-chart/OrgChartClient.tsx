'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Network, Table2, Plus, Search, RefreshCw, Pencil, Trash2, X,
  Building2, FolderKanban, Users, ChevronDown, ChevronRight, Minus, Maximize2, Minimize2, Crosshair, Scan, CheckCircle2, AlertTriangle,
  ArrowUp, ArrowDown, UserPlus, Unlink, Check, Tag, Tags, Printer
} from 'lucide-react'
import type { DlerRole } from '../guard'
import type { DlerAllocation, DlerDepartment, DlerPerson, DlerProject } from '@/lib/dler-math'
import {
  saveDlerPerson,
  deleteDlerPerson,
  updatePersonParentAndDept,
  updatePersonEmpNo,
  savePersonProjectAllocations,
  bulkTagDepartment,
  bulkTagProjects,
  saveDlerDepartment,
  saveDlerProject,
  syncWorkersFromPlantpro,
  syncStaffFromLogins,
  assignPeopleUnder,
  assignStaffAbove,
} from '../actions'
import {
  layoutForest,
  TREE_MODES,
  TREE_MODE_LABEL,
  type TreeLayoutMode,
  type LayoutTreeNode,
} from './treeLayout'

const DLER_PREF_EVENT = 'dler-org-pref'

function useDlerPref(key: string, fallback: string): [string, (value: string) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener('storage', cb)
    window.addEventListener(DLER_PREF_EVENT, cb)
    return () => {
      window.removeEventListener('storage', cb)
      window.removeEventListener(DLER_PREF_EVENT, cb)
    }
  }, [])
  const read = useCallback(() => {
    try {
      return window.localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  }, [key, fallback])
  const value = useSyncExternalStore(subscribe, read, () => fallback)
  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next)
      } catch {
        /* ignore storage restrictions */
      }
      window.dispatchEvent(new Event(DLER_PREF_EVENT))
    },
    [key]
  )
  return [value, set]
}

type ScopeMode = 'overall' | 'department' | 'project'
type ViewStyle = 'tree' | 'matrix'
type TypeFilter = 'ALL' | 'STAFF' | 'WORKER'

interface StaffNode {
  person: DlerPerson
  staffChildren: StaffNode[]
  workers: DlerPerson[]
}

const DEPT_TAG_PALETTE = [
  'bg-emerald-50 text-emerald-800 border-emerald-200',
  'bg-teal-50 text-teal-800 border-teal-200',
  'bg-sky-50 text-sky-800 border-sky-200',
  'bg-indigo-50 text-indigo-800 border-indigo-200',
  'bg-violet-50 text-violet-800 border-violet-200',
  'bg-amber-50 text-amber-800 border-amber-200',
  'bg-rose-50 text-rose-800 border-rose-200',
  'bg-cyan-50 text-cyan-800 border-cyan-200',
  'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
  'bg-orange-50 text-orange-800 border-orange-200',
] as const

function deptTagClass(dept?: DlerDepartment | null): string {
  if (!dept) return 'bg-slate-100 text-slate-500 border-slate-200'
  return DEPT_TAG_PALETTE[Math.abs(dept.id) % DEPT_TAG_PALETTE.length]
}

function toggleProjectTagMap(
  prev: Record<number, string>,
  projectId: number
): Record<number, string> {
  const next = { ...prev }
  if (Object.prototype.hasOwnProperty.call(next, projectId)) {
    delete next[projectId]
    return next
  }
  if (Object.keys(next).length === 0) {
    next[projectId] = '100'
  } else {
    let sum = 0
    for (const v of Object.values(next)) sum += Number(v) || 0
    const remaining = Math.max(0, Math.round((100 - sum) * 100) / 100)
    next[projectId] = String(remaining)
  }
  return next
}

function splitProjectsEvenlyMap(prev: Record<number, string>): Record<number, string> {
  const keys = Object.keys(prev)
  if (keys.length === 0) return prev
  const n = keys.length
  const base = Math.floor(100 / n)
  const rem = 100 - base * n
  const next: Record<number, string> = {}
  keys.forEach((k, idx) => {
    next[Number(k)] = String(idx === 0 ? base + rem : base)
  })
  return next
}

function parseProjectAllocRows(projectAllocs: Record<number, string>): {
  rows: { project_id: number; percentage: number }[]
  total: number
  error: string | null
} {
  const rows: { project_id: number; percentage: number }[] = []
  let total = 0
  for (const [pidStr, val] of Object.entries(projectAllocs)) {
    const pct = Number(val)
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return { rows: [], total: 0, error: 'Each project % must be between 0 and 100' }
    }
    if (pct > 0) {
      rows.push({ project_id: Number(pidStr), percentage: pct })
      total += pct
    }
  }
  total = Math.round(total * 100) / 100
  if (total > 100.01) {
    return { rows: [], total, error: `Total project allocation (${total.toFixed(1)}%) cannot exceed 100%` }
  }
  return { rows, total, error: null }
}

export default function OrgChartClient({
  role,
  departments,
  projects,
  people,
  allocations,
  logins,
  defaultFactoryId,
}: {
  role: DlerRole
  departments: DlerDepartment[]
  projects: DlerProject[]
  people: DlerPerson[]
  allocations: DlerAllocation[]
  logins: { id: string; name: string; email: string }[]
  defaultFactoryId: number
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
  const [showUnplacedInTree, setShowUnplacedInTree] = useState(false)
  const [unplacedExpanded, setUnplacedExpanded] = useState(true)
  const [unplacedQuery, setUnplacedQuery] = useState('')
  const [compactTree, setCompactTree] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const treeContentRef = useRef<HTMLDivElement | null>(null)
  const positionedTreeRef = useRef<HTMLDivElement | null>(null)
  const [cardHeights, setCardHeights] = useState<Record<number, number>>({})
  const [layoutPref, setLayoutPref] = useDlerPref('dler-org-layout', 'auto')
  const layoutMode: TreeLayoutMode = (TREE_MODES as string[]).includes(layoutPref)
    ? (layoutPref as TreeLayoutMode)
    : 'auto'
  const [nodeModesPref, setNodeModesPref] = useDlerPref('dler-org-node-modes', '{}')
  const nodeModes = useMemo<Record<number, TreeLayoutMode>>(() => {
    try {
      const parsed = JSON.parse(nodeModesPref)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }, [nodeModesPref])
  const setLayoutMode = useCallback(
    (m: TreeLayoutMode) => {
      setLayoutPref(m)
      setNodeModesPref('{}')
    },
    [setLayoutPref, setNodeModesPref]
  )
  const setNodeMode = useCallback(
    (id: number, m: TreeLayoutMode | '') => {
      const next = { ...nodeModes }
      if (m) next[id] = m
      else delete next[id]
      setNodeModesPref(JSON.stringify(next))
    },
    [nodeModes, setNodeModesPref]
  )
  const overrideCount = Object.keys(nodeModes).length
  const panRef = useRef<{
    active: boolean
    moved: boolean
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
  }>({ active: false, moved: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 })
  const [hierarchyBusy, setHierarchyBusy] = useState(false)
  const [hierarchyError, setHierarchyError] = useState<string | null>(null)

  const [aboveModal, setAboveModal] = useState<{
    person: DlerPerson
    mode: 'set_manager' | 'insert_above'
    query: string
  } | null>(null)
  const [newAboveOpen, setNewAboveOpen] = useState(false)
  const [newAboveForm, setNewAboveForm] = useState({
    emp_no: '',
    name: '',
    designation: '',
    department_id: '',
    profile_id: '',
  })

  const [underModal, setUnderModal] = useState<{
    manager: DlerPerson
    filter: 'UNPLACED_STAFF' | 'ALL_STAFF' | 'WORKERS'
    query: string
    selectedIds: number[]
    asAssistant: boolean
  } | null>(null)
  const [printModal, setPrintModal] = useState<{
    paper: 'A3' | 'A4'
    landscape: boolean
    fit: 'page' | 'width'
  } | null>(null)
  const [printBusy, setPrintBusy] = useState(false)

  const [tagModal, setTagModal] = useState<{
    person: DlerPerson
    departmentId: number | null
    projectAllocs: Record<number, string>
    projQuery: string
    cascadeScope: 'self' | 'direct' | 'subtree'
    cascadeDept: boolean
    cascadeProjects: boolean
  } | null>(null)
  const [bulkTagModal, setBulkTagModal] = useState<{
    filter: 'UNTAGGED_DEPT' | 'UNTAGGED_PROJ' | 'STAFF' | 'WORKER' | 'ALL'
    query: string
    selectedIds: number[]
    applyDept: boolean
    departmentId: number | null
    applyProjects: boolean
    projectAllocs: Record<number, string>
    projQuery: string
  } | null>(null)
  const [tagBusy, setTagBusy] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  // Modal state for Add / Edit Person + Project % Splits
  const [modalPerson, setModalPerson] = useState<{
    id?: number
    person_type: 'STAFF' | 'WORKER'
    emp_no: string
    name: string
    designation: string
    department_id: string
    reports_to_id: string
    is_assistant: boolean
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
  const linkedProfileIds = useMemo(
    () => new Set(people.map(p => p.profile_id).filter((x): x is string => Boolean(x))),
    [people]
  )

  const childrenByParent = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const p of people) {
      if (p.reports_to_id != null) {
        const arr = m.get(p.reports_to_id) ?? []
        arr.push(p.id)
        m.set(p.reports_to_id, arr)
      }
    }
    return m
  }, [people])

  function getSelfAndDescendantIds(rootId: number): Set<number> {
    const out = new Set<number>([rootId])
    const stack = [rootId]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const childId of childrenByParent.get(cur) ?? []) {
        if (!out.has(childId)) {
          out.add(childId)
          stack.push(childId)
        }
      }
    }
    return out
  }

  function getSelfAndAncestorIds(personId: number): Set<number> {
    const out = new Set<number>([personId])
    let cur = personMap.get(personId)?.reports_to_id ?? null
    while (cur != null && !out.has(cur)) {
      out.add(cur)
      cur = personMap.get(cur)?.reports_to_id ?? null
    }
    return out
  }

  function openAboveModal(person: DlerPerson) {
    setHierarchyError(null)
    setNewAboveOpen(false)
    setNewAboveForm({
      emp_no: '',
      name: '',
      designation: '',
      department_id: person.department_id ? String(person.department_id) : '',
      profile_id: '',
    })
    setAboveModal({
      person,
      mode: person.person_type === 'STAFF' && canEditType('STAFF') && person.reports_to_id != null ? 'insert_above' : 'set_manager',
      query: '',
    })
  }

  function openUnderModal(manager: DlerPerson) {
    setHierarchyError(null)
    setUnderModal({
      manager,
      filter: canEditType('STAFF') ? 'UNPLACED_STAFF' : 'WORKERS',
      query: '',
      selectedIds: [],
      asAssistant: false,
    })
  }

  async function handleDetachAbove() {
    if (!aboveModal) return
    setHierarchyBusy(true)
    setHierarchyError(null)
    try {
      await assignStaffAbove(aboveModal.person.id, null, 'set_manager')
      setFeedback({ kind: 'ok', text: `${aboveModal.person.name} moved to Top Level` })
      setAboveModal(null)
      router.refresh()
    } catch (err: unknown) {
      setHierarchyError(err instanceof Error ? err.message : 'Failed to update manager')
    } finally {
      setHierarchyBusy(false)
    }
  }

  async function handleAssignExistingAbove(managerId: number) {
    if (!aboveModal) return
    const targetPerson = personMap.get(aboveModal.person.id) ?? aboveModal.person
    const mgr = personMap.get(managerId)
    setHierarchyBusy(true)
    setHierarchyError(null)
    try {
      await assignStaffAbove(targetPerson.id, managerId, aboveModal.mode)
      setFeedback({
        kind: 'ok',
        text:
          aboveModal.mode === 'insert_above'
            ? `Inserted ${mgr?.name ?? 'Staff'} directly above ${targetPerson.name}`
            : `Assigned ${mgr?.name ?? 'Staff'} as manager above ${targetPerson.name}`,
      })
      setAboveModal(null)
      router.refresh()
    } catch (err: unknown) {
      setHierarchyError(err instanceof Error ? err.message : 'Failed to assign manager')
    } finally {
      setHierarchyBusy(false)
    }
  }

  async function handleCreateNewStaffAbove(e: React.FormEvent) {
    e.preventDefault()
    if (!aboveModal) return
    const targetPerson = personMap.get(aboveModal.person.id) ?? aboveModal.person
    if (!newAboveForm.emp_no.trim() || !newAboveForm.name.trim()) {
      setHierarchyError('Emp No and Name are required')
      return
    }
    setHierarchyBusy(true)
    setHierarchyError(null)
    try {
      const newId = await saveDlerPerson({
        person_type: 'STAFF',
        emp_no: newAboveForm.emp_no.trim(),
        name: newAboveForm.name.trim(),
        designation: newAboveForm.designation.trim() || null,
        department_id: newAboveForm.department_id ? Number(newAboveForm.department_id) : null,
        reports_to_id: targetPerson.reports_to_id ?? null,
        status: 'Active',
        remarks: null,
        profile_id: newAboveForm.profile_id || null,
      })
      await assignStaffAbove(targetPerson.id, newId, 'set_manager')
      setFeedback({ kind: 'ok', text: `Created ${newAboveForm.name.trim()} and placed above ${targetPerson.name}` })
      setAboveModal(null)
      router.refresh()
    } catch (err: unknown) {
      setHierarchyError(err instanceof Error ? err.message : 'Failed to create staff above')
    } finally {
      setHierarchyBusy(false)
    }
  }

  async function handleDetachChild(child: DlerPerson) {
    setHierarchyBusy(true)
    setHierarchyError(null)
    try {
      await updatePersonParentAndDept(child.id, { reports_to_id: null })
      setFeedback({ kind: 'ok', text: `Detached ${child.name}` })
      router.refresh()
    } catch (err: unknown) {
      setHierarchyError(err instanceof Error ? err.message : 'Failed to detach person')
    } finally {
      setHierarchyBusy(false)
    }
  }

  async function handleToggleAssistant(child: DlerPerson) {
    setHierarchyBusy(true)
    setHierarchyError(null)
    try {
      const next = !child.is_assistant
      await updatePersonParentAndDept(child.id, { is_assistant: next })
      setFeedback({
        kind: 'ok',
        text: `${child.name} set as ${next ? 'Assistant seat' : 'Regular direct report'}`,
      })
      router.refresh()
    } catch (err: unknown) {
      setHierarchyError(err instanceof Error ? err.message : 'Failed to update seat type')
    } finally {
      setHierarchyBusy(false)
    }
  }

  async function handleAssignSelectedUnder() {
    if (!underModal || underModal.selectedIds.length === 0) return
    const mgr = personMap.get(underModal.manager.id) ?? underModal.manager
    const count = underModal.selectedIds.length
    setHierarchyBusy(true)
    setHierarchyError(null)
    try {
      await assignPeopleUnder(mgr.id, underModal.selectedIds, { asAssistant: underModal.asAssistant })
      setFeedback({
        kind: 'ok',
        text: `Assigned ${count} ${count === 1 ? 'person' : 'people'} ${underModal.asAssistant ? 'as assistant ' : ''}under ${mgr.name}`,
      })
      setUnderModal(prev => (prev ? { ...prev, selectedIds: [] } : null))
      router.refresh()
    } catch (err: unknown) {
      setHierarchyError(err instanceof Error ? err.message : 'Failed to assign people')
    } finally {
      setHierarchyBusy(false)
    }
  }

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

  function openTagModal(p: DlerPerson) {
    const m = allocByPerson.get(p.id)
    const projectAllocs: Record<number, string> = {}
    if (m) {
      for (const [pid, pct] of m.entries()) {
        if (pct > 0) projectAllocs[pid] = String(pct)
      }
    }
    setTagError(null)
    setTagModal({
      person: p,
      departmentId: p.department_id ?? null,
      projectAllocs,
      projQuery: '',
      cascadeScope: 'self',
      cascadeDept: true,
      cascadeProjects: true,
    })
  }

  function openBulkTagModal() {
    setTagError(null)
    setBulkTagModal({
      filter: 'UNTAGGED_DEPT',
      query: '',
      selectedIds: [],
      applyDept: true,
      departmentId: scope === 'department' && selectedDeptId > 0 ? selectedDeptId : departments[0]?.id ?? null,
      applyProjects: false,
      projectAllocs: scope === 'project' && selectedProjId > 0 ? { [selectedProjId]: '100' } : {},
      projQuery: '',
    })
  }

  async function handleSaveTagModal() {
    if (!tagModal) return
    const livePerson = personMap.get(tagModal.person.id) ?? tagModal.person
    const { rows, error: allocErr } = parseProjectAllocRows(tagModal.projectAllocs)
    if (allocErr) {
      setTagError(allocErr)
      return
    }

    const directIds = childrenByParent.get(livePerson.id) ?? []
    const subtreeIds = Array.from(getSelfAndDescendantIds(livePerson.id))
    const teamIds =
      tagModal.cascadeScope === 'self'
        ? [livePerson.id]
        : tagModal.cascadeScope === 'direct'
        ? [livePerson.id, ...directIds]
        : subtreeIds

    const deptTargetIds =
      tagModal.cascadeScope !== 'self' && tagModal.cascadeDept ? teamIds : [livePerson.id]
    const projTargetIds =
      tagModal.cascadeScope !== 'self' && tagModal.cascadeProjects ? teamIds : [livePerson.id]

    setTagBusy(true)
    setTagError(null)
    try {
      const [deptRes, projRes] = await Promise.all([
        bulkTagDepartment(deptTargetIds, tagModal.departmentId),
        bulkTagProjects(projTargetIds, rows),
      ])
      const updatedCount = Math.max(deptRes.updated, projRes.updated)
      const skippedCount = Math.max(deptRes.skipped, projRes.skipped)
      const suffix = skippedCount > 0 ? ` (${skippedCount} outside role skipped)` : ''
      setFeedback({
        kind: 'ok',
        text: `Updated Department & Project tags for ${updatedCount} ${updatedCount === 1 ? 'person' : 'people'}${suffix}`,
      })
      setTagModal(null)
      router.refresh()
    } catch (err: unknown) {
      setTagError(err instanceof Error ? err.message : 'Failed to save tags')
    } finally {
      setTagBusy(false)
    }
  }

  async function handleSaveBulkTagModal() {
    if (!bulkTagModal) return
    if (bulkTagModal.selectedIds.length === 0) {
      setTagError('Select at least one person')
      return
    }
    if (!bulkTagModal.applyDept && !bulkTagModal.applyProjects) {
      setTagError('Enable Apply Department tag and/or Apply Project tags')
      return
    }
    let projRows: { project_id: number; percentage: number }[] = []
    if (bulkTagModal.applyProjects) {
      const parsed = parseProjectAllocRows(bulkTagModal.projectAllocs)
      if (parsed.error) {
        setTagError(parsed.error)
        return
      }
      projRows = parsed.rows
    }

    setTagBusy(true)
    setTagError(null)
    try {
      let updated = 0
      let skipped = 0
      if (bulkTagModal.applyDept) {
        const res = await bulkTagDepartment(bulkTagModal.selectedIds, bulkTagModal.departmentId)
        updated = Math.max(updated, res.updated)
        skipped = Math.max(skipped, res.skipped)
      }
      if (bulkTagModal.applyProjects) {
        const res = await bulkTagProjects(bulkTagModal.selectedIds, projRows)
        updated = Math.max(updated, res.updated)
        skipped = Math.max(skipped, res.skipped)
      }
      const suffix = skipped > 0 ? ` (${skipped} outside role skipped)` : ''
      setFeedback({
        kind: 'ok',
        text: `Bulk-tagged ${updated} ${updated === 1 ? 'person' : 'people'}${suffix}`,
      })
      setBulkTagModal(null)
      router.refresh()
    } catch (err: unknown) {
      setTagError(err instanceof Error ? err.message : 'Bulk tagging failed')
    } finally {
      setTagBusy(false)
    }
  }

  // Headcount badges per Department & per Project (plus Untagged counts)
  const deptCounts = useMemo(() => {
    const counts = new Map<number, number>()
    let untagged = 0
    for (const p of people) {
      if (p.department_id == null) {
        untagged++
      } else {
        counts.set(p.department_id, (counts.get(p.department_id) ?? 0) + 1)
      }
    }
    return { counts, untagged }
  }, [people])

  const projCounts = useMemo(() => {
    const counts = new Map<number, number>()
    let untagged = 0
    for (const p of people) {
      const m = allocByPerson.get(p.id)
      let total = 0
      if (m) {
        for (const [pid, pct] of m.entries()) {
          if (pct > 0) {
            total += pct
            counts.set(pid, (counts.get(pid) ?? 0) + 1)
          }
        }
      }
      if (total <= 0) untagged++
    }
    return { counts, untagged }
  }, [people, allocByPerson])

  // Filter people based on scope, typeFilter, and search query
  const q = query.trim().toLowerCase()
  const filteredPeople = useMemo(() => {
    return people.filter(p => {
      if (typeFilter !== 'ALL' && p.person_type !== typeFilter) return false
      if (scope === 'department') {
        if (selectedDeptId === -1) {
          if (p.department_id != null) return false
        } else if (p.department_id !== selectedDeptId) {
          return false
        }
      }
      if (scope === 'project') {
        if (selectedProjId === -1) {
          let tot = 0
          for (const v of allocByPerson.get(p.id)?.values() ?? []) tot += v
          if (tot > 0) return false
        } else {
          const pct = allocByPerson.get(p.id)?.get(selectedProjId) ?? 0
          if (pct <= 0) return false
        }
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
  const { treeRoots, unplacedStaff, unassignedWorkers, collapsibleNodeIds } = useMemo(() => {
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

    const buildNode = (s: DlerPerson, depth: number, path = new Set<number>()): StaffNode => {
      const nextPath = new Set(path)
      nextPath.add(s.id)
      const kids = depth > 15
        ? []
        : (childrenMap.get(s.id) ?? []).filter(c => !nextPath.has(c.id))
      return {
        person: s,
        staffChildren: kids.map(c => buildNode(c, depth + 1, nextPath)),
        workers: workersBySup.get(s.id) ?? [],
      }
    }

    const allRootNodes = (childrenMap.get(null) ?? []).map(r => buildNode(r, 0))
    const connectedRoots = allRootNodes.filter(r => r.staffChildren.length > 0 || r.workers.length > 0)
    const isolatedStaff = allRootNodes
      .filter(r => r.staffChildren.length === 0 && r.workers.length === 0)
      .map(r => r.person)

    const collapsible: number[] = []
    const collectCollapsible = (n: StaffNode) => {
      if (n.staffChildren.length > 0) {
        collapsible.push(n.person.id)
        n.staffChildren.forEach(collectCollapsible)
      }
    }
    connectedRoots.forEach(collectCollapsible)

    return {
      treeRoots: connectedRoots,
      unplacedStaff: isolatedStaff,
      unassignedWorkers: orphanWorkers,
      collapsibleNodeIds: collapsible,
    }
  }, [filteredPeople, people, personMap])

  const cardWidth = compactTree ? 176 : 256

  const { staffNodeById, depthById, layoutRoots } = useMemo(() => {
    const byId = new Map<number, StaffNode>()
    const depths = new Map<number, number>()
    const convert = (n: StaffNode, depth: number): LayoutTreeNode => {
      byId.set(n.person.id, n)
      depths.set(n.person.id, depth)
      return {
        id: n.person.id,
        isAssistant: Boolean(n.person.is_assistant),
        children: n.staffChildren.map(c => convert(c, depth + 1)),
      }
    }
    return {
      staffNodeById: byId,
      depthById: depths,
      layoutRoots: treeRoots.map(r => convert(r, 0)),
    }
  }, [treeRoots])

  const defaultCardHeight = compactTree ? 104 : 132
  const placement = useMemo(
    () =>
      layoutForest(layoutRoots, {
        cardWidth,
        compact: compactTree,
        getHeight: id => cardHeights[id] ?? defaultCardHeight,
        getMode: id => ((TREE_MODES as string[]).includes(nodeModes[id]) ? nodeModes[id] : layoutMode),
        isOpen: node => node.children.length > 0 && !collapsedIds.has(node.id),
      }),
    [layoutRoots, cardWidth, compactTree, cardHeights, defaultCardHeight, nodeModes, layoutMode, collapsedIds]
  )

  useLayoutEffect(() => {
    if (viewStyle !== 'tree') return
    const rootEl = positionedTreeRef.current
    if (!rootEl) return
    let changed = false
    const next: Record<number, number> = { ...cardHeights }
    rootEl.querySelectorAll<HTMLElement>('[data-dler-node]').forEach(el => {
      const id = Number(el.dataset.dlerNode)
      if (!id) return
      const h = el.offsetHeight
      if (h > 0 && Math.abs((next[id] ?? -1) - h) > 0.5) {
        next[id] = h
        changed = true
      }
    })
    if (changed) setCardHeights(next)
  }, [viewStyle, placement, expandedCrews, compactTree, people, allocations, cardHeights])

  const layoutViewportRef = useRef({
    zoom,
    cardWidth,
    rootId: treeRoots[0]?.person.id,
    cards: placement.cards,
  })
  layoutViewportRef.current = {
    zoom,
    cardWidth,
    rootId: treeRoots[0]?.person.id,
    cards: placement.cards,
  }

  const centerCanvas = useCallback((overrideZoom?: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { zoom: curZoom, cardWidth: cw, rootId, cards } = layoutViewportRef.current
    const z = overrideZoom ?? curZoom
    const rootCard = rootId != null ? cards.find(c => c.id === rootId) : undefined
    if (rootCard && treeContentRef.current) {
      const stageLeft =
        treeContentRef.current.getBoundingClientRect().left -
        canvas.getBoundingClientRect().left +
        canvas.scrollLeft
      const target = stageLeft + (rootCard.x + cw / 2) * (z / 100) - canvas.clientWidth / 2
      const maxScroll = Math.max(0, canvas.scrollWidth - canvas.clientWidth)
      canvas.scrollLeft = Math.max(0, Math.min(maxScroll, target))
      return
    }
    canvas.scrollLeft = Math.max(0, (canvas.scrollWidth - canvas.clientWidth) / 2)
  }, [])

  const fitToScreen = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const availableWidth = Math.max(200, canvas.clientWidth - 64)
    let naturalWidth = placement.w
    if (!naturalWidth && treeContentRef.current) {
      naturalWidth = treeContentRef.current.getBoundingClientRect().width / Math.max(0.1, zoom / 100)
    }
    if (!naturalWidth || naturalWidth <= 0) return
    const nextZoom = Math.max(30, Math.min(100, Math.floor((availableWidth / naturalWidth) * 100)))
    setZoom(nextZoom)
    requestAnimationFrame(() => requestAnimationFrame(() => centerCanvas(nextZoom)))
  }, [placement.w, zoom, centerCanvas])

  useEffect(() => {
    if (viewStyle !== 'tree') return
    const raf = requestAnimationFrame(() => centerCanvas())
    return () => cancelAnimationFrame(raf)
  }, [viewStyle, scope, selectedDeptId, selectedProjId, typeFilter, compactTree, isFullscreen, layoutMode, centerCanvas])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const p = panRef.current
      if (!p.active) return
      const dx = e.clientX - p.startX
      const dy = e.clientY - p.startY
      if (!p.moved && Math.hypot(dx, dy) > 4) {
        p.moved = true
        setIsPanning(true)
      }
      if (p.moved && canvasRef.current) {
        canvasRef.current.scrollLeft = p.scrollLeft - dx
        canvasRef.current.scrollTop = p.scrollTop - dy
      }
    }
    const onMouseUp = () => {
      if (panRef.current.active) {
        panRef.current.active = false
        panRef.current.moved = false
        setIsPanning(false)
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  useEffect(() => {
    if (viewStyle !== 'tree') return
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 10 : -10
      setZoom(z => Math.max(30, Math.min(130, z + delta)))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [viewStyle, isFullscreen])

  useEffect(() => {
    if (!isFullscreen || modalPerson || aboveModal || underModal || tagModal || bulkTagModal || printModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFullscreen, modalPerson, aboveModal, underModal, tagModal, bulkTagModal, printModal])

  async function handlePrintChart(opts: { paper: 'A3' | 'A4'; landscape: boolean; fit: 'page' | 'width' }) {
    const el = positionedTreeRef.current
    if (!el || !placement.w) return
    setPrintBusy(true)
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    if (!doc) {
      iframe.remove()
      setPrintBusy(false)
      return
    }
    const head =
      [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map(l => `<link rel="stylesheet" href="${(l as HTMLLinkElement).href}">`)
        .join('') +
      [...document.querySelectorAll('style')].map(s => s.outerHTML).join('')
    const sheet = opts.paper === 'A3' ? { w: 420, h: 297 } : { w: 297, h: 210 }
    const [pw, ph] = opts.landscape ? [sheet.w, sheet.h] : [sheet.h, sheet.w]
    const mm = (v: number) => (v * 96) / 25.4
    const availW = mm(pw - 16)
    const availH = mm(ph - 16 - 12)
    const scopeLabel =
      scope === 'department'
        ? selectedDeptId === -1
          ? 'Department: Untagged'
          : `Department: ${deptMap.get(selectedDeptId)?.name ?? ''}`
        : scope === 'project'
        ? selectedProjId === -1
          ? 'Project: Untagged'
          : `Project: ${projMap.get(selectedProjId)?.name ?? ''}`
        : 'Overall'
    const stamp = new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })
    doc.open()
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>DLER Organizational Chart</title>${head}<style>
      @page{size:${opts.paper} ${opts.landscape ? 'landscape' : 'portrait'};margin:8mm}
      html,body{background:#fff!important;margin:0;padding:0}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .dler-print-hide{display:none!important}
      #dler-pt{font:700 15px Arial,sans-serif;margin:0 0 8px;color:#0f172a}
      #dler-pt span{font-weight:400;color:#64748b;font-size:11px;margin-left:8px}
    </style></head><body><div id="dler-pt">DLER Organizational Chart<span>${scopeLabel} · ${TREE_MODE_LABEL[layoutMode]} · ${stamp}</span></div><div id="dler-tree" style="width:${placement.w}px;margin:0 auto">${el.outerHTML}</div></body></html>`)
    doc.close()

    await new Promise(r => setTimeout(r, 850))
    try {
      await doc.fonts?.ready
    } catch {
      /* fonts optional */
    }
    const treeWrap = doc.getElementById('dler-tree') as HTMLElement | null
    if (treeWrap) {
      const natW = Math.max(treeWrap.scrollWidth, placement.w)
      const natH = Math.max(treeWrap.scrollHeight, placement.h)
      const z =
        opts.fit === 'page'
          ? Math.max(0.15, Math.min(availW / natW, availH / natH, 1))
          : Math.max(0.15, Math.min(availW / natW, 1))
      ;(treeWrap.style as unknown as { zoom: string }).zoom = String(z)
    }
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setPrintBusy(false)
    setPrintModal(null)
    setTimeout(() => iframe.remove(), 60000)
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, a, input, select, textarea, label')) return
    const canvas = canvasRef.current
    if (!canvas) return
    panRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    }
  }

  function openAddModal(pt: 'STAFF' | 'WORKER', defaultParentId?: number | null, asAssistant = false) {
    setModalPerson({
      person_type: pt,
      emp_no: '',
      name: '',
      designation: '',
      department_id: scope === 'department' && selectedDeptId > 0 ? String(selectedDeptId) : '',
      reports_to_id: defaultParentId ? String(defaultParentId) : '',
      is_assistant: Boolean(defaultParentId && asAssistant),
      status: 'Active',
      remarks: '',
      profile_id: '',
      allocs: scope === 'project' && selectedProjId > 0 ? { [selectedProjId]: '100' } : {},
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
      is_assistant: Boolean(p.is_assistant),
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
          is_assistant: modalPerson.reports_to_id ? modalPerson.is_assistant : false,
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

  function handleAmendMatrixId(p: DlerPerson, el: HTMLInputElement) {
    const trimmed = el.value.trim()
    if (!trimmed) {
      el.value = p.emp_no
      return
    }
    if (trimmed === p.emp_no) return
    setFeedback(null)
    startTransition(async () => {
      try {
        await updatePersonEmpNo(p.id, trimmed)
        setFeedback({ kind: 'ok', text: `ID updated to ${trimmed}` })
        router.refresh()
      } catch (err: any) {
        el.value = p.emp_no
        setFeedback({ kind: 'err', text: err?.message ?? 'ID update failed' })
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
          {(canAddStaff || canAddWorker) && (
            <button
              type="button"
              onClick={openBulkTagModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
              title="Tag Department and/or Project splits across multiple people at once"
            >
              <Tags className="w-3.5 h-3.5" /> Bulk Tag Dept / Project
            </button>
          )}
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
            {departments.map(d => {
              const count = deptCounts.counts.get(d.id) ?? 0
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDeptId(d.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition inline-flex items-center gap-1.5 ${
                    selectedDeptId === d.id
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{d.name}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                      selectedDeptId === d.id ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setSelectedDeptId(-1)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition inline-flex items-center gap-1.5 ${
                selectedDeptId === -1
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span>Untagged</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                  selectedDeptId === -1 ? 'bg-white/20 text-white' : 'bg-amber-200/70 text-amber-900'
                }`}
              >
                {deptCounts.untagged}
              </span>
            </button>
          </div>
        )}

        {scope === 'project' && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
            {activeProjects.map(p => {
              const count = projCounts.counts.get(p.id) ?? 0
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjId(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition inline-flex items-center gap-1.5 ${
                    selectedProjId === p.id
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{p.name}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                      selectedProjId === p.id ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setSelectedProjId(-1)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition inline-flex items-center gap-1.5 ${
                selectedProjId === -1
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span>Untagged</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                  selectedProjId === -1 ? 'bg-white/20 text-white' : 'bg-amber-200/70 text-amber-900'
                }`}
              >
                {projCounts.untagged}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* VIEW 1: Visual Org Tree */}
      {viewStyle === 'tree' && (
        <div className="space-y-5">
          {isFullscreen && (
            <div
              className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px]"
              onClick={() => setIsFullscreen(false)}
            />
          )}

          {/* Card 1: Interactive Org Tree Canvas */}
          <div
            className={
              isFullscreen
                ? 'fixed inset-3 z-40 flex flex-col bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden'
                : 'bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col'
            }
          >
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <span className="text-xs text-slate-500">
                Drag background to pan · Scroll or Ctrl+Wheel to zoom · Use <strong className="text-slate-700">↑ Above</strong> / <strong className="text-slate-700">↓ Under</strong> on cards.
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                  <span>Layout</span>
                  <select
                    value={layoutMode}
                    onChange={e => setLayoutMode(e.target.value as TreeLayoutMode)}
                    aria-label="Chart layout"
                    className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white text-slate-800 font-medium"
                    title="Choose overall tree layout style (Auto Compact, Standard, Both hanging, Left hanging, Right hanging, Horizontal)"
                  >
                    {TREE_MODES.map(m => (
                      <option key={m} value={m}>
                        {TREE_MODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                  {overrideCount > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold"
                      title={`${overrideCount} branch override${overrideCount === 1 ? '' : 's'} active — change Layout to reset`}
                    >
                      +{overrideCount} branch
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setCompactTree(v => !v)}
                  className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition ${
                    compactTree
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                  }`}
                  title="Switch between Detailed and Compact cards"
                >
                  {compactTree ? 'Compact: On' : 'Compact'}
                </button>
                {unplacedStaff.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowUnplacedInTree(v => !v)}
                    className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition ${
                      showUnplacedInTree
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                    }`}
                  >
                    {showUnplacedInTree ? 'Hide Unplaced in Tree' : `Show Unplaced in Tree (${unplacedStaff.length})`}
                  </button>
                )}
                {collapsibleNodeIds.length > 0 && (
                  <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white text-xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCollapsedIds(new Set())}
                      className="px-2.5 py-1 hover:bg-slate-50 border-r border-slate-200"
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollapsedIds(new Set(collapsibleNodeIds))}
                      className="px-2.5 py-1 hover:bg-slate-50"
                    >
                      Collapse All
                    </button>
                  </div>
                )}
                <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white text-xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setZoom(z => Math.max(30, z - 10))}
                    className="px-2 py-1 hover:bg-slate-50"
                    title="Zoom Out"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 tabular-nums font-medium">{zoom}%</span>
                  <button
                    type="button"
                    onClick={() => setZoom(z => Math.min(130, z + 10))}
                    className="px-2 py-1 hover:bg-slate-50"
                    title="Zoom In"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={fitToScreen}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1"
                  title="Auto-fit full tree horizontally"
                >
                  <Scan className="w-3 h-3" /> Fit
                </button>
                <button
                  type="button"
                  onClick={() => centerCanvas()}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1"
                  title="Scroll tree back to center"
                >
                  <Crosshair className="w-3 h-3" /> Center
                </button>
                <button
                  type="button"
                  disabled={treeRoots.length === 0 || printBusy}
                  onClick={() => setPrintModal({ paper: 'A3', landscape: true, fit: 'page' })}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1 font-medium text-slate-700 disabled:opacity-40"
                  title="Print or Save Org Chart as PDF"
                >
                  <Printer className="w-3 h-3" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullscreen(v => !v)}
                  className={`px-2.5 py-1 text-xs rounded-lg border font-medium flex items-center gap-1 transition ${
                    isFullscreen
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300'
                  }`}
                  title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand Tree to Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                  {isFullscreen ? 'Exit' : 'Fullscreen'}
                </button>
              </div>
            </div>

            <div
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              className={`org-chart-canvas overflow-auto bg-slate-50 ${
                isFullscreen ? 'flex-1 min-h-0' : 'h-[68vh] min-h-[460px] max-h-[820px]'
              } ${isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
              style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '18px 18px' }}
            >
              <div className="org-chart-stage p-8">
                <div ref={treeContentRef} style={{ zoom: zoom / 100 }} className="w-max flex flex-col items-center gap-8">
                  {treeRoots.length === 0 && !(showUnplacedInTree && unplacedStaff.length > 0) ? (
                    unplacedStaff.length > 0 ? (
                      <div className="w-[min(560px,85vw)] rounded-2xl border border-dashed border-indigo-300 bg-white/95 px-6 py-8 text-center">
                        <Network className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
                        <div className="text-sm font-bold text-slate-800">No Org Tree Hierarchy Configured Yet</div>
                        <p className="text-xs text-slate-500 mt-1">
                          All {unplacedStaff.length} staff sit in the Unplaced Staff Pool below so the canvas stays tidy. Use <strong className="text-slate-700">↑ Above</strong> or <strong className="text-slate-700">↓ Under</strong> on any Staff card below — or click <strong className="text-slate-700">Show Unplaced in Tree</strong> — to build your reporting tree.
                        </p>
                      </div>
                    ) : (
                      <div className="py-16 text-center text-sm text-slate-400">
                        No org tree branches match this filter.
                      </div>
                    )
                  ) : null}

                  {treeRoots.length > 0 && (
                    <div
                      ref={positionedTreeRef}
                      className="relative"
                      style={{ width: placement.w, height: placement.h }}
                    >
                      <svg
                        width={placement.w}
                        height={placement.h}
                        className="absolute inset-0 pointer-events-none"
                        aria-hidden="true"
                      >
                        {placement.lines.map((seg, i) => (
                          <line
                            key={i}
                            x1={seg.x1}
                            y1={seg.y1}
                            x2={seg.x2}
                            y2={seg.y2}
                            stroke="#94a3b8"
                            strokeWidth={2}
                            strokeLinecap="square"
                          />
                        ))}
                      </svg>
                      {placement.cards.map(c => {
                        const node = staffNodeById.get(c.id)
                        if (!node) return null
                        return (
                          <div
                            key={c.id}
                            data-dler-node={c.id}
                            className="absolute"
                            style={{ left: c.x, top: c.y, width: cardWidth }}
                          >
                            <StaffNodeCard
                              node={node}
                              depth={depthById.get(c.id) ?? 0}
                              compact={compactTree}
                              deptMap={deptMap}
                              personAllocsList={personAllocsList}
                              collapsedIds={collapsedIds}
                              setCollapsedIds={setCollapsedIds}
                              expandedCrews={expandedCrews}
                              setExpandedCrews={setExpandedCrews}
                              canEditType={canEditType}
                              onAddChild={parentId => openAddModal(canAddStaff ? 'STAFF' : 'WORKER', parentId)}
                              onAddAssistant={parentId => openAddModal('STAFF', parentId, true)}
                              onEdit={openEditModal}
                              onAssignAbove={openAboveModal}
                              onAssignUnder={openUnderModal}
                              onTag={openTagModal}
                              scope={scope}
                              selectedProjId={selectedProjId}
                              emailOf={emailOf}
                              chartLayoutMode={layoutMode}
                              branchModeOverride={nodeModes[c.id] ?? ''}
                              onChangeBranchMode={setNodeMode}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {showUnplacedInTree && unplacedStaff.length > 0 && (
                    <div className={treeRoots.length > 0 ? 'border-t border-dashed border-slate-300 pt-6' : ''}>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3 text-center">
                        Unplaced Staff ({unplacedStaff.length})
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 justify-items-center">
                        {unplacedStaff.map(s => (
                          <StaffNodeCard
                            key={s.id}
                            node={{ person: s, staffChildren: [], workers: [] }}
                            depth={0}
                            compact={compactTree}
                            deptMap={deptMap}
                            personAllocsList={personAllocsList}
                            collapsedIds={collapsedIds}
                            setCollapsedIds={setCollapsedIds}
                            expandedCrews={expandedCrews}
                            setExpandedCrews={setExpandedCrews}
                            canEditType={canEditType}
                            onAddChild={parentId => openAddModal(canAddStaff ? 'STAFF' : 'WORKER', parentId)}
                            onAddAssistant={parentId => openAddModal('STAFF', parentId, true)}
                            onEdit={openEditModal}
                            onAssignAbove={openAboveModal}
                            onAssignUnder={openUnderModal}
                            onTag={openTagModal}
                            scope={scope}
                            selectedProjId={selectedProjId}
                            emailOf={emailOf}
                            chartLayoutMode={layoutMode}
                            branchModeOverride=""
                            onChangeBranchMode={setNodeMode}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Unplaced Staff Pool (Normal 100% Scale Outside Zoomed Canvas) */}
          {!showUnplacedInTree && unplacedStaff.length > 0 && (() => {
            const uq = unplacedQuery.trim().toLowerCase()
            const visibleUnplaced = uq
              ? unplacedStaff.filter(
                  s =>
                    s.name.toLowerCase().includes(uq) ||
                    s.emp_no.toLowerCase().includes(uq) ||
                    emailOf(s).toLowerCase().includes(uq) ||
                    (s.designation ?? '').toLowerCase().includes(uq) ||
                    (s.department_id ? deptMap.get(s.department_id)?.name.toLowerCase().includes(uq) : false)
                )
              : unplacedStaff
            return (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setUnplacedExpanded(v => !v)}
                    className="flex items-center gap-2 text-left"
                  >
                    {unplacedExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Unplaced Staff &amp; Logins ({visibleUnplaced.length}{uq ? ` of ${unplacedStaff.length}` : ''})
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Top-level staff with no manager and no subordinates yet. Assign above/under to move them into the tree.
                      </p>
                    </div>
                  </button>
                  {unplacedExpanded && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={unplacedQuery}
                        onChange={e => setUnplacedQuery(e.target.value)}
                        placeholder="Filter unplaced staff…"
                        className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white w-56"
                      />
                    </div>
                  )}
                </div>
                {unplacedExpanded && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                    {visibleUnplaced.map(s => {
                      const dept = s.department_id ? deptMap.get(s.department_id) ?? null : null
                      const sAllocs = personAllocsList(s.id)
                      const canTagStaff = canEditType('STAFF')
                      return (
                        <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 flex flex-col justify-between gap-2 hover:border-indigo-300 transition">
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <div className="text-[10px] font-mono text-slate-500 truncate">{s.emp_no} · STAFF</div>
                              {canTagStaff && (
                                <button
                                  type="button"
                                  onClick={() => openEditModal(s)}
                                  className="p-0.5 text-slate-400 hover:text-indigo-600 shrink-0"
                                  title="Edit Staff"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <div className="font-bold text-xs text-slate-900 truncate">{s.name}</div>
                            {s.designation && <div className="text-[10px] text-slate-500 truncate">{s.designation}</div>}
                            {emailOf(s) ? (
                              <div className="text-[10px] text-sky-600 truncate">{emailOf(s)}</div>
                            ) : (
                              <div className="text-[10px] text-amber-600">no login linked</div>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {canTagStaff ? (
                                <button
                                  type="button"
                                  onClick={() => openTagModal(s)}
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold transition ${
                                    dept
                                      ? `${deptTagClass(dept)} hover:brightness-95`
                                      : 'border-dashed border-slate-300 bg-white text-slate-500 hover:border-indigo-400 hover:text-indigo-700'
                                  }`}
                                  title="Click to tag Department & Projects"
                                >
                                  {dept ? dept.name : '+ Dept'}
                                </button>
                              ) : dept ? (
                                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${deptTagClass(dept)}`}>
                                  {dept.name}
                                </span>
                              ) : null}
                              {sAllocs.map(a =>
                                canTagStaff ? (
                                  <button
                                    key={a.projectId}
                                    type="button"
                                    onClick={() => openTagModal(s)}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition ${
                                      scope === 'project' && a.projectId === selectedProjId
                                        ? 'bg-sky-600 text-white'
                                        : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
                                    }`}
                                    title="Click to edit Project tags"
                                  >
                                    {a.name} {a.pct}%
                                  </button>
                                ) : (
                                  <span
                                    key={a.projectId}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                      scope === 'project' && a.projectId === selectedProjId
                                        ? 'bg-sky-600 text-white'
                                        : 'bg-sky-50 text-sky-800 border border-sky-200'
                                    }`}
                                  >
                                    {a.name} {a.pct}%
                                  </span>
                                )
                              )}
                              {canTagStaff && (
                                <button
                                  type="button"
                                  onClick={() => openTagModal(s)}
                                  className="px-1.5 py-0.5 rounded border border-dashed border-sky-300 bg-white hover:bg-sky-50 text-sky-700 text-[10px] font-semibold"
                                  title="Assign Project tag & %"
                                >
                                  + Project
                                </button>
                              )}
                            </div>
                          </div>
                          {(canEditType('STAFF') || canEditType('WORKER')) && (
                            <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200/80">
                              {canEditType('STAFF') && (
                                <button
                                  type="button"
                                  onClick={() => openAboveModal(s)}
                                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-[10px] font-semibold text-slate-700 hover:text-indigo-700"
                                  title="Assign Manager Above"
                                >
                                  <ArrowUp className="w-3 h-3" /> Above
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openUnderModal(s)}
                                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-300 text-[10px] font-semibold text-slate-700 hover:text-teal-700"
                                title="Assign Staff or Workers Under"
                              >
                                <ArrowDown className="w-3 h-3" /> Under
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {visibleUnplaced.length === 0 && (
                      <div className="col-span-full text-center py-6 text-xs text-slate-400">
                        No unplaced staff match &ldquo;{unplacedQuery}&rdquo;.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Card 3: Unassigned Workers (Normal 100% Scale Outside Zoomed Canvas) */}
          {unassignedWorkers.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-xs">
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
                    dept={w.department_id ? deptMap.get(w.department_id) ?? null : null}
                    allocs={personAllocsList(w.id)}
                    canEdit={canEditType('WORKER')}
                    onEdit={() => openEditModal(w)}
                    onAssignAbove={canEditType('WORKER') ? () => openAboveModal(w) : undefined}
                    onTag={canEditType('WORKER') ? () => openTagModal(w) : undefined}
                    highlightProjId={scope === 'project' ? selectedProjId : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: Allocation Matrix Table */}
      {viewStyle === 'matrix' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="org-chart-canvas overflow-auto max-h-[70vh]">
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
                      <td className="px-3 py-1.5 font-mono text-slate-600 whitespace-nowrap">
                        {editable ? (
                          <input
                            key={`mat-id-${p.id}-${p.emp_no}`}
                            type="text"
                            defaultValue={p.emp_no}
                            disabled={isPending}
                            aria-label={`Amend ID for ${p.name}`}
                            title="Amend ID (Enter or blur to save, Esc to revert)"
                            onBlur={e => handleAmendMatrixId(p, e.currentTarget)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                e.currentTarget.blur()
                              } else if (e.key === 'Escape') {
                                e.currentTarget.value = p.emp_no
                                e.currentTarget.blur()
                              }
                            }}
                            className="w-24 rounded border border-transparent hover:border-slate-300 focus:border-indigo-400 focus:bg-white bg-transparent px-1.5 py-0.5 text-xs font-mono text-slate-700 focus:outline-none"
                          />
                        ) : (
                          p.emp_no
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {p.is_assistant && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              ASST
                            </span>
                          )}
                        </div>
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
                          {(() => {
                            const blocked = getSelfAndDescendantIds(p.id)
                            return staffList
                              .filter(s => !blocked.has(s.id))
                              .map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))
                          })()}
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
                        <div className="inline-flex items-center gap-1">
                          {editable && (
                            <button
                              type="button"
                              onClick={() => openAboveModal(p)}
                              className="p-1 text-slate-500 hover:text-indigo-600"
                              title="Assign Manager Above"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {p.person_type === 'STAFF' && (canEditType('STAFF') || canEditType('WORKER')) && (
                            <button
                              type="button"
                              onClick={() => openUnderModal(p)}
                              className="p-1 text-slate-500 hover:text-teal-600"
                              title="Assign People Under"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {editable && (
                            <>
                              <button
                                type="button"
                                onClick={() => openTagModal(p)}
                                className="p-1 text-slate-500 hover:text-emerald-600"
                                title="Tag Department & Projects"
                              >
                                <Tag className="w-3.5 h-3.5" />
                              </button>
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
                            </>
                          )}
                        </div>
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
                <div className="block space-y-2">
                  <label className="block">
                    <span className="font-semibold text-slate-600">Reports To (Supervisor / HOD)</span>
                    <select
                      value={modalPerson.reports_to_id}
                      onChange={e =>
                        setModalPerson({
                          ...modalPerson,
                          reports_to_id: e.target.value,
                          is_assistant: e.target.value ? modalPerson.is_assistant : false,
                        })
                      }
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="">(Top level / None)</option>
                      {(() => {
                        const blocked = modalPerson.id != null ? getSelfAndDescendantIds(modalPerson.id) : null
                        return staffList
                          .filter(s => !blocked || !blocked.has(s.id))
                          .map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.emp_no})</option>
                          ))
                      })()}
                    </select>
                  </label>
                  {modalPerson.person_type === 'STAFF' && (
                    <label
                      className={`inline-flex items-center gap-2 text-xs select-none ${
                        modalPerson.reports_to_id ? 'text-purple-800 font-semibold cursor-pointer' : 'text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!modalPerson.reports_to_id}
                        checked={Boolean(modalPerson.reports_to_id && modalPerson.is_assistant)}
                        onChange={e => setModalPerson({ ...modalPerson, is_assistant: e.target.checked })}
                        className="rounded border-purple-300 text-purple-700 focus:ring-purple-500 disabled:opacity-50"
                      />
                      Assistant (side-branch seat directly under manager)
                    </label>
                  )}
                </div>
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

      {/* Assign Staff / Manager Above Modal */}
      {aboveModal && (() => {
        const livePerson = personMap.get(aboveModal.person.id) ?? aboveModal.person
        const currentManager = livePerson.reports_to_id ? personMap.get(livePerson.reports_to_id) ?? null : null
        const canInsertMode = livePerson.person_type === 'STAFF' && canEditType('STAFF')
        const effectiveMode = canInsertMode ? aboveModal.mode : 'set_manager'
        const selfAndDesc = getSelfAndDescendantIds(livePerson.id)
        const ancestors = getSelfAndAncestorIds(livePerson.id)
        const aq = aboveModal.query.trim().toLowerCase()

        const candidates = staffList.filter(s => {
          if (selfAndDesc.has(s.id)) return false
          if (effectiveMode === 'insert_above' && ancestors.has(s.id)) return false
          if (!aq) return true
          const dName = s.department_id ? deptMap.get(s.department_id)?.name ?? '' : ''
          return (
            s.name.toLowerCase().includes(aq) ||
            s.emp_no.toLowerCase().includes(aq) ||
            emailOf(s).toLowerCase().includes(aq) ||
            (s.designation ?? '').toLowerCase().includes(aq) ||
            dName.toLowerCase().includes(aq)
          )
        })

        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ArrowUp className="w-4 h-4 text-indigo-600" />
                    Assign Manager Above {livePerson.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {livePerson.emp_no} · {livePerson.person_type}
                    {livePerson.designation ? ` · ${livePerson.designation}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAboveModal(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto text-xs">
                {hierarchyError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{hierarchyError}</span>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-500">Current manager: </span>
                    {currentManager ? (
                      <strong className="text-slate-900">{currentManager.name} ({currentManager.emp_no})</strong>
                    ) : (
                      <strong className="text-slate-700">Top Level (No manager)</strong>
                    )}
                  </div>
                  {currentManager && (
                    <button
                      type="button"
                      disabled={hierarchyBusy}
                      onClick={handleDetachAbove}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-800 font-semibold disabled:opacity-50"
                    >
                      <Unlink className="w-3 h-3" /> Detach to Top Level
                    </button>
                  )}
                </div>

                {canInsertMode && (
                  <div className="space-y-1.5">
                    <div className="font-semibold text-slate-600">Assignment Mode</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAboveModal(prev => (prev ? { ...prev, mode: 'set_manager' } : null))}
                        className={`text-left p-2.5 rounded-xl border transition ${
                          effectiveMode === 'set_manager'
                            ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-bold text-slate-900">Move under manager</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Make selected Staff the manager of {livePerson.name} (selected Staff keeps their current manager).
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAboveModal(prev => (prev ? { ...prev, mode: 'insert_above' } : null))}
                        className={`text-left p-2.5 rounded-xl border transition ${
                          effectiveMode === 'insert_above'
                            ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-bold text-slate-900">Insert directly above</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Place selected Staff between {currentManager ? currentManager.name : 'Top Level'} and {livePerson.name}.
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {canAddStaff && canEditType(livePerson.person_type) && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-indigo-950">Need a new Staff seat above {livePerson.name}?</div>
                      <button
                        type="button"
                        onClick={() => setNewAboveOpen(v => !v)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> {newAboveOpen ? 'Hide Form' : 'New Staff Above'}
                      </button>
                    </div>
                    {newAboveOpen && (
                      <form onSubmit={handleCreateNewStaffAbove} className="mt-3 pt-3 border-t border-indigo-200/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className="block">
                          <span className="font-semibold text-slate-600">Emp No *</span>
                          <input
                            required
                            value={newAboveForm.emp_no}
                            onChange={e => setNewAboveForm({ ...newAboveForm, emp_no: e.target.value })}
                            placeholder="e.g. STF-090"
                            className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                          />
                        </label>
                        <label className="block">
                          <span className="font-semibold text-slate-600">Full Name *</span>
                          <input
                            required
                            value={newAboveForm.name}
                            onChange={e => setNewAboveForm({ ...newAboveForm, name: e.target.value })}
                            placeholder="Staff Name"
                            className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                          />
                        </label>
                        <label className="block">
                          <span className="font-semibold text-slate-600">Designation</span>
                          <input
                            value={newAboveForm.designation}
                            onChange={e => setNewAboveForm({ ...newAboveForm, designation: e.target.value })}
                            placeholder="e.g. HOD / Manager"
                            className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                          />
                        </label>
                        <label className="block">
                          <span className="font-semibold text-slate-600">Home Department</span>
                          <select
                            value={newAboveForm.department_id}
                            onChange={e => setNewAboveForm({ ...newAboveForm, department_id: e.target.value })}
                            className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                          >
                            <option value="">(None)</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="font-semibold text-slate-600">Link AlphaVision Login (optional)</span>
                          <select
                            value={newAboveForm.profile_id}
                            onChange={e => {
                              const pid = e.target.value
                              const login = loginById.get(pid)
                              setNewAboveForm(prev => ({
                                ...prev,
                                profile_id: pid,
                                name: !prev.name && login?.name ? login.name : prev.name,
                              }))
                            }}
                            className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                          >
                            <option value="">(No login linked)</option>
                            {logins
                              .filter(l => !linkedProfileIds.has(l.id))
                              .map(l => (
                                <option key={l.id} value={l.id}>{l.name || l.email} ({l.email})</option>
                              ))}
                          </select>
                        </label>
                        <div className="sm:col-span-2 flex items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-indigo-800">
                            Will sit {currentManager ? `under ${currentManager.name}` : 'at Top Level'} and directly above {livePerson.name}.
                          </span>
                          <button
                            type="submit"
                            disabled={hierarchyBusy}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50"
                          >
                            {hierarchyBusy ? 'Creating…' : 'Create & Place Above'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-700">Select Existing Staff ({candidates.length})</span>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={aboveModal.query}
                        onChange={e => setAboveModal(prev => (prev ? { ...prev, query: e.target.value } : null))}
                        placeholder="Search staff…"
                        className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56"
                      />
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {candidates.map(s => {
                      const mgr = s.reports_to_id ? personMap.get(s.reports_to_id) : null
                      const dName = s.department_id ? deptMap.get(s.department_id)?.name : null
                      const isCurrent = s.id === livePerson.reports_to_id
                      return (
                        <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-slate-50">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {s.name} <span className="font-mono text-[10px] text-slate-400 font-normal">({s.emp_no})</span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                              {dName && <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">{dName}</span>}
                              {emailOf(s) && <span className="text-sky-600">{emailOf(s)}</span>}
                              <span>· Currently: {mgr ? `under ${mgr.name}` : 'Top Level'}</span>
                            </div>
                          </div>
                          {isCurrent ? (
                            <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-500 font-semibold shrink-0">
                              Current Manager
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={hierarchyBusy}
                              onClick={() => handleAssignExistingAbove(s.id)}
                              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-indigo-700 text-white font-semibold shrink-0 disabled:opacity-50"
                            >
                              {effectiveMode === 'insert_above' ? 'Insert Above' : 'Move Under'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {candidates.length === 0 && (
                      <div className="text-center py-6 text-slate-400">
                        {effectiveMode === 'insert_above'
                          ? 'No eligible staff available to insert above (self, descendants, and higher chain managers are excluded).'
                          : 'No eligible staff match this search.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end px-5 py-3 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setAboveModal(null)}
                  className="px-4 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Assign People Under Modal */}
      {underModal && (() => {
        const liveManager = personMap.get(underModal.manager.id) ?? underModal.manager
        const directReports = people
          .filter(p => p.reports_to_id === liveManager.id)
          .sort((a, b) => (a.person_type === b.person_type ? a.name.localeCompare(b.name) : a.person_type === 'STAFF' ? -1 : 1))
        const directIds = new Set(directReports.map(d => d.id))
        const blockedIds = getSelfAndAncestorIds(liveManager.id)
        const uq = underModal.query.trim().toLowerCase()

        const available = people.filter(p => {
          if (blockedIds.has(p.id) || directIds.has(p.id)) return false
          if (underModal.filter === 'UNPLACED_STAFF') {
            if (p.person_type !== 'STAFF' || p.reports_to_id != null) return false
          } else if (underModal.filter === 'ALL_STAFF') {
            if (p.person_type !== 'STAFF') return false
          } else {
            if (p.person_type !== 'WORKER') return false
          }
          if (!uq) return true
          const dName = p.department_id ? deptMap.get(p.department_id)?.name ?? '' : ''
          return (
            p.name.toLowerCase().includes(uq) ||
            p.emp_no.toLowerCase().includes(uq) ||
            emailOf(p).toLowerCase().includes(uq) ||
            (p.designation ?? '').toLowerCase().includes(uq) ||
            dName.toLowerCase().includes(uq)
          )
        })

        const selectedSet = new Set(underModal.selectedIds)
        const selectableVisibleIds = available.filter(p => canEditType(p.person_type)).map(p => p.id)

        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ArrowDown className="w-4 h-4 text-teal-600" />
                    Team Reporting Under {liveManager.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {liveManager.emp_no} · {liveManager.person_type}
                    {liveManager.designation ? ` · ${liveManager.designation}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUnderModal(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto text-xs">
                {hierarchyError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{hierarchyError}</span>
                  </div>
                )}

                {/* Current Direct Reports */}
                <div className="space-y-1.5">
                  <div className="font-bold text-slate-700">Current Direct Reports ({directReports.length})</div>
                  {directReports.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-slate-400">
                      No staff or workers report directly to {liveManager.name} yet.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-40 overflow-y-auto">
                      {directReports.map(c => (
                        <div key={c.id} className="px-3 py-1.5 flex items-center justify-between gap-2 bg-slate-50/40">
                          <div className="min-w-0 flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                c.person_type === 'STAFF'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-teal-50 text-teal-700 border border-teal-200'
                              }`}
                            >
                              {c.person_type}
                            </span>
                            <span className="font-semibold text-slate-900 truncate">{c.name}</span>
                            {c.is_assistant && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                                ASST
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">{c.emp_no}</span>
                            {emailOf(c) && <span className="text-[10px] text-sky-600 truncate hidden sm:inline">{emailOf(c)}</span>}
                          </div>
                          {canEditType(c.person_type) && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {c.person_type === 'STAFF' && (
                                <button
                                  type="button"
                                  disabled={hierarchyBusy}
                                  onClick={() => handleToggleAssistant(c)}
                                  title={c.is_assistant ? 'Convert back to regular subordinate' : 'Set as Assistant seat (side branch)'}
                                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold transition disabled:opacity-50 ${
                                    c.is_assistant
                                      ? 'border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700'
                                  }`}
                                >
                                  {c.is_assistant ? 'Assistant' : 'Regular'}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={hierarchyBusy}
                                onClick={() => handleDetachChild(c)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-[10px] font-semibold shrink-0 disabled:opacity-50"
                              >
                                <Unlink className="w-3 h-3" /> Detach
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assign Existing People */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                      <button
                        type="button"
                        disabled={!canEditType('STAFF')}
                        onClick={() => setUnderModal(prev => (prev ? { ...prev, filter: 'UNPLACED_STAFF', selectedIds: [] } : null))}
                        className={`px-2.5 py-1 rounded-md font-semibold disabled:opacity-40 ${
                          underModal.filter === 'UNPLACED_STAFF' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Unplaced Staff
                      </button>
                      <button
                        type="button"
                        disabled={!canEditType('STAFF')}
                        onClick={() => setUnderModal(prev => (prev ? { ...prev, filter: 'ALL_STAFF', selectedIds: [] } : null))}
                        className={`px-2.5 py-1 rounded-md font-semibold disabled:opacity-40 ${
                          underModal.filter === 'ALL_STAFF' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        All Staff
                      </button>
                      <button
                        type="button"
                        disabled={!canEditType('WORKER')}
                        onClick={() => setUnderModal(prev => (prev ? { ...prev, filter: 'WORKERS', selectedIds: [] } : null))}
                        className={`px-2.5 py-1 rounded-md font-semibold disabled:opacity-40 ${
                          underModal.filter === 'WORKERS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Workers
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={underModal.query}
                        onChange={e => setUnderModal(prev => (prev ? { ...prev, query: e.target.value } : null))}
                        placeholder="Search name, emp no, email…"
                        className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-52"
                      />
                    </div>
                  </div>

                  {selectableVisibleIds.length > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{available.length} eligible shown · {underModal.selectedIds.length} selected</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setUnderModal(prev =>
                              prev ? { ...prev, selectedIds: Array.from(new Set([...prev.selectedIds, ...selectableVisibleIds])) } : null
                            )
                          }
                          className="text-indigo-600 hover:underline font-semibold"
                        >
                          Select all shown
                        </button>
                        {underModal.selectedIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setUnderModal(prev => (prev ? { ...prev, selectedIds: [] } : null))}
                            className="text-slate-500 hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {available.map(p => {
                      const editable = canEditType(p.person_type)
                      const checked = selectedSet.has(p.id)
                      const curSup = p.reports_to_id ? personMap.get(p.reports_to_id) : null
                      const dName = p.department_id ? deptMap.get(p.department_id)?.name : null
                      return (
                        <label
                          key={p.id}
                          className={`px-3 py-2 flex items-center justify-between gap-3 ${
                            editable ? 'cursor-pointer hover:bg-slate-50' : 'opacity-50 cursor-not-allowed'
                          } ${checked ? 'bg-teal-50/60' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              disabled={!editable}
                              checked={checked}
                              onChange={() =>
                                setUnderModal(prev => {
                                  if (!prev) return null
                                  const exists = prev.selectedIds.includes(p.id)
                                  return {
                                    ...prev,
                                    selectedIds: exists
                                      ? prev.selectedIds.filter(x => x !== p.id)
                                      : [...prev.selectedIds, p.id],
                                  }
                                })
                              }
                              className="rounded border-slate-300 text-teal-600"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">
                                {p.name} <span className="font-mono text-[10px] text-slate-400 font-normal">({p.emp_no})</span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                                {dName && <span className="px-1.5 rounded bg-slate-100 text-slate-600">{dName}</span>}
                                {emailOf(p) && <span className="text-sky-600">{emailOf(p)}</span>}
                                {curSup ? (
                                  <span className="text-amber-700">· Currently under: {curSup.name}</span>
                                ) : (
                                  <span>· Top level / Unassigned</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {checked && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
                        </label>
                      )
                    })}
                    {available.length === 0 && (
                      <div className="text-center py-6 text-slate-400">
                        No eligible people match this filter (ancestors and current direct reports are excluded).
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
                <div className="flex flex-wrap items-center gap-2">
                  {canAddStaff && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const mgrId = liveManager.id
                          setUnderModal(null)
                          openAddModal('STAFF', mgrId)
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" /> New Staff Under
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const mgrId = liveManager.id
                          setUnderModal(null)
                          openAddModal('STAFF', mgrId, true)
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-purple-200 bg-white hover:bg-purple-50 text-purple-700 text-xs font-semibold"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> New Assistant
                      </button>
                    </>
                  )}
                  {canAddWorker && (
                    <button
                      type="button"
                      onClick={() => {
                        const mgrId = liveManager.id
                        setUnderModal(null)
                        openAddModal('WORKER', mgrId)
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-200 bg-white hover:bg-teal-50 text-teal-700 text-xs font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Worker Under
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={underModal.asAssistant}
                      onChange={e => setUnderModal(prev => (prev ? { ...prev, asAssistant: e.target.checked } : null))}
                      className="rounded border-purple-300 text-purple-700 focus:ring-purple-500"
                    />
                    Assign as Assistant(s)
                  </label>
                  <button
                    type="button"
                    onClick={() => setUnderModal(null)}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={underModal.selectedIds.length === 0 || hierarchyBusy}
                    onClick={handleAssignSelectedUnder}
                    className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {hierarchyBusy
                      ? 'Assigning…'
                      : `Assign ${underModal.selectedIds.length} Selected Under ${liveManager.name}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Quick Tag Modal (Single Person or Subtree/Branch) */}
      {tagModal && (() => {
        const livePerson = personMap.get(tagModal.person.id) ?? tagModal.person
        const directIds = childrenByParent.get(livePerson.id) ?? []
        const subtreeSet = getSelfAndDescendantIds(livePerson.id)
        const subtreeSubCount = Math.max(0, subtreeSet.size - 1)
        const parsedAllocs = parseProjectAllocRows(tagModal.projectAllocs)

        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    Tag Department &amp; Projects — {livePerson.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {livePerson.emp_no} · {livePerson.person_type}
                    {livePerson.designation ? ` · ${livePerson.designation}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => setTagModal(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-5 overflow-y-auto text-xs">
                {tagError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{tagError}</span>
                  </div>
                )}

                <DepartmentTagSection
                  departments={departments}
                  selectedDeptId={tagModal.departmentId}
                  onSelect={deptId => setTagModal(prev => (prev ? { ...prev, departmentId: deptId } : null))}
                  isAdmin={role === 'admin'}
                  defaultFactoryId={defaultFactoryId}
                  onCreated={() => router.refresh()}
                />

                <ProjectTagSection
                  projects={activeProjects}
                  deptMap={deptMap}
                  departments={departments}
                  selectedDeptId={tagModal.departmentId}
                  projectAllocs={tagModal.projectAllocs}
                  onChangeAllocs={updater =>
                    setTagModal(prev => (prev ? { ...prev, projectAllocs: updater(prev.projectAllocs) } : null))
                  }
                  projQuery={tagModal.projQuery}
                  onChangeProjQuery={pq => setTagModal(prev => (prev ? { ...prev, projQuery: pq } : null))}
                  isAdmin={role === 'admin'}
                  defaultFactoryId={defaultFactoryId}
                  onCreated={() => router.refresh()}
                />

                {directIds.length > 0 && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-2.5">
                    <div className="font-bold text-indigo-950">Apply to Team Under {livePerson.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTagModal(prev => (prev ? { ...prev, cascadeScope: 'self' } : null))}
                        className={`px-2.5 py-1 rounded-lg border font-semibold transition ${
                          tagModal.cascadeScope === 'self'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Only {livePerson.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTagModal(prev => (prev ? { ...prev, cascadeScope: 'direct' } : null))}
                        className={`px-2.5 py-1 rounded-lg border font-semibold transition ${
                          tagModal.cascadeScope === 'direct'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        + Direct Reports ({directIds.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTagModal(prev => (prev ? { ...prev, cascadeScope: 'subtree' } : null))}
                        className={`px-2.5 py-1 rounded-lg border font-semibold transition ${
                          tagModal.cascadeScope === 'subtree'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        + Entire Team ({subtreeSubCount})
                      </button>
                    </div>
                    {tagModal.cascadeScope !== 'self' && (
                      <div className="flex flex-wrap items-center gap-4 pt-1">
                        <label className="inline-flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tagModal.cascadeDept}
                            onChange={e => setTagModal(prev => (prev ? { ...prev, cascadeDept: e.target.checked } : null))}
                            className="rounded border-slate-300 text-indigo-600"
                          />
                          Apply Department tag to team
                        </label>
                        <label className="inline-flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tagModal.cascadeProjects}
                            onChange={e => setTagModal(prev => (prev ? { ...prev, cascadeProjects: e.target.checked } : null))}
                            className="rounded border-slate-300 text-indigo-600"
                          />
                          Apply Project tags &amp; % to team
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setTagModal(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={tagBusy || parsedAllocs.error != null}
                  onClick={handleSaveTagModal}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {tagBusy ? 'Saving…' : 'Save Tags'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Bulk Tag Modal (Multi-select across Org Chart) */}
      {bulkTagModal && (() => {
        const bq = bulkTagModal.query.trim().toLowerCase()
        const matchingPeople = people.filter(p => {
          if (bulkTagModal.filter === 'UNTAGGED_DEPT' && p.department_id != null) return false
          if (bulkTagModal.filter === 'UNTAGGED_PROJ' && totalPctOf(p.id) > 0) return false
          if (bulkTagModal.filter === 'STAFF' && p.person_type !== 'STAFF') return false
          if (bulkTagModal.filter === 'WORKER' && p.person_type !== 'WORKER') return false
          if (!bq) return true
          const dName = p.department_id ? deptMap.get(p.department_id)?.name ?? '' : ''
          return (
            p.name.toLowerCase().includes(bq) ||
            p.emp_no.toLowerCase().includes(bq) ||
            emailOf(p).toLowerCase().includes(bq) ||
            (p.designation ?? '').toLowerCase().includes(bq) ||
            dName.toLowerCase().includes(bq)
          )
        })
        const editableVisibleIds = matchingPeople.filter(p => canEditType(p.person_type)).map(p => p.id)
        const selectedSet = new Set(bulkTagModal.selectedIds)
        const parsedAllocs = bulkTagModal.applyProjects ? parseProjectAllocRows(bulkTagModal.projectAllocs) : { rows: [], total: 0, error: null }

        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Tags className="w-4 h-4 text-emerald-600" />
                    Bulk Tag Department &amp; Projects
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select multiple Staff or Workers and apply a Department tag and/or Project % tags in one step.
                  </p>
                </div>
                <button type="button" onClick={() => setBulkTagModal(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto text-xs">
                {tagError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{tagError}</span>
                  </div>
                )}

                {/* Step 1: Filter & Select People */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                      {(
                        [
                          ['UNTAGGED_DEPT', 'Untagged Dept'],
                          ['UNTAGGED_PROJ', 'Untagged Project'],
                          ['STAFF', 'All Staff'],
                          ['WORKER', 'All Workers'],
                          ['ALL', 'All'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setBulkTagModal(prev => (prev ? { ...prev, filter: key } : null))}
                          className={`px-2.5 py-1 rounded-md font-semibold ${
                            bulkTagModal.filter === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={bulkTagModal.query}
                        onChange={e => setBulkTagModal(prev => (prev ? { ...prev, query: e.target.value } : null))}
                        placeholder="Search name, emp no, dept…"
                        className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-52"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{matchingPeople.length} shown · {bulkTagModal.selectedIds.length} selected</span>
                    <div className="flex items-center gap-2">
                      {editableVisibleIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setBulkTagModal(prev =>
                              prev
                                ? { ...prev, selectedIds: Array.from(new Set([...prev.selectedIds, ...editableVisibleIds])) }
                                : null
                            )
                          }
                          className="text-emerald-700 hover:underline font-semibold"
                        >
                          Select all shown ({editableVisibleIds.length})
                        </button>
                      )}
                      {bulkTagModal.selectedIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setBulkTagModal(prev => (prev ? { ...prev, selectedIds: [] } : null))}
                          className="text-slate-500 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {matchingPeople.map(p => {
                      const editable = canEditType(p.person_type)
                      const checked = selectedSet.has(p.id)
                      const dept = p.department_id ? deptMap.get(p.department_id) ?? null : null
                      const pAllocs = personAllocsList(p.id)
                      return (
                        <label
                          key={p.id}
                          className={`px-3 py-1.5 flex items-center justify-between gap-2 ${
                            editable ? 'cursor-pointer hover:bg-slate-50' : 'opacity-45 cursor-not-allowed'
                          } ${checked ? 'bg-emerald-50/60' : ''}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              disabled={!editable}
                              checked={checked}
                              onChange={() =>
                                setBulkTagModal(prev => {
                                  if (!prev) return null
                                  const exists = prev.selectedIds.includes(p.id)
                                  return {
                                    ...prev,
                                    selectedIds: exists
                                      ? prev.selectedIds.filter(x => x !== p.id)
                                      : [...prev.selectedIds, p.id],
                                  }
                                })
                              }
                              className="rounded border-slate-300 text-emerald-600"
                            />
                            <span
                              className={`px-1 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                p.person_type === 'STAFF'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-teal-50 text-teal-700 border border-teal-200'
                              }`}
                            >
                              {p.person_type}
                            </span>
                            <span className="font-semibold text-slate-900 truncate">{p.name}</span>
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">{p.emp_no}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${deptTagClass(dept)}`}>
                              {dept ? dept.name : 'No Dept'}
                            </span>
                            {pAllocs.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-semibold">
                                {pAllocs.map(a => `${a.name} ${a.pct}%`).join(', ')}
                              </span>
                            )}
                          </div>
                        </label>
                      )
                    })}
                    {matchingPeople.length === 0 && (
                      <div className="text-center py-6 text-slate-400">No people match this filter.</div>
                    )}
                  </div>
                </div>

                {/* Step 2: Department & Project Sections */}
                <div className="rounded-xl border border-slate-200 p-3.5 space-y-3">
                  <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkTagModal.applyDept}
                      onChange={e => setBulkTagModal(prev => (prev ? { ...prev, applyDept: e.target.checked } : null))}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    Apply Department Tag
                  </label>
                  {bulkTagModal.applyDept && (
                    <DepartmentTagSection
                      departments={departments}
                      selectedDeptId={bulkTagModal.departmentId}
                      onSelect={deptId => setBulkTagModal(prev => (prev ? { ...prev, departmentId: deptId } : null))}
                      isAdmin={role === 'admin'}
                      defaultFactoryId={defaultFactoryId}
                      onCreated={() => router.refresh()}
                    />
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 space-y-3">
                  <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkTagModal.applyProjects}
                      onChange={e => setBulkTagModal(prev => (prev ? { ...prev, applyProjects: e.target.checked } : null))}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    Apply Project Tags &amp; % Split
                  </label>
                  {bulkTagModal.applyProjects && (
                    <ProjectTagSection
                      projects={activeProjects}
                      deptMap={deptMap}
                      departments={departments}
                      selectedDeptId={bulkTagModal.applyDept ? bulkTagModal.departmentId : null}
                      projectAllocs={bulkTagModal.projectAllocs}
                      onChangeAllocs={updater =>
                        setBulkTagModal(prev => (prev ? { ...prev, projectAllocs: updater(prev.projectAllocs) } : null))
                      }
                      projQuery={bulkTagModal.projQuery}
                      onChangeProjQuery={pq => setBulkTagModal(prev => (prev ? { ...prev, projQuery: pq } : null))}
                      isAdmin={role === 'admin'}
                      defaultFactoryId={defaultFactoryId}
                      onCreated={() => router.refresh()}
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setBulkTagModal(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    tagBusy ||
                    bulkTagModal.selectedIds.length === 0 ||
                    (!bulkTagModal.applyDept && !bulkTagModal.applyProjects) ||
                    parsedAllocs.error != null
                  }
                  onClick={handleSaveBulkTagModal}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {tagBusy ? 'Applying…' : `Apply Tags to ${bulkTagModal.selectedIds.length} Selected`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {printModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Printer className="w-4 h-4 text-slate-700" />
                Print / Save as PDF
              </div>
              <button
                type="button"
                onClick={() => setPrintModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div>
                <div className="font-semibold text-slate-700 mb-1.5">Paper Size</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['A3', 'A4'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPrintModal(prev => (prev ? { ...prev, paper: p } : null))}
                      className={`py-2 px-3 rounded-xl border font-semibold transition ${
                        printModal.paper === p
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {p} {p === 'A3' ? '(Recommended)' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-700 mb-1.5">Orientation</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Landscape', value: true },
                    { label: 'Portrait', value: false },
                  ].map(opt => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setPrintModal(prev => (prev ? { ...prev, landscape: opt.value } : null))}
                      className={`py-2 px-3 rounded-xl border font-semibold transition ${
                        printModal.landscape === opt.value
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-700 mb-1.5">Fit Mode</div>
                <div className="space-y-2">
                  {[
                    {
                      value: 'page' as const,
                      title: 'Fit everything on one page',
                      desc: 'Scales the full org tree to fit cleanly on a single sheet',
                    },
                    {
                      value: 'width' as const,
                      title: 'Fit width across pages',
                      desc: 'Keeps cards larger and flows across pages vertically if tall',
                    },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPrintModal(prev => (prev ? { ...prev, fit: opt.value } : null))}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition ${
                        printModal.fit === opt.value
                          ? 'border-indigo-500 bg-indigo-50/60 text-indigo-950'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-semibold">{opt.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                Action buttons and empty +Dept/+Project placeholders are hidden in print. Enable <b>Background graphics</b> in the browser print dialog to preserve seat colors.
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrintModal(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={printBusy}
                onClick={() => handlePrintChart(printModal)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5" />
                {printBusy ? 'Preparing…' : 'Print / Save as PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StaffNodeCard({
  node,
  depth,
  compact = false,
  deptMap,
  personAllocsList,
  collapsedIds,
  setCollapsedIds,
  expandedCrews,
  setExpandedCrews,
  canEditType,
  onAddChild,
  onAddAssistant,
  onEdit,
  onAssignAbove,
  onAssignUnder,
  onTag,
  scope,
  selectedProjId,
  emailOf,
  chartLayoutMode,
  branchModeOverride,
  onChangeBranchMode,
}: {
  node: StaffNode
  depth: number
  compact?: boolean
  deptMap: Map<number, DlerDepartment>
  personAllocsList: (pid: number) => { projectId: number; name: string; pct: number }[]
  collapsedIds: Set<number>
  setCollapsedIds: React.Dispatch<React.SetStateAction<Set<number>>>
  expandedCrews: Set<number>
  setExpandedCrews: React.Dispatch<React.SetStateAction<Set<number>>>
  canEditType: (pt: 'STAFF' | 'WORKER') => boolean
  onAddChild: (parentId: number) => void
  onAddAssistant: (parentId: number) => void
  onEdit: (p: DlerPerson) => void
  onAssignAbove: (p: DlerPerson) => void
  onAssignUnder: (p: DlerPerson) => void
  onTag: (p: DlerPerson) => void
  scope: ScopeMode
  selectedProjId: number
  emailOf: (p: DlerPerson) => string
  chartLayoutMode: TreeLayoutMode
  branchModeOverride: TreeLayoutMode | ''
  onChangeBranchMode: (id: number, mode: TreeLayoutMode | '') => void
}) {
  const { person, staffChildren, workers } = node
  const isCollapsed = collapsedIds.has(person.id)
  const crewExpanded = compact
    ? expandedCrews.has(person.id)
    : expandedCrews.has(person.id) || workers.length <= 6 || scope !== 'overall'
  const allocs = personAllocsList(person.id)
  const dept = person.department_id ? deptMap.get(person.department_id) ?? null : null
  const canTagStaff = canEditType('STAFF')
  const isAsst = Boolean(person.is_assistant)
  const headerColours = ['bg-slate-900', 'bg-indigo-700', 'bg-teal-700', 'bg-cyan-700']
  const headerBg = isAsst ? 'bg-purple-700' : headerColours[depth % headerColours.length]

  return (
    <div className={`${compact ? 'w-44' : 'w-64'} rounded-xl border ${isAsst ? 'border-purple-300' : 'border-slate-300'} bg-white shadow-sm overflow-hidden`}>
      <div className={`${headerBg} text-white ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'} flex items-start justify-between gap-2`}>
        <div className="min-w-0">
          <div className="text-[10px] font-mono text-white/75 truncate">
            {person.emp_no}{compact ? (isAsst ? ' · ASST' : '') : isAsst ? ' · ASSISTANT' : ' · STAFF'}
          </div>
          <div className={`font-bold ${compact ? 'text-xs' : 'text-sm'} truncate`}>{person.name}</div>
          {!compact && person.designation && <div className="text-[11px] text-white/80 truncate">{person.designation}</div>}
          {!compact && emailOf(person) && <div className="text-[10px] text-white/70 truncate">{emailOf(person)}</div>}
        </div>
        {canEditType('STAFF') && (
          <button
            type="button"
            onClick={() => onEdit(person)}
            className="dler-print-hide p-1 rounded hover:bg-white/20 text-white/80 hover:text-white shrink-0"
            title="Edit Staff"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className={`${compact ? 'p-2 space-y-1.5' : 'p-2.5 space-y-2'} text-xs`}>
        <div className="flex flex-wrap items-center gap-1">
          {canTagStaff ? (
            <button
              type="button"
              onClick={() => onTag(person)}
              className={`px-2 py-0.5 rounded-md border font-semibold text-[10px] transition ${
                dept
                  ? `${deptTagClass(dept)} hover:brightness-95`
                  : 'dler-print-hide border-dashed border-slate-300 bg-white text-slate-500 hover:border-indigo-400 hover:text-indigo-700'
              }`}
              title="Tag Department & Projects"
            >
              {dept ? dept.name : '+ Dept'}
            </button>
          ) : (
            <span className={`px-2 py-0.5 rounded-md border font-semibold text-[10px] ${deptTagClass(dept)}`}>
              {dept?.name ?? 'No Dept'}
            </span>
          )}
          {allocs.map(a =>
            canTagStaff ? (
              <button
                key={a.projectId}
                type="button"
                onClick={() => onTag(person)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                  scope === 'project' && a.projectId === selectedProjId
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
                }`}
                title="Edit Project tags"
              >
                {a.name} {a.pct}%
              </button>
            ) : (
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
            )
          )}
          {canTagStaff && (
            <button
              type="button"
              onClick={() => onTag(person)}
              className="dler-print-hide px-1.5 py-0.5 rounded border border-dashed border-sky-300 bg-white hover:bg-sky-50 text-sky-700 text-[10px] font-semibold"
              title="Assign Project tag & %"
            >
              + Project
            </button>
          )}
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
                    dept={w.department_id ? deptMap.get(w.department_id) ?? null : null}
                    allocs={personAllocsList(w.id)}
                    canEdit={canEditType('WORKER')}
                    onEdit={() => onEdit(w)}
                    onAssignAbove={canEditType('WORKER') ? () => onAssignAbove(w) : undefined}
                    onTag={canEditType('WORKER') ? () => onTag(w) : undefined}
                    highlightProjId={scope === 'project' ? selectedProjId : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {staffChildren.length > 0 && (
          <div className="dler-print-hide flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
            {!compact && <span className="text-[10px] font-medium text-slate-400 shrink-0">Branch:</span>}
            <select
              value={branchModeOverride}
              onChange={e => onChangeBranchMode(person.id, e.target.value as TreeLayoutMode | '')}
              aria-label={`Branch layout under ${person.name}`}
              title="Layout style for children under this person"
              className={`flex-1 min-w-0 rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${
                branchModeOverride
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
              }`}
            >
              <option value="">Same as chart ({TREE_MODE_LABEL[chartLayoutMode]})</option>
              {TREE_MODES.map(m => (
                <option key={m} value={m}>
                  {TREE_MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="dler-print-hide flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-slate-100">
          <div className="flex items-center gap-1">
            {canEditType('STAFF') && (
              <button
                type="button"
                onClick={() => onAssignAbove(person)}
                className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-[10px] font-semibold text-slate-700 hover:text-indigo-700 flex items-center gap-0.5"
                title="Assign Manager Above"
              >
                <ArrowUp className="w-2.5 h-2.5" />
                {!compact && <span>Above</span>}
              </button>
            )}
            {(canEditType('STAFF') || canEditType('WORKER')) && (
              <>
                <button
                  type="button"
                  onClick={() => onAssignUnder(person)}
                  className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 text-[10px] font-semibold text-slate-700 hover:text-teal-700 flex items-center gap-0.5"
                  title="Assign Existing Staff or Workers Under"
                >
                  <ArrowDown className="w-2.5 h-2.5" />
                  {!compact && <span>Under</span>}
                </button>
                <button
                  type="button"
                  onClick={() => onAddChild(person.id)}
                  className="p-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-indigo-50 text-indigo-600"
                  title="Create New Person Directly Under"
                >
                  <Plus className="w-3 h-3" />
                </button>
                {canEditType('STAFF') && (
                  <button
                    type="button"
                    onClick={() => onAddAssistant(person.id)}
                    className="px-1 py-0.5 rounded border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] font-semibold flex items-center gap-0.5"
                    title="Create New Assistant Directly Under"
                  >
                    <UserPlus className="w-2.5 h-2.5" />
                    {!compact && <span>Asst</span>}
                  </button>
                )}
              </>
            )}
          </div>
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
              {compact ? staffChildren.length : `${staffChildren.length} sub-seats`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkerMiniCard({
  worker,
  dept,
  allocs,
  canEdit,
  onEdit,
  onAssignAbove,
  onTag,
  highlightProjId,
}: {
  worker: DlerPerson
  dept?: DlerDepartment | null
  allocs: { projectId: number; name: string; pct: number }[]
  canEdit: boolean
  onEdit: () => void
  onAssignAbove?: () => void
  onTag?: () => void
  highlightProjId?: number
}) {
  const canTagWorker = canEdit && Boolean(onTag)
  return (
    <div className="flex items-start justify-between gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
      <div className="min-w-0">
        <div className="font-semibold text-slate-800 truncate">
          <span className="font-mono text-[10px] text-slate-500 mr-1">{worker.emp_no}</span>
          {worker.name}
        </div>
        <div className="flex flex-wrap items-center gap-1 mt-0.5">
          {canTagWorker ? (
            <button
              type="button"
              onClick={onTag}
              className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold transition ${
                dept
                  ? `${deptTagClass(dept)} hover:brightness-95`
                  : 'dler-print-hide border-dashed border-slate-300 bg-white text-slate-500 hover:border-indigo-400 hover:text-indigo-700'
              }`}
              title="Tag Department & Projects"
            >
              {dept ? dept.name : '+ Dept'}
            </button>
          ) : dept ? (
            <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${deptTagClass(dept)}`}>
              {dept.name}
            </span>
          ) : null}
          {allocs.map(a =>
            canTagWorker ? (
              <button
                key={a.projectId}
                type="button"
                onClick={onTag}
                className={`text-[9px] px-1 rounded font-semibold transition ${
                  highlightProjId === a.projectId ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-800 hover:bg-sky-200'
                }`}
                title="Edit Project tags"
              >
                {a.name} {a.pct}%
              </button>
            ) : (
              <span
                key={a.projectId}
                className={`text-[9px] px-1 rounded font-semibold ${
                  highlightProjId === a.projectId ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-800'
                }`}
              >
                {a.name} {a.pct}%
              </span>
            )
          )}
          {canTagWorker && (
            <button
              type="button"
              onClick={onTag}
              className="dler-print-hide text-[9px] px-1 rounded border border-dashed border-sky-300 bg-white hover:bg-sky-50 text-sky-700 font-semibold"
              title="Assign Project tag & %"
            >
              + Project
            </button>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="dler-print-hide flex items-center gap-0.5 shrink-0">
          {onTag && (
            <button type="button" onClick={onTag} className="p-0.5 text-slate-400 hover:text-emerald-700" title="Tag Dept & Projects">
              <Tag className="w-3 h-3" />
            </button>
          )}
          {onAssignAbove && (
            <button type="button" onClick={onAssignAbove} className="p-0.5 text-slate-400 hover:text-indigo-700" title="Assign Supervisor Above">
              <ArrowUp className="w-3 h-3" />
            </button>
          )}
          <button type="button" onClick={onEdit} className="p-0.5 text-slate-400 hover:text-teal-700" title="Edit Worker & Project %">
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

function DepartmentTagSection({
  departments,
  selectedDeptId,
  onSelect,
  isAdmin,
  defaultFactoryId,
  onCreated,
}: {
  departments: DlerDepartment[]
  selectedDeptId: number | null
  onSelect: (deptId: number | null) => void
  isAdmin: boolean
  defaultFactoryId: number
  onCreated: () => void
}) {
  const [newDeptOpen, setNewDeptOpen] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptKind, setNewDeptKind] = useState<'production' | 'support'>('production')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const prodDepts = departments.filter(d => d.kind === 'production')
  const supportDepts = departments.filter(d => d.kind !== 'production')

  async function handleCreateDept() {
    if (!newDeptName.trim()) return
    setCreating(true)
    setCreateErr(null)
    try {
      await saveDlerDepartment(null, {
        name: newDeptName.trim(),
        factory_id: defaultFactoryId,
        kind: newDeptKind,
        sort_order: departments.length + 1,
      })
      setNewDeptName('')
      setNewDeptOpen(false)
      onCreated()
    } catch (err: unknown) {
      setCreateErr(err instanceof Error ? err.message : 'Failed to create department')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-slate-800 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-teal-600" />
          Department Tag
        </span>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setCreateErr(null)
              setNewDeptOpen(v => !v)
            }}
            className="text-[11px] font-semibold text-teal-700 hover:underline inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> {newDeptOpen ? 'Close New Dept' : 'New Dept'}
          </button>
        )}
      </div>

      {isAdmin && newDeptOpen && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-2.5 space-y-2">
          {createErr && <div className="text-[11px] text-rose-700 font-medium">{createErr}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              placeholder="New department name…"
              className="flex-1 min-w-[160px] border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
            />
            <select
              value={newDeptKind}
              onChange={e => setNewDeptKind(e.target.value as 'production' | 'support')}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="production">Production</option>
              <option value="support">Support</option>
            </select>
            <button
              type="button"
              disabled={creating || !newDeptName.trim()}
              onClick={handleCreateDept}
              className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {prodDepts.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Production</div>
            <div className="flex flex-wrap gap-1.5">
              {prodDepts.map(d => {
                const active = selectedDeptId === d.id
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelect(d.id)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : `${deptTagClass(d)} hover:brightness-95`
                    }`}
                  >
                    {d.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {supportDepts.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Support</div>
            <div className="flex flex-wrap gap-1.5">
              {supportDepts.map(d => {
                const active = selectedDeptId === d.id
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelect(d.id)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : `${deptTagClass(d)} hover:brightness-95`
                    }`}
                  >
                    {d.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
              selectedDeptId === null
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            (No Dept)
          </button>
        </div>
      </div>
    </div>
  )
}

function ProjectTagSection({
  projects,
  deptMap,
  departments,
  selectedDeptId,
  projectAllocs,
  onChangeAllocs,
  projQuery,
  onChangeProjQuery,
  isAdmin,
  defaultFactoryId,
  onCreated,
}: {
  projects: DlerProject[]
  deptMap: Map<number, DlerDepartment>
  departments: DlerDepartment[]
  selectedDeptId: number | null
  projectAllocs: Record<number, string>
  onChangeAllocs: (updater: (prev: Record<number, string>) => Record<number, string>) => void
  projQuery: string
  onChangeProjQuery: (q: string) => void
  isAdmin: boolean
  defaultFactoryId: number
  onCreated: () => void
}) {
  const [newProjOpen, setNewProjOpen] = useState(false)
  const [newProjName, setNewProjName] = useState('')
  const [newProjDeptId, setNewProjDeptId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const pq = projQuery.trim().toLowerCase()
  const sortedProjects = [...projects]
    .filter(pr => {
      if (!pq) return true
      const dName = pr.department_id ? deptMap.get(pr.department_id)?.name ?? '' : ''
      return pr.name.toLowerCase().includes(pq) || dName.toLowerCase().includes(pq)
    })
    .sort((a, b) => {
      const aMatch = selectedDeptId != null && a.department_id === selectedDeptId ? 0 : 1
      const bMatch = selectedDeptId != null && b.department_id === selectedDeptId ? 0 : 1
      if (aMatch !== bMatch) return aMatch - bMatch
      return a.name.localeCompare(b.name)
    })

  const activeSelectedProjects = projects.filter(pr =>
    Object.prototype.hasOwnProperty.call(projectAllocs, pr.id)
  )
  const total = Object.values(projectAllocs).reduce((sum, v) => sum + (Number(v) || 0), 0)
  const roundedTotal = Math.round(total * 100) / 100

  async function handleCreateProj() {
    if (!newProjName.trim()) return
    setCreating(true)
    setCreateErr(null)
    try {
      await saveDlerProject(null, {
        name: newProjName.trim(),
        factory_id: defaultFactoryId,
        department_id: newProjDeptId ? Number(newProjDeptId) : null,
        status: 'Active',
      })
      setNewProjName('')
      setNewProjOpen(false)
      onCreated()
    } catch (err: unknown) {
      setCreateErr(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <FolderKanban className="w-3.5 h-3.5 text-sky-600" />
            Project Tags &amp; % Split
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
              roundedTotal === 100
                ? 'bg-emerald-100 text-emerald-800'
                : roundedTotal > 100
                ? 'bg-rose-100 text-rose-800'
                : roundedTotal > 0
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            Total: {roundedTotal}%
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeSelectedProjects.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => onChangeAllocs(splitProjectsEvenlyMap)}
                className="text-[11px] font-semibold text-sky-700 hover:underline"
              >
                Split Evenly
              </button>
              <button
                type="button"
                onClick={() => onChangeAllocs(() => ({}))}
                className="text-[11px] font-semibold text-slate-500 hover:underline"
              >
                Clear All
              </button>
            </>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setCreateErr(null)
                setNewProjDeptId(selectedDeptId != null ? String(selectedDeptId) : '')
                setNewProjOpen(v => !v)
              }}
              className="text-[11px] font-semibold text-sky-700 hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> {newProjOpen ? 'Close New Project' : 'New Project'}
            </button>
          )}
        </div>
      </div>

      {isAdmin && newProjOpen && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-2.5 space-y-2">
          {createErr && <div className="text-[11px] text-rose-700 font-medium">{createErr}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newProjName}
              onChange={e => setNewProjName(e.target.value)}
              placeholder="New project name…"
              className="flex-1 min-w-[160px] border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
            />
            <select
              value={newProjDeptId}
              onChange={e => setNewProjDeptId(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">(No linked dept)</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={creating || !newProjName.trim()}
              onClick={handleCreateProj}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={projQuery}
          onChange={e => onChangeProjQuery(e.target.value)}
          placeholder="Search active projects…"
          className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-full sm:w-64 bg-white"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {sortedProjects.map(pr => {
          const active = Object.prototype.hasOwnProperty.call(projectAllocs, pr.id)
          const matchesDept = selectedDeptId != null && pr.department_id === selectedDeptId
          return (
            <button
              key={pr.id}
              type="button"
              onClick={() => onChangeAllocs(prev => toggleProjectTagMap(prev, pr.id))}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition inline-flex items-center gap-1 ${
                active
                  ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                  : matchesDept
                  ? 'bg-sky-50/70 text-sky-900 border-sky-300 ring-1 ring-teal-300 hover:bg-sky-100'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400 hover:bg-sky-50'
              }`}
            >
              {active && <Check className="w-3 h-3" />}
              <span>{pr.name}</span>
            </button>
          )
        })}
        {sortedProjects.length === 0 && (
          <span className="text-[11px] text-slate-400">No active projects match &ldquo;{projQuery}&rdquo;.</span>
        )}
      </div>

      {activeSelectedProjects.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-2.5 flex flex-wrap gap-2">
          {activeSelectedProjects.map(pr => (
            <div
              key={pr.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2 py-1 text-xs"
            >
              <span className="font-semibold text-slate-800">{pr.name}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={projectAllocs[pr.id] ?? ''}
                onChange={e => {
                  const val = e.target.value
                  onChangeAllocs(prev => ({ ...prev, [pr.id]: val }))
                }}
                className="w-14 text-right border border-slate-300 rounded px-1.5 py-0.5 text-xs tabular-nums"
              />
              <span className="text-slate-400">%</span>
              <button
                type="button"
                onClick={() =>
                  onChangeAllocs(prev => {
                    const next = { ...prev }
                    delete next[pr.id]
                    return next
                  })
                }
                className="text-slate-400 hover:text-rose-600 ml-0.5"
                title="Remove project tag"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
