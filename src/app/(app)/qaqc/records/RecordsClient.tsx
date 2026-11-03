'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  Search, Plus, FileSpreadsheet, Download, Trash2, Edit3,
  Calendar, CheckCircle2, Clock, ArrowUpDown, Check, X,
  Receipt, FileCheck, Layers, Sparkles, ListCollapse,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, Filter, RotateCcw,
  SlidersHorizontal
} from 'lucide-react'
import PasteExcelModal, { downloadQaqcTemplate } from './PasteExcelModal'
import TestFormModal from './TestFormModal'
import { BatchPoModal, BatchInvoiceModal } from './BatchModals'
import { deleteQaqcTest, updateQaqcTest } from '../actions'

export type QaqcTestRecord = {
  id: number
  running_no: string
  project: string
  supplier: string
  marking: string | null
  test_type: string
  qty?: number | null
  unit?: string | null
  date_cast: string | null
  date_test: string
  report_no: string | null
  email_date: string | null
  qaqc_remarks: string | null
  po_no: string | null
  po_date: string | null
  po_amount: number | null
  purchaser_remarks: string | null
  invoice_no: string | null
  invoice_date: string | null
  invoice_amount: number | null
  cn_no?: string | null
  cn_date?: string | null
  cn_amount?: number | null
  cn_remarks?: string | null
  payment_status: 'Pending' | 'Paid' | 'Partially Paid' | 'Void'
  payment_date: string | null
  account_remarks: string | null
  created_at: string
}

interface Props {
  initialTests: QaqcTestRecord[]
  userRole: string
  knownProjects: string[]
  knownSuppliers: string[]
  knownTestTypes: string[]
}

function fmtRm(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '-'
  return `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface ColumnFilters {
  running_no: string
  project: string
  supplier: string
  marking: string
  test_type: string
  date_test: string
  date_year: string
  report_status: '' | 'has_report' | 'pending_report' | 'has_email' | 'pending_email'
  report_text: string
  po_status: '' | 'has_po' | 'pending_po' | 'multi_po'
  po_text: string
  invoice_status: '' | 'has_invoice' | 'pending_invoice' | 'has_cn' | 'multi_inv'
  invoice_text: string
  payment_status: '' | 'Pending' | 'Paid' | 'Partially Paid' | 'Void'
}

export const initialFilters: ColumnFilters = {
  running_no: '',
  project: '',
  supplier: '',
  marking: '',
  test_type: '',
  date_test: '',
  date_year: '',
  report_status: '',
  report_text: '',
  po_status: '',
  po_text: '',
  invoice_status: '',
  invoice_text: '',
  payment_status: '',
}

interface ColumnHeaderCellProps {
  title: string
  colId: string
  sortKey: string
  currentSortKey: string
  currentSortDir: 'asc' | 'desc'
  onSort: (key: any, dir?: 'asc' | 'desc') => void
  secondarySortKey?: string
  secondarySortLabel?: string
  isFiltered: boolean
  isPopoverOpen: boolean
  onTogglePopover: () => void
  onClosePopover: () => void
  onClearFilter?: () => void
  alignRight?: boolean
  className?: string
  bgClass?: string
  compact?: boolean
  popoverRef?: React.RefObject<HTMLDivElement | null>
  children?: React.ReactNode
}

function ColumnHeaderCell({
  title,
  colId,
  sortKey,
  currentSortKey,
  currentSortDir,
  onSort,
  secondarySortKey,
  secondarySortLabel,
  isFiltered,
  isPopoverOpen,
  onTogglePopover,
  onClosePopover,
  onClearFilter,
  alignRight = false,
  className = '',
  bgClass = 'bg-slate-100',
  compact = true,
  popoverRef,
  children,
}: ColumnHeaderCellProps) {
  const isSorted = currentSortKey === sortKey
  const isSecSorted = secondarySortKey && currentSortKey === secondarySortKey

  return (
    <th
      scope="col"
      className={`sticky top-0 z-30 ${bgClass} ${compact ? 'py-1 px-1.5' : 'py-2 px-2.5'} select-none relative ${className} ${
        isFiltered ? 'bg-indigo-50/95 ring-1 ring-inset ring-indigo-400 font-black' : ''
      }`}
      aria-sort={isSorted ? (currentSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <div className="flex items-center justify-between gap-1">
        {/* Sort Trigger Button */}
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className="flex items-center gap-1 font-bold text-left hover:text-indigo-600 transition truncate cursor-pointer group"
          title={`Click to sort by ${title} (${isSorted && currentSortDir === 'asc' ? 'Descending' : 'Ascending'})`}
        >
          <span className="truncate">{title}</span>
          {isSorted ? (
            currentSortDir === 'asc' ? (
              <ArrowUp className="w-3 h-3 text-indigo-600 shrink-0 font-bold" />
            ) : (
              <ArrowDown className="w-3 h-3 text-indigo-600 shrink-0 font-bold" />
            )
          ) : isSecSorted ? (
            currentSortDir === 'asc' ? (
              <ArrowUp className="w-3 h-3 text-indigo-500 shrink-0 font-bold" />
            ) : (
              <ArrowDown className="w-3 h-3 text-indigo-500 shrink-0 font-bold" />
            )
          ) : (
            <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-30 group-hover:opacity-100 shrink-0" />
          )}
        </button>

        {/* Filter Trigger Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onTogglePopover()
          }}
          className={`p-1 rounded transition shrink-0 cursor-pointer ${
            isFiltered
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/80'
          }`}
          title={`Filter ${title}${isFiltered ? ' (Active filter)' : ''}`}
        >
          <Filter className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Floating Filter Popover */}
      {isPopoverOpen && (
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full ${alignRight ? 'right-0' : 'left-0'} mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 min-w-[260px] text-xs font-normal normal-case text-slate-700 animate-in fade-in zoom-in-95 duration-100`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              {title}
            </span>
            <button
              type="button"
              onClick={onClosePopover}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Sort Options */}
          <div className="space-y-1 mb-2.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sort</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onSort(sortKey, 'asc')}
                className={`flex items-center justify-center gap-1 py-1 px-2 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                  isSorted && currentSortDir === 'asc'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <ArrowUp className="w-3 h-3 text-indigo-600" /> Ascending
              </button>
              <button
                type="button"
                onClick={() => onSort(sortKey, 'desc')}
                className={`flex items-center justify-center gap-1 py-1 px-2 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                  isSorted && currentSortDir === 'desc'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <ArrowDown className="w-3 h-3 text-indigo-600" /> Descending
              </button>
            </div>
            {secondarySortKey && (
              <button
                type="button"
                onClick={() => onSort(secondarySortKey)}
                className={`w-full mt-1 py-1 px-2 rounded-lg border text-[11px] font-medium transition flex items-center justify-center gap-1 cursor-pointer ${
                  isSecSorted
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                Sort by {secondarySortLabel || secondarySortKey}
              </button>
            )}
          </div>

          {/* Filter Section */}
          {children && (
            <div className="border-t border-slate-100 pt-2 mb-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Filter by {title}</div>
              {children}
            </div>
          )}

          {/* Popover Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
            {isFiltered && onClearFilter ? (
              <button
                type="button"
                onClick={() => {
                  onClearFilter()
                  onClosePopover()
                }}
                className="text-red-600 hover:text-red-700 font-semibold cursor-pointer underline"
              >
                Clear filter
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={onClosePopover}
              className="text-slate-600 hover:text-slate-900 font-medium px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 transition cursor-pointer ml-auto"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </th>
  )
}

export default function RecordsClient({
  initialTests,
  userRole,
  knownProjects,
  knownSuppliers,
  knownTestTypes,
}: Props) {
  const [tests, setTests] = useState<QaqcTestRecord[]>(initialTests)
  const [tab, setTab] = useState<'all' | 'need_po' | 'need_inv' | 'has_cn' | 'unpaid' | 'paid'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [colFilters, setColFilters] = useState<ColumnFilters>(initialFilters)
  const [showFilterRow, setShowFilterRow] = useState(true)
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<keyof QaqcTestRecord | 'po_amount' | 'invoice_amount' | 'cn_amount'>('date_test')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenFilterCol(null)
      }
    }
    if (openFilterCol) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openFilterCol])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (colFilters.running_no) count++
    if (colFilters.project) count++
    if (colFilters.supplier) count++
    if (colFilters.marking) count++
    if (colFilters.test_type) count++
    if (colFilters.date_test || colFilters.date_year) count++
    if (colFilters.report_status || colFilters.report_text) count++
    if (colFilters.po_status || colFilters.po_text) count++
    if (colFilters.invoice_status || colFilters.invoice_text) count++
    if (colFilters.payment_status) count++
    return count
  }, [colFilters])

  const resetAllFilters = () => {
    setColFilters(initialFilters)
    setSearchTerm('')
    setOpenFilterCol(null)
  }

  // Multi-selection for batch operations
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  // Modals
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isBatchPoOpen, setIsBatchPoOpen] = useState(false)
  const [isBatchInvoiceOpen, setIsBatchInvoiceOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<QaqcTestRecord | null>(null)

  // Saved cell animation tracker: key is `${rowId}-${field}`
  const [savedCell, setSavedCell] = useState<string | null>(null)
  const [isCompact, setIsCompact] = useState(true)
  const [showMetrics, setShowMetrics] = useState(true)

  const isSuper = userRole === 'admin' || userRole === 'manager'
  const canEditQaqc = isSuper || userRole === 'qaqc'
  const canEditPurchaser = isSuper || userRole === 'purchaser'
  const canEditAccount = isSuper || userRole === 'account'

  // Distinct master lists
  const allProjects = useMemo(() => {
    return Array.from(new Set([...knownProjects, ...tests.map(t => t.project)])).filter(Boolean).sort()
  }, [knownProjects, tests])

  const allSuppliers = useMemo(() => {
    return Array.from(new Set([...knownSuppliers, ...tests.map(t => t.supplier)])).filter(Boolean).sort()
  }, [knownSuppliers, tests])

  const allTestTypes = useMemo(() => {
    return Array.from(new Set([...knownTestTypes, ...tests.map(t => t.test_type)])).filter(Boolean).sort()
  }, [knownTestTypes, tests])

  const allYears = useMemo(() => {
    const years = tests.map(t => t.date_test?.slice(0, 4)).filter(Boolean)
    return Array.from(new Set(years)).sort().reverse()
  }, [tests])

  // Distinct PO and Invoice numbers for auto-completion
  const existingPoList = useMemo(() => {
    return Array.from(new Set(tests.map(t => t.po_no?.trim()).filter(Boolean))) as string[]
  }, [tests])

  const existingInvList = useMemo(() => {
    return Array.from(new Set(tests.map(t => t.invoice_no?.trim()).filter(Boolean))) as string[]
  }, [tests])

  // Multi-test coverage counters: how many tests share each PO / Invoice
  const poCoverageMap = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const t of tests) {
      if (t.po_no) {
        const cur = map.get(t.po_no) || { count: 0, total: 0 }
        cur.count += 1
        cur.total += Number(t.po_amount) || 0
        map.set(t.po_no, cur)
      }
    }
    return map
  }, [tests])

  const invCoverageMap = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const t of tests) {
      if (t.invoice_no) {
        const cur = map.get(t.invoice_no) || { count: 0, total: 0 }
        cur.count += 1
        cur.total += Number(t.invoice_amount) || 0
        map.set(t.invoice_no, cur)
      }
    }
    return map
  }, [tests])

  // Direct Inline Save
  const handleInlineSave = async (id: number, field: keyof QaqcTestRecord, rawVal: any) => {
    const target = tests.find(t => t.id === id)
    if (!target) return

    let finalVal = rawVal
    if (field === 'po_amount' || field === 'invoice_amount' || field === 'cn_amount' || field === 'qty') {
      if (rawVal === '' || rawVal === null || rawVal === undefined) {
        finalVal = field === 'qty' ? 1 : null
      } else {
        const num = Number(String(rawVal).replace(/[^0-9.]/g, ''))
        finalVal = isNaN(num) ? (field === 'qty' ? 1 : null) : num
      }
    } else if (typeof rawVal === 'string') {
      finalVal = rawVal.trim() || null
    }

    // Skip if unchanged
    if (target[field] === finalVal) return

    // Optimistic update
    setTests(prev => prev.map(t => (t.id === id ? { ...t, [field]: finalVal } : t)))

    try {
      await updateQaqcTest(id, { [field]: finalVal })
      const cellKey = `${id}-${String(field)}`
      setSavedCell(cellKey)
      setTimeout(() => setSavedCell(cur => (cur === cellKey ? null : cur)), 1800)
    } catch (err: any) {
      alert(`Could not save change: ${err.message || 'Error occurred'}`)
      // Revert
      setTests(prev => prev.map(t => (t.id === id ? target : t)))
    }
  }

  // Filtering
  const filtered = useMemo(() => {
    const s = searchTerm.trim().toLowerCase()
    return tests.filter(item => {
      // Tab filter
      if (tab === 'need_po' && item.po_no) return false
      if (tab === 'need_inv' && (!item.po_no || item.invoice_no)) return false
      if (tab === 'has_cn' && (!item.cn_no && (!item.cn_amount || item.cn_amount <= 0))) return false
      if (tab === 'unpaid' && (!item.invoice_no || item.payment_status === 'Paid')) return false
      if (tab === 'paid' && item.payment_status !== 'Paid') return false

      // Global search term
      if (s) {
        const hay = [
          item.running_no, item.project, item.supplier, item.marking,
          item.test_type, item.report_no, item.po_no, item.invoice_no,
          item.cn_no, item.cn_remarks, item.unit, item.qaqc_remarks, item.purchaser_remarks, item.account_remarks
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }

      // Column-level filters
      if (colFilters.running_no && !item.running_no.toLowerCase().includes(colFilters.running_no.toLowerCase())) {
        return false
      }
      if (colFilters.project && item.project !== colFilters.project) {
        return false
      }
      if (colFilters.supplier && item.supplier !== colFilters.supplier) {
        return false
      }
      if (colFilters.marking && !(item.marking || '').toLowerCase().includes(colFilters.marking.toLowerCase())) {
        return false
      }
      if (colFilters.test_type && item.test_type !== colFilters.test_type) {
        return false
      }
      if (colFilters.date_test && !item.date_test.includes(colFilters.date_test)) {
        return false
      }
      if (colFilters.date_year && !item.date_test.startsWith(colFilters.date_year)) {
        return false
      }

      // Report & Email
      if (colFilters.report_text) {
        const txt = colFilters.report_text.toLowerCase()
        const rep = (item.report_no || '').toLowerCase()
        const email = (item.email_date || '').toLowerCase()
        const rem = (item.qaqc_remarks || '').toLowerCase()
        if (!rep.includes(txt) && !email.includes(txt) && !rem.includes(txt)) return false
      }
      if (colFilters.report_status === 'has_report' && !item.report_no) return false
      if (colFilters.report_status === 'pending_report' && item.report_no) return false
      if (colFilters.report_status === 'has_email' && !item.email_date) return false
      if (colFilters.report_status === 'pending_email' && item.email_date) return false

      // Purchaser PO
      if (colFilters.po_text) {
        const txt = colFilters.po_text.toLowerCase()
        const po = (item.po_no || '').toLowerCase()
        const rem = (item.purchaser_remarks || '').toLowerCase()
        if (!po.includes(txt) && !rem.includes(txt)) return false
      }
      if (colFilters.po_status === 'has_po' && !item.po_no) return false
      if (colFilters.po_status === 'pending_po' && item.po_no) return false
      if (colFilters.po_status === 'multi_po') {
        const cov = item.po_no ? poCoverageMap.get(item.po_no) : null
        if (!cov || cov.count <= 1) return false
      }

      // Invoice & CN
      if (colFilters.invoice_text) {
        const txt = colFilters.invoice_text.toLowerCase()
        const inv = (item.invoice_no || '').toLowerCase()
        const cn = (item.cn_no || '').toLowerCase()
        const rem = (item.cn_remarks || '').toLowerCase()
        if (!inv.includes(txt) && !cn.includes(txt) && !rem.includes(txt)) return false
      }
      if (colFilters.invoice_status === 'has_invoice' && !item.invoice_no) return false
      if (colFilters.invoice_status === 'pending_invoice' && item.invoice_no) return false
      if (colFilters.invoice_status === 'has_cn' && !item.cn_no && (!item.cn_amount || item.cn_amount <= 0)) return false
      if (colFilters.invoice_status === 'multi_inv') {
        const cov = item.invoice_no ? invCoverageMap.get(item.invoice_no) : null
        if (!cov || cov.count <= 1) return false
      }

      // Payment Status
      if (colFilters.payment_status && item.payment_status !== colFilters.payment_status) {
        return false
      }

      return true
    })
  }, [tests, tab, searchTerm, colFilters, poCoverageMap, invCoverageMap])

  // Sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: any = a[sortKey as keyof QaqcTestRecord]
      let bVal: any = b[sortKey as keyof QaqcTestRecord]

      if (
        sortKey === 'po_amount' ||
        sortKey === 'invoice_amount' ||
        sortKey === 'cn_amount' ||
        sortKey === 'qty'
      ) {
        aVal = Number(aVal) || 0
        bVal = Number(bVal) || 0
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }

      if (
        sortKey === 'date_test' ||
        sortKey === 'date_cast' ||
        sortKey === 'email_date' ||
        sortKey === 'po_date' ||
        sortKey === 'invoice_date' ||
        sortKey === 'payment_date'
      ) {
        const aTime = aVal ? new Date(aVal).getTime() : 0
        const bTime = bVal ? new Date(bVal).getTime() : 0
        return sortDir === 'asc' ? aTime - bTime : bTime - aTime
      }

      if (sortKey === 'payment_status') {
        const rank: Record<string, number> = {
          Pending: 1,
          'Partially Paid': 2,
          Paid: 3,
          Void: 4,
        }
        const aRank = rank[a.payment_status] || 99
        const bRank = rank[b.payment_status] || 99
        if (aRank !== bRank) {
          return sortDir === 'asc' ? aRank - bRank : bRank - aRank
        }
      }

      const aStr = String(aVal || '').trim()
      const bStr = String(bVal || '').trim()
      const res = aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? res : -res
    })
  }, [filtered, sortKey, sortDir])

  const handleSort = (
    key: keyof QaqcTestRecord | 'po_amount' | 'invoice_amount' | 'cn_amount',
    dir?: 'asc' | 'desc'
  ) => {
    if (dir) {
      setSortKey(key as any)
      setSortDir(dir)
    } else if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key as any)
      setSortDir('asc')
    }
  }

  // Multi-selection helpers
  const isAllSelected = sorted.length > 0 && sorted.every(t => selectedIds.includes(t.id))
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(sorted.map(t => t.id))
    }
  }
  const toggleSelectRow = (id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const selectedTests = useMemo(() => {
    return tests.filter(t => selectedIds.includes(t.id))
  }, [tests, selectedIds])

  // Summary Metrics for currently filtered records
  const summary = useMemo(() => {
    const totalCount = sorted.length
    const totalPo = sorted.reduce((sum, r) => sum + (Number(r.po_amount) || 0), 0)
    const rawInv = sorted.reduce((sum, r) => sum + (Number(r.invoice_amount) || 0), 0)
    const totalCn = sorted.reduce((sum, r) => sum + (Number(r.cn_amount) || 0), 0)
    const netInv = Math.max(0, rawInv - totalCn)
    const totalPaid = sorted
      .filter(r => r.payment_status === 'Paid')
      .reduce((sum, r) => sum + Math.max(0, (Number(r.invoice_amount) || 0) - (Number(r.cn_amount) || 0)), 0)
    const awaitingPoCount = sorted.filter(r => !r.po_no).length
    const awaitingInvCount = sorted.filter(r => r.po_no && !r.invoice_no).length
    const cnCount = sorted.filter(r => r.cn_no || r.cn_amount).length
    return { totalCount, totalPo, rawInv, totalCn, netInv, totalPaid, awaitingPoCount, awaitingInvCount, cnCount }
  }, [sorted])

  const handleDelete = async (id: number, runningNo: string) => {
    if (!confirm(`Are you sure you want to delete test record ${runningNo}?`)) return
    try {
      await deleteQaqcTest(id)
      setTests(prev => prev.filter(t => t.id !== id))
      setSelectedIds(prev => prev.filter(x => x !== id))
    } catch (err: any) {
      alert('Delete failed: ' + err.message)
    }
  }

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Running No', 'Project', 'Supplier', 'Marking', 'Test Type',
      'Quantity', 'Unit', 'Date Cast', 'Date Tested', 'Report No', 'Email Date', 'QAQC Remarks',
      'PO No', 'PO Date', 'PO Amount (RM)', 'Purchaser Remarks',
      'Invoice No', 'Invoice Date', 'Invoice Amount (RM)',
      'CN No', 'CN Date', 'CN Amount (RM)', 'Net Billed (RM)', 'CN Remarks',
      'Payment Status', 'Payment Date', 'Account Remarks',
    ]

    const rows = sorted.map(r => {
      const inv = Number(r.invoice_amount) || 0
      const cn = Number(r.cn_amount) || 0
      const net = inv > 0 ? Math.max(0, inv - cn) : ''
      return [
        r.running_no, r.project, r.supplier, r.marking || '', r.test_type,
        r.qty ?? 1, r.unit || 'nos',
        r.date_cast || '', r.date_test, r.report_no || '', r.email_date || '', r.qaqc_remarks || '',
        r.po_no || '', r.po_date || '', r.po_amount ?? '', r.purchaser_remarks || '',
        r.invoice_no || '', r.invoice_date || '', r.invoice_amount ?? '',
        r.cn_no || '', r.cn_date || '', r.cn_amount ?? '', net, r.cn_remarks || '',
        r.payment_status, r.payment_date || '', r.account_remarks || '',
      ]
    })

    const csvContent = '\uFEFF' + [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `QAQC_Records_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-3">
      {/* Top Banner & Metric Summary Header */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Financial & Test Summary</span>
        <button
          type="button"
          onClick={() => setShowMetrics(!showMetrics)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 transition"
        >
          {showMetrics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showMetrics ? 'Collapse Summary' : 'Show 7 Metric Cards'}
        </button>
      </div>

      {showMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total Tests</span>
            <span className="text-lg font-bold text-slate-800">{summary.totalCount}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Awaiting PO</span>
            <span className={`text-lg font-bold ${summary.awaitingPoCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {summary.awaitingPoCount}
            </span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Awaiting Invoice</span>
            <span className={`text-lg font-bold ${summary.awaitingInvCount > 0 ? 'text-indigo-600' : 'text-slate-800'}`}>
              {summary.awaitingInvCount}
            </span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total PO Spend</span>
            <span className="text-lg font-bold text-slate-800">{fmtRm(summary.totalPo)}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Net Invoiced</span>
            <span className="text-lg font-bold text-emerald-700">{fmtRm(summary.netInv)}</span>
            {summary.totalCn > 0 && (
              <span className="text-[9px] text-emerald-600 block">Gross {fmtRm(summary.rawInv)}</span>
            )}
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-emerald-100 bg-emerald-50/30 shadow-2xs">
            <span className="text-[10px] font-semibold text-emerald-800 uppercase block">CN Adjustments</span>
            <span className="text-lg font-bold text-emerald-800">
              {summary.totalCn > 0 ? `-${fmtRm(summary.totalCn)}` : 'RM 0.00'}
            </span>
            <span className="text-[9px] text-slate-500 block">{summary.cnCount} credit notes</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total Paid</span>
            <span className="text-lg font-bold text-emerald-600">{fmtRm(summary.totalPaid)}</span>
          </div>
        </div>
      )}

      {/* Filter Tabs & Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-3">
        {/* Tabs & Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap gap-1">
            {[
              { key: 'all', label: 'All Records' },
              { key: 'need_po', label: '🟡 Awaiting PO' },
              { key: 'need_inv', label: '🟣 Awaiting Invoice' },
              { key: 'has_cn', label: '🏷️ Has Credit Note' },
              { key: 'unpaid', label: '🔴 Unpaid Invoices' },
              { key: 'paid', label: '🟢 Paid' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === t.key
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Density Toggle Button */}
            <button
              type="button"
              onClick={() => setIsCompact(!isCompact)}
              className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-2xs cursor-pointer ${
                isCompact
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
              }`}
              title={isCompact ? 'Compact view active (shows more lines). Click for comfortable view.' : 'Click to enable compact view (see more lines)'}
            >
              <ListCollapse className="w-3.5 h-3.5" />
              <span>{isCompact ? 'Compact' : 'Comfortable'}</span>
            </button>

            {/* Filter Row Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFilterRow(!showFilterRow)}
              className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-2xs cursor-pointer ${
                showFilterRow
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
              }`}
              title={showFilterRow ? 'Hide column quick filter row' : 'Show column quick filter row'}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
              <span>Filter Row</span>
              {activeFilterCount > 0 && (
                <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center ml-0.5">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              onClick={downloadQaqcTemplate}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-2xs cursor-pointer"
              title="Download Excel / CSV template for bulk importing"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              Template
            </button>
            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              Paste from Excel
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition shadow-2xs cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Export
            </button>
            <button
              onClick={() => { setEditingRecord(null); setIsFormModalOpen(true) }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Test
            </button>
          </div>
        </div>

        {/* Search & Select Filters */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search running no, report, PO, invoice, CN, lab..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white text-xs"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select
            value={colFilters.project}
            onChange={e => setColFilters(f => ({ ...f, project: e.target.value }))}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700"
          >
            <option value="">All Projects</option>
            {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={colFilters.supplier}
            onChange={e => setColFilters(f => ({ ...f, supplier: e.target.value }))}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 max-w-[160px] truncate"
          >
            <option value="">All Suppliers</option>
            {allSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={colFilters.test_type}
            onChange={e => setColFilters(f => ({ ...f, test_type: e.target.value }))}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 max-w-[160px] truncate"
          >
            <option value="">All Test Types</option>
            {allTestTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={colFilters.date_year}
            onChange={e => setColFilters(f => ({ ...f, date_year: e.target.value }))}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700"
          >
            <option value="">All Years</option>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <span className="text-slate-400 text-[11px] ml-auto hidden sm:inline">
            💡 Click any column header to sort. Use filter icons or the filter row to narrow records.
          </span>

          {(activeFilterCount > 0 || searchTerm) && (
            <button
              onClick={resetAllFilters}
              className="text-indigo-600 hover:text-indigo-800 underline font-semibold cursor-pointer"
            >
              Reset Filters ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Active Filter Chips Bar */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs">
            <span className="font-semibold text-indigo-950 flex items-center gap-1 text-[11px]">
              <Filter className="w-3 h-3 text-indigo-600" /> Active Filters ({activeFilterCount}):
            </span>
            {colFilters.running_no && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 text-[10.5px]">
                No: {colFilters.running_no}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, running_no: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {colFilters.project && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 text-[10.5px]">
                Project: {colFilters.project}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, project: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {colFilters.supplier && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 text-[10.5px]">
                Supplier: {colFilters.supplier}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, supplier: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {colFilters.marking && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 text-[10.5px]">
                Marking: {colFilters.marking}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, marking: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {colFilters.test_type && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 text-[10.5px]">
                Type: {colFilters.test_type}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, test_type: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {(colFilters.date_test || colFilters.date_year) && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 text-[10.5px]">
                Date: {colFilters.date_test || colFilters.date_year}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, date_test: '', date_year: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {(colFilters.report_status || colFilters.report_text) && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 text-[10.5px]">
                Report: {colFilters.report_status || colFilters.report_text}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, report_status: '', report_text: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {(colFilters.po_status || colFilters.po_text) && (
              <span className="inline-flex items-center gap-1 bg-white border border-amber-300 text-amber-900 rounded-full px-2 py-0.5 text-[10.5px]">
                PO: {colFilters.po_status || colFilters.po_text}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, po_status: '', po_text: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {(colFilters.invoice_status || colFilters.invoice_text) && (
              <span className="inline-flex items-center gap-1 bg-white border border-emerald-300 text-emerald-950 rounded-full px-2 py-0.5 text-[10.5px]">
                Invoice: {colFilters.invoice_status || colFilters.invoice_text}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, invoice_status: '', invoice_text: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {colFilters.payment_status && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 text-[10.5px]">
                Status: {colFilters.payment_status}
                <button type="button" onClick={() => setColFilters(f => ({ ...f, payment_status: '' }))} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            <button
              type="button"
              onClick={resetAllFilters}
              className="ml-auto text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline text-[11px]"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Main Ledger Table with FROZEN HEADER & SELECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden relative">
        <div
          tabIndex={0}
          role="region"
          aria-label="QAQC Test Records Table"
          className={`overflow-auto relative scrollbar-thin ${showMetrics ? 'max-h-[calc(100vh-14rem)]' : 'max-h-[calc(100vh-8.5rem)]'}`}
        >
          <table className={`w-full text-left border-collapse min-w-[1550px] ${isCompact ? 'text-[11px]' : 'text-xs'}`}>
            {/* Frozen sticky thead */}
            <thead className="sticky top-0 z-30 bg-slate-100 shadow-xs border-b border-slate-300">
              {/* Row 1: Column Titles, Sort Arrows, Filter Triggers */}
              <tr className={`uppercase font-bold text-slate-700 ${isCompact ? 'text-[10px]' : 'text-[11px]'}`}>
                <th scope="col" className={`sticky top-0 bg-slate-100 z-30 w-8 text-center ${isCompact ? 'py-1.5 px-2' : 'py-3 px-3'}`}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    title="Select / deselect all rows"
                    className="rounded text-indigo-600 cursor-pointer"
                  />
                </th>

                {/* 1. Running No */}
                <ColumnHeaderCell
                  title="Running No"
                  colId="running_no"
                  sortKey="running_no"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.running_no)}
                  isPopoverOpen={openFilterCol === 'running_no'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'running_no' ? null : 'running_no')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, running_no: '' }))}
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <input
                    type="text"
                    value={colFilters.running_no}
                    onChange={e => setColFilters(f => ({ ...f, running_no: e.target.value }))}
                    placeholder="Search running no..."
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white"
                    autoFocus
                  />
                </ColumnHeaderCell>

                {/* 2. Project */}
                <ColumnHeaderCell
                  title="Project"
                  colId="project"
                  sortKey="project"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.project)}
                  isPopoverOpen={openFilterCol === 'project'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'project' ? null : 'project')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, project: '' }))}
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <select
                    value={colFilters.project}
                    onChange={e => setColFilters(f => ({ ...f, project: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white"
                  >
                    <option value="">All Projects</option>
                    {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </ColumnHeaderCell>

                {/* 3. Supplier / Lab */}
                <ColumnHeaderCell
                  title="Supplier / Lab"
                  colId="supplier"
                  sortKey="supplier"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.supplier)}
                  isPopoverOpen={openFilterCol === 'supplier'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'supplier' ? null : 'supplier')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, supplier: '' }))}
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <select
                    value={colFilters.supplier}
                    onChange={e => setColFilters(f => ({ ...f, supplier: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white"
                  >
                    <option value="">All Suppliers / Labs</option>
                    {allSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </ColumnHeaderCell>

                {/* 4. Marking */}
                <ColumnHeaderCell
                  title="Marking"
                  colId="marking"
                  sortKey="marking"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.marking)}
                  isPopoverOpen={openFilterCol === 'marking'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'marking' ? null : 'marking')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, marking: '' }))}
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <input
                    type="text"
                    value={colFilters.marking}
                    onChange={e => setColFilters(f => ({ ...f, marking: e.target.value }))}
                    placeholder="Search marking (e.g. BEAM-1)..."
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white"
                    autoFocus
                  />
                </ColumnHeaderCell>

                {/* 5. Test Type & Qty */}
                <ColumnHeaderCell
                  title="Test Type & Qty"
                  colId="test_type"
                  sortKey="test_type"
                  secondarySortKey="qty"
                  secondarySortLabel="Quantity"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.test_type)}
                  isPopoverOpen={openFilterCol === 'test_type'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'test_type' ? null : 'test_type')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, test_type: '' }))}
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <select
                    value={colFilters.test_type}
                    onChange={e => setColFilters(f => ({ ...f, test_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white"
                  >
                    <option value="">All Test Types</option>
                    {allTestTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </ColumnHeaderCell>

                {/* 6. Tested Date */}
                <ColumnHeaderCell
                  title="Tested Date"
                  colId="date_test"
                  sortKey="date_test"
                  secondarySortKey="date_cast"
                  secondarySortLabel="Cast Date"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.date_test || colFilters.date_year)}
                  isPopoverOpen={openFilterCol === 'date_test'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'date_test' ? null : 'date_test')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, date_test: '', date_year: '' }))}
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <div className="space-y-1.5">
                    <select
                      value={colFilters.date_year}
                      onChange={e => setColFilters(f => ({ ...f, date_year: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50"
                    >
                      <option value="">All Years</option>
                      {allYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <input
                      type="text"
                      value={colFilters.date_test}
                      onChange={e => setColFilters(f => ({ ...f, date_test: e.target.value }))}
                      placeholder="Filter date or month (YYYY-MM)..."
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50"
                    />
                  </div>
                </ColumnHeaderCell>

                {/* 7. Report / Email */}
                <ColumnHeaderCell
                  title="Report / Email"
                  colId="report"
                  sortKey="report_no"
                  secondarySortKey="email_date"
                  secondarySortLabel="Email Date"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.report_status || colFilters.report_text)}
                  isPopoverOpen={openFilterCol === 'report'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'report' ? null : 'report')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, report_status: '', report_text: '' }))}
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <div className="space-y-1.5">
                    <select
                      value={colFilters.report_status}
                      onChange={e => setColFilters(f => ({ ...f, report_status: e.target.value as any }))}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50"
                    >
                      <option value="">All Report Statuses</option>
                      <option value="has_report">Has Official Report</option>
                      <option value="pending_report">Pending Report</option>
                      <option value="has_email">Email Sent</option>
                      <option value="pending_email">Email Pending</option>
                    </select>
                    <input
                      type="text"
                      value={colFilters.report_text}
                      onChange={e => setColFilters(f => ({ ...f, report_text: e.target.value }))}
                      placeholder="Search report no, email or remarks..."
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50"
                    />
                  </div>
                </ColumnHeaderCell>

                {/* 8. Purchaser PO */}
                <ColumnHeaderCell
                  title="Purchaser PO"
                  colId="po"
                  sortKey="po_no"
                  secondarySortKey="po_amount"
                  secondarySortLabel="PO Amount (RM)"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.po_status || colFilters.po_text)}
                  isPopoverOpen={openFilterCol === 'po'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'po' ? null : 'po')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, po_status: '', po_text: '' }))}
                  className="border-l border-amber-200"
                  bgClass="bg-amber-50"
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <div className="space-y-1.5">
                    <select
                      value={colFilters.po_status}
                      onChange={e => setColFilters(f => ({ ...f, po_status: e.target.value as any }))}
                      className="w-full border border-amber-200 rounded-lg px-2 py-1 text-xs bg-amber-50/50 text-amber-900"
                    >
                      <option value="">All PO Statuses</option>
                      <option value="has_po">Has PO Number</option>
                      <option value="pending_po">🟡 Awaiting PO</option>
                      <option value="multi_po">Multi-test POs</option>
                    </select>
                    <input
                      type="text"
                      value={colFilters.po_text}
                      onChange={e => setColFilters(f => ({ ...f, po_text: e.target.value }))}
                      placeholder="Search PO # or remarks..."
                      className="w-full border border-amber-200 rounded-lg px-2 py-1 text-xs bg-white"
                    />
                  </div>
                </ColumnHeaderCell>

                {/* 9. Invoice & CN Adjustments */}
                <ColumnHeaderCell
                  title="Invoice & CN"
                  colId="invoice"
                  sortKey="invoice_no"
                  secondarySortKey="invoice_amount"
                  secondarySortLabel="Invoice Amount (RM)"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.invoice_status || colFilters.invoice_text)}
                  isPopoverOpen={openFilterCol === 'invoice'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'invoice' ? null : 'invoice')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, invoice_status: '', invoice_text: '' }))}
                  alignRight={true}
                  className="border-l border-emerald-200"
                  bgClass="bg-emerald-50"
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <div className="space-y-1.5">
                    <select
                      value={colFilters.invoice_status}
                      onChange={e => setColFilters(f => ({ ...f, invoice_status: e.target.value as any }))}
                      className="w-full border border-emerald-200 rounded-lg px-2 py-1 text-xs bg-emerald-50/50 text-emerald-900"
                    >
                      <option value="">All Invoice Statuses</option>
                      <option value="has_invoice">Has Invoice Number</option>
                      <option value="pending_invoice">🟣 Awaiting Invoice</option>
                      <option value="has_cn">🏷️ Has Credit Note (CN)</option>
                      <option value="multi_inv">Multi-test Invoices</option>
                    </select>
                    <input
                      type="text"
                      value={colFilters.invoice_text}
                      onChange={e => setColFilters(f => ({ ...f, invoice_text: e.target.value }))}
                      placeholder="Search Invoice #, CN # or remarks..."
                      className="w-full border border-emerald-200 rounded-lg px-2 py-1 text-xs bg-white"
                    />
                  </div>
                </ColumnHeaderCell>

                {/* 10. Status */}
                <ColumnHeaderCell
                  title="Status"
                  colId="status"
                  sortKey="payment_status"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  isFiltered={Boolean(colFilters.payment_status)}
                  isPopoverOpen={openFilterCol === 'status'}
                  onTogglePopover={() => setOpenFilterCol(cur => cur === 'status' ? null : 'status')}
                  onClosePopover={() => setOpenFilterCol(null)}
                  onClearFilter={() => setColFilters(f => ({ ...f, payment_status: '' }))}
                  alignRight={true}
                  bgClass="bg-emerald-50"
                  compact={isCompact}
                  popoverRef={popoverRef}
                >
                  <select
                    value={colFilters.payment_status}
                    onChange={e => setColFilters(f => ({ ...f, payment_status: e.target.value as any }))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white"
                  >
                    <option value="">All Payment Statuses</option>
                    <option value="Pending">🟡 Pending</option>
                    <option value="Paid">🟢 Paid</option>
                    <option value="Partially Paid">🟠 Partially Paid</option>
                    <option value="Void">⚪ Void</option>
                  </select>
                </ColumnHeaderCell>

                {/* Actions Header */}
                <th scope="col" className={`sticky top-0 bg-slate-100 z-30 text-right ${isCompact ? 'py-1.5 px-2' : 'py-3 px-3'}`}>
                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-[10px] text-red-600 hover:text-red-800 font-bold underline cursor-pointer"
                      title="Clear all column filters"
                    >
                      Clear ({activeFilterCount})
                    </button>
                  ) : (
                    <span>Actions</span>
                  )}
                </th>
              </tr>

              {/* Row 2: Inline Quick Filters (Toggleable) */}
              {showFilterRow && (
                <tr className="bg-slate-50 border-b border-slate-300/80 text-slate-700">
                  {/* Checkbox / Reset all col */}
                  <th scope="col" className="sticky top-0 z-30 bg-slate-50 px-1 py-1 text-center w-8">
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="text-slate-400 hover:text-red-600 transition p-0.5 rounded cursor-pointer"
                        title="Reset all column filters"
                      >
                        <RotateCcw className="w-3 h-3 mx-auto" />
                      </button>
                    )}
                  </th>

                  {/* 1. Running No */}
                  <th scope="col" className="sticky top-0 z-30 bg-slate-50 px-1 py-1">
                    <input
                      type="text"
                      value={colFilters.running_no}
                      onChange={e => setColFilters(f => ({ ...f, running_no: e.target.value }))}
                      placeholder="Filter #..."
                      className="w-full font-normal font-mono text-[10px] px-1 py-0.5 border border-slate-300 rounded bg-white text-slate-800 focus:outline-indigo-500"
                    />
                  </th>

                  {/* 2. Project */}
                  <th scope="col" className="sticky top-0 z-30 bg-slate-50 px-1 py-1">
                    <select
                      value={colFilters.project}
                      onChange={e => setColFilters(f => ({ ...f, project: e.target.value }))}
                      className="w-full font-normal text-[10px] px-1 py-0.5 border border-slate-300 rounded bg-white text-slate-800 focus:outline-indigo-500 truncate"
                    >
                      <option value="">All Projects</option>
                      {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </th>

                  {/* 3. Supplier */}
                  <th scope="col" className="sticky top-0 z-30 bg-slate-50 px-1 py-1">
                    <select
                      value={colFilters.supplier}
                      onChange={e => setColFilters(f => ({ ...f, supplier: e.target.value }))}
                      className="w-full font-normal text-[10px] px-1 py-0.5 border border-slate-300 rounded bg-white text-slate-800 focus:outline-indigo-500 truncate"
                    >
                      <option value="">All Suppliers</option>
                      {allSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </th>

                  {/* 4. Marking */}
                  <th scope="col" className="sticky top-0 z-30 bg-slate-50 px-1 py-1">
                    <input
                      type="text"
                      value={colFilters.marking}
                      onChange={e => setColFilters(f => ({ ...f, marking: e.target.value }))}
                      placeholder="Filter marking..."
                      className="w-full font-normal text-[10px] px-1 py-0.5 border border-slate-300 rounded bg-white text-slate-800 focus:outline-indigo-500"
                    />
                  </th>

                  {/* 5. Test Type */}
                  <th scope="col" className="sticky top-0 z-30 bg-slate-50 px-1 py-1">
                    <select
                      value={colFilters.test_type}
                      onChange={e => setColFilters(f => ({ ...f, test_type: e.target.value }))}
                      className="w-full font-normal text-[10px] px-1 py-0.5 border border-slate-300 rounded bg-white text-slate-800 focus:outline-indigo-500 truncate"
                    >
                      <option value="">All Types</option>
                      {allTestTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </th>

                  {/* 6. Date Test */}
                  <th scope="col" className="sticky top-0 z-30 bg-slate-50 px-1 py-1">
                    <input
                      type="text"
                      value={colFilters.date_test}
                      onChange={e => setColFilters(f => ({ ...f, date_test: e.target.value }))}
                      placeholder="YYYY-MM..."
                      className="w-full font-normal text-[10px] px-1 py-0.5 border border-slate-300 rounded bg-white text-slate-800 focus:outline-indigo-500"
                    />
                  </th>

                  {/* 7. Report / Email */}
                  <th scope="col" className="sticky top-0 z-30 bg-slate-50 px-1 py-1">
                    <select
                      value={colFilters.report_status}
                      onChange={e => setColFilters(f => ({ ...f, report_status: e.target.value as any }))}
                      className="w-full font-normal text-[10px] px-1 py-0.5 border border-slate-300 rounded bg-white text-slate-800 focus:outline-indigo-500"
                    >
                      <option value="">All Reports</option>
                      <option value="has_report">Has Report</option>
                      <option value="pending_report">Pending Report</option>
                      <option value="has_email">Email Sent</option>
                      <option value="pending_email">Email Pending</option>
                    </select>
                  </th>

                  {/* 8. Purchaser PO */}
                  <th scope="col" className="sticky top-0 z-30 bg-amber-50/80 border-l border-amber-200 px-1 py-1">
                    <input
                      type="text"
                      value={colFilters.po_text}
                      onChange={e => setColFilters(f => ({ ...f, po_text: e.target.value }))}
                      placeholder="Filter PO #..."
                      className="w-full font-normal text-[10px] px-1 py-0.5 border border-amber-300 rounded bg-white text-amber-900 focus:outline-amber-500"
                    />
                  </th>

                  {/* 9. Invoice & CN */}
                  <th scope="col" className="sticky top-0 z-30 bg-emerald-50/80 border-l border-emerald-200 px-1 py-1">
                    <input
                      type="text"
                      value={colFilters.invoice_text}
                      onChange={e => setColFilters(f => ({ ...f, invoice_text: e.target.value }))}
                      placeholder="Filter Inv # / CN..."
                      className="w-full font-normal text-[10px] px-1 py-0.5 border border-emerald-300 rounded bg-white text-emerald-950 focus:outline-emerald-500"
                    />
                  </th>

                  {/* 10. Status */}
                  <th scope="col" className="sticky top-0 z-30 bg-emerald-50/80 px-1 py-1">
                    <select
                      value={colFilters.payment_status}
                      onChange={e => setColFilters(f => ({ ...f, payment_status: e.target.value as any }))}
                      className="w-full font-normal text-[10px] px-1 py-0.5 border border-emerald-300 rounded bg-white text-slate-800 focus:outline-emerald-500"
                    >
                      <option value="">All</option>
                      <option value="Pending">🟡 Pending</option>
                      <option value="Paid">🟢 Paid</option>
                      <option value="Partially Paid">🟠 Partial</option>
                      <option value="Void">⚪ Void</option>
                    </select>
                  </th>

                  {/* Actions column */}
                  <th scope="col" className="sticky top-0 z-30 bg-slate-50 px-1 py-1 text-right">
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="text-[10px] font-bold text-red-600 hover:text-red-800 underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    No test records match your filter. Click <strong>&quot;+ New Test&quot;</strong> or <strong>&quot;Paste from Excel&quot;</strong> to add.
                  </td>
                </tr>
              ) : (
                sorted.map(row => {
                  const isChecked = selectedIds.includes(row.id)
                  const hasEmail = Boolean(row.email_date)
                  const hasPo = Boolean(row.po_no)
                  const hasInvoice = Boolean(row.invoice_no)
                  const rawInv = Number(row.invoice_amount) || 0
                  const cnAmt = Number(row.cn_amount) || 0
                  const hasCn = Boolean(row.cn_no || cnAmt > 0)
                  const netInv = rawInv > 0 ? Math.max(0, rawInv - cnAmt) : null

                  // Multi-test coverage indicator
                  const poCoverage = row.po_no ? poCoverageMap.get(row.po_no) : null
                  const invCoverage = row.invoice_no ? invCoverageMap.get(row.invoice_no) : null
                  const cellCls = isCompact ? 'py-1 px-2' : 'py-2.5 px-3'

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/90 transition-colors group ${isChecked ? 'bg-indigo-50/40' : ''}`}
                      onDoubleClick={() => { setEditingRecord(row); setIsFormModalOpen(true) }}
                    >
                      {/* Checkbox */}
                      <td className={`${cellCls} text-center w-8`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(row.id)}
                          className="rounded text-indigo-600 cursor-pointer"
                        />
                      </td>

                      {/* Running Number */}
                      <td className={`${cellCls} font-mono font-bold text-slate-900 whitespace-nowrap`}>
                        <span className={`bg-slate-100 rounded text-slate-800 ${isCompact ? 'px-1.5 py-0.2 text-[10.5px]' : 'px-2 py-0.5 text-xs'}`}>{row.running_no}</span>
                      </td>

                      {/* Project */}
                      <td className={`${cellCls} font-semibold text-slate-800 whitespace-nowrap max-w-[130px] truncate`} title={row.project}>
                        {row.project}
                      </td>

                      {/* Supplier */}
                      <td className={`${cellCls} text-slate-700 max-w-[130px] truncate`} title={row.supplier}>
                        {row.supplier}
                      </td>

                      {/* Marking (Inline editable by QAQC) */}
                      <td className={`${cellCls} min-w-[100px]`}>
                        {canEditQaqc ? (
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              defaultValue={row.marking || ''}
                              onBlur={e => handleInlineSave(row.id, 'marking', e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                              placeholder="-"
                              className={`w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 text-slate-700 transition ${isCompact ? 'py-0 text-[11px]' : 'py-0.5 text-xs'}`}
                            />
                            {savedCell === `${row.id}-marking` && (
                              <Check className="w-3 h-3 text-emerald-600 absolute right-1" />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 px-1">{row.marking || '-'}</span>
                        )}
                      </td>

                      {/* Test Type & Qty/Unit (Inline editable by QAQC) */}
                      <td className={`${cellCls} min-w-[160px]`}>
                        <div className="flex flex-col justify-center leading-tight">
                          <span className="font-medium text-slate-800 truncate max-w-[170px]" title={row.test_type}>
                            {row.test_type}
                          </span>
                          <div className={`flex items-center gap-1 text-slate-500 ${isCompact ? 'text-[10px] mt-0' : 'text-[11px] mt-0.5'}`}>
                            {canEditQaqc ? (
                              <div className="flex items-center gap-0.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  defaultValue={row.qty ?? 1}
                                  onBlur={e => handleInlineSave(row.id, 'qty', e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                  className={`w-10 text-center bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-0.5 font-semibold text-slate-700 ${isCompact ? 'py-0 text-[10px]' : 'py-0.2 text-[11px]'}`}
                                  title="Quantity"
                                />
                                <input
                                  type="text"
                                  defaultValue={row.unit || 'nos'}
                                  onBlur={e => handleInlineSave(row.id, 'unit', e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                  className={`w-12 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-0.5 text-slate-500 ${isCompact ? 'py-0 text-[10px]' : 'py-0.2 text-[11px]'}`}
                                  title="Unit (e.g. cubes, nos, sets)"
                                />
                                {savedCell === `${row.id}-qty` && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                              </div>
                            ) : (
                              <span>{row.qty ?? 1} {row.unit || 'nos'}</span>
                            )}
                            {row.date_cast && (
                              <span className="text-[9.5px] text-slate-400">· Cast: {row.date_cast}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Date Tested */}
                      <td className={`${cellCls} whitespace-nowrap text-slate-600`}>
                        {row.date_test}
                      </td>

                      {/* Report & Email (Inline editable) */}
                      <td className={`${cellCls} whitespace-nowrap min-w-[130px]`}>
                        {canEditQaqc ? (
                          <div className="flex flex-col justify-center leading-tight">
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                defaultValue={row.report_no || ''}
                                onBlur={e => handleInlineSave(row.id, 'report_no', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="Report no..."
                                className={`w-full font-mono bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 text-slate-800 transition ${isCompact ? 'py-0 text-[10.5px]' : 'py-0.5 text-xs'}`}
                              />
                              {savedCell === `${row.id}-report_no` && (
                                <Check className="w-2.5 h-2.5 text-emerald-600 absolute right-0.5" />
                              )}
                            </div>
                            <div className="relative flex items-center">
                              <input
                                type="date"
                                defaultValue={row.email_date || ''}
                                onBlur={e => handleInlineSave(row.id, 'email_date', e.target.value)}
                                className="text-[10px] bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-0.5 text-slate-400 cursor-pointer"
                                title="Email date"
                              />
                              {savedCell === `${row.id}-email_date` && (
                                <Check className="w-2 h-2 text-emerald-600 ml-0.5" />
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-mono text-slate-800">{row.report_no || '-'}</div>
                            {hasEmail ? (
                              <span className="text-[10px] text-emerald-700">Sent: {row.email_date}</span>
                            ) : (
                              <span className="text-[10px] text-amber-600">Email pending</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* PO Details (Purchaser - Direct editable & Multi-test Indicator) */}
                      <td className={`${cellCls} bg-amber-50/20 border-l border-amber-100 whitespace-nowrap min-w-[150px]`}>
                        {canEditPurchaser ? (
                          <div className="flex flex-col justify-center leading-tight">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                defaultValue={row.po_no || ''}
                                onBlur={e => handleInlineSave(row.id, 'po_no', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="PO Number..."
                                list="records-po-datalist"
                                className={`w-full font-mono font-bold text-amber-900 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-amber-300 focus:border-amber-500 rounded px-1 transition ${isCompact ? 'py-0 text-[11px]' : 'py-0.5 text-xs'}`}
                              />
                              {savedCell === `${row.id}-po_no` && (
                                <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                              )}
                              {poCoverage && poCoverage.count > 1 && (
                                <span
                                  className="text-[9px] font-bold text-amber-800 bg-amber-100/90 px-1 py-0.2 rounded shrink-0 shadow-2xs"
                                  title={`PO covers ${poCoverage.count} tests. Combined PO total: RM ${poCoverage.total.toFixed(2)}`}
                                >
                                  ×{poCoverage.count}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 text-[11px]">
                              <span className="text-[10px] text-slate-400">RM</span>
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={row.po_amount !== null && row.po_amount !== undefined ? row.po_amount : ''}
                                onBlur={e => handleInlineSave(row.id, 'po_amount', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="0.00"
                                className={`w-20 font-semibold text-slate-700 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-amber-300 focus:border-amber-500 rounded px-1 transition ${isCompact ? 'py-0 text-[10px]' : 'py-0.5 text-[11px]'}`}
                              />
                              {savedCell === `${row.id}-po_amount` && (
                                <Check className="w-2 h-2 text-emerald-600 ml-0.5 shrink-0" />
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            {hasPo ? (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-amber-900">{row.po_no}</span>
                                  {poCoverage && poCoverage.count > 1 && (
                                    <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1 rounded">
                                      {poCoverage.count} tests
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-700">{fmtRm(row.po_amount)}</div>
                              </>
                            ) : (
                              <span className="text-[10px] text-amber-600 bg-amber-100/60 px-1.5 py-0.2 rounded">
                                Pending PO
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Invoice & Credit Note Details (Account - Direct editable & Multi-test Indicator) */}
                      <td className={`${cellCls} bg-emerald-50/20 border-l border-emerald-100 whitespace-nowrap min-w-[200px]`}>
                        {canEditAccount ? (
                          <div className={`flex flex-col justify-center leading-tight ${isCompact ? 'gap-0.5' : 'gap-1'}`}>
                            {/* Invoice No & Amount */}
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                defaultValue={row.invoice_no || ''}
                                onBlur={e => handleInlineSave(row.id, 'invoice_no', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="Inv No..."
                                list="records-inv-datalist"
                                className={`flex-1 font-mono font-bold text-emerald-950 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-emerald-300 focus:border-emerald-500 rounded px-1 transition ${isCompact ? 'py-0 text-[11px]' : 'py-0.5 text-xs'}`}
                              />
                              {savedCell === `${row.id}-invoice_no` && (
                                <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                              )}
                              <span className="text-[10px] text-slate-400">RM</span>
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={row.invoice_amount !== null && row.invoice_amount !== undefined ? row.invoice_amount : ''}
                                onBlur={e => handleInlineSave(row.id, 'invoice_amount', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="0.00"
                                className={`w-18 font-semibold text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-emerald-300 focus:border-emerald-500 rounded px-1 transition ${isCompact ? 'py-0 text-[10px]' : 'py-0.5 text-[11px]'}`}
                              />
                              {savedCell === `${row.id}-invoice_amount` && (
                                <Check className="w-2 h-2 text-emerald-600 shrink-0" />
                              )}
                              {invCoverage && invCoverage.count > 1 && (
                                <span
                                  className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded shrink-0"
                                  title={`Invoice covers ${invCoverage.count} tests.`}
                                >
                                  ×{invCoverage.count}
                                </span>
                              )}
                            </div>

                            {/* Credit Note (CN) Adjustment */}
                            <div className={`flex items-center gap-1 bg-white/70 rounded border border-emerald-200/70 ${isCompact ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-[11px]'}`}>
                              <span className="font-bold text-emerald-800 uppercase tracking-tight text-[9px]">CN:</span>
                              <input
                                type="text"
                                defaultValue={row.cn_no || ''}
                                onBlur={e => handleInlineSave(row.id, 'cn_no', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="CN No"
                                title="Credit Note Number"
                                className={`w-14 font-mono bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-emerald-300 rounded px-0.5 ${isCompact ? 'py-0 text-[9px]' : 'py-0.5 text-[10px]'}`}
                              />
                              <span className="text-[9px] text-slate-400">-RM</span>
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={row.cn_amount !== null && row.cn_amount !== undefined ? row.cn_amount : ''}
                                onBlur={e => handleInlineSave(row.id, 'cn_amount', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="0.00"
                                title="Credit Note Amount"
                                className={`w-14 font-semibold text-emerald-700 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-emerald-300 rounded px-0.5 ${isCompact ? 'py-0 text-[9px]' : 'py-0.5 text-[10px]'}`}
                              />
                              {netInv !== null && cnAmt > 0 && (
                                <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1 rounded ml-auto" title="Net Billed Amount">
                                  Net {fmtRm(netInv)}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            {hasInvoice ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-emerald-900">{row.invoice_no}</span>
                                  {invCoverage && invCoverage.count > 1 && (
                                    <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 rounded">
                                      {invCoverage.count} tests
                                    </span>
                                  )}
                                  <span className="text-[11px] font-semibold text-slate-700">{fmtRm(row.invoice_amount)}</span>
                                </div>
                                {hasCn && (
                                  <div className="text-[9.5px] font-medium text-emerald-800 bg-emerald-100/60 px-1 py-0.2 rounded inline-block">
                                    CN: -{fmtRm(row.cn_amount)} ({row.cn_no || 'CN'}) → <strong>Net {fmtRm(netInv)}</strong>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                {hasPo ? 'Pending invoice' : '-'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Payment Status (Direct Selectable Dropdown) */}
                      <td className={`${cellCls} bg-emerald-50/20 whitespace-nowrap`}>
                        {canEditAccount ? (
                          <div className="relative inline-flex items-center">
                            <select
                              value={row.payment_status}
                              onChange={e => handleInlineSave(row.id, 'payment_status', e.target.value)}
                              className={`font-bold rounded border transition cursor-pointer ${
                                isCompact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-1'
                              } ${
                                row.payment_status === 'Paid'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : row.payment_status === 'Pending'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : row.payment_status === 'Partially Paid'
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                  : 'bg-slate-200 text-slate-700 border-slate-300'
                              }`}
                            >
                              <option value="Pending">🟡 Pending</option>
                              <option value="Paid">🟢 Paid</option>
                              <option value="Partially Paid">🟠 Partial</option>
                              <option value="Void">⚪ Void</option>
                            </select>
                            {savedCell === `${row.id}-payment_status` && (
                              <Check className="w-2.5 h-2.5 text-emerald-600 ml-0.5 inline animate-in fade-in" />
                            )}
                          </div>
                        ) : (
                          <div>
                            {row.payment_status === 'Paid' && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.2 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> Paid
                              </span>
                            )}
                            {row.payment_status === 'Pending' && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.2 rounded-full">
                                <Clock className="w-3 h-3" /> Pending
                              </span>
                            )}
                            {row.payment_status === 'Partially Paid' && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.2 rounded-full">
                                Partial
                              </span>
                            )}
                            {row.payment_status === 'Void' && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-500 bg-slate-200 px-2 py-0.2 rounded-full">
                                Void
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className={`${cellCls} text-right whitespace-nowrap`}>
                        <button
                          onClick={e => { e.stopPropagation(); setEditingRecord(row); setIsFormModalOpen(true) }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 mr-1"
                          title="Open full edit form"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(row.id, row.running_no) }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100"
                          title="Delete record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Batch Action Bar when tests are selected */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-150 border border-slate-700">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              test{selectedIds.length === 1 ? '' : 's'} selected
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Purchaser batch PO action */}
          {canEditPurchaser && (
            <button
              onClick={() => setIsBatchPoOpen(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition shadow-xs"
            >
              <FileCheck className="w-3.5 h-3.5" />
              Assign 1 PO to {selectedIds.length} Tests
            </button>
          )}

          {/* Account batch Invoice action */}
          {canEditAccount && (
            <button
              onClick={() => setIsBatchInvoiceOpen(true)}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition shadow-xs"
            >
              <Receipt className="w-3.5 h-3.5" />
              Assign 1 Invoice / CN to {selectedIds.length} Tests
            </button>
          )}

          <button
            onClick={() => setSelectedIds([])}
            className="text-xs text-slate-400 hover:text-white px-2 py-1"
          >
            Clear
          </button>
        </div>
      )}

      {/* Datalists for PO and Invoice inline suggestions */}
      <datalist id="records-po-datalist">
        {existingPoList.map(po => <option key={po} value={po} />)}
      </datalist>
      <datalist id="records-inv-datalist">
        {existingInvList.map(inv => <option key={inv} value={inv} />)}
      </datalist>

      {/* Batch PO Modal */}
      {isBatchPoOpen && (
        <BatchPoModal
          isOpen={isBatchPoOpen}
          onClose={() => setIsBatchPoOpen(false)}
          onSuccess={() => window.location.reload()}
          selectedTests={selectedTests}
          existingPoList={existingPoList}
        />
      )}

      {/* Batch Invoice Modal */}
      {isBatchInvoiceOpen && (
        <BatchInvoiceModal
          isOpen={isBatchInvoiceOpen}
          onClose={() => setIsBatchInvoiceOpen(false)}
          onSuccess={() => window.location.reload()}
          selectedTests={selectedTests}
          existingInvList={existingInvList}
        />
      )}

      {/* Excel Paste/Import Modal */}
      {isExcelModalOpen && (
        <PasteExcelModal
          isOpen={isExcelModalOpen}
          onClose={() => setIsExcelModalOpen(false)}
          onSuccess={() => window.location.reload()}
          knownProjects={knownProjects}
          knownSuppliers={knownSuppliers}
          knownTestTypes={knownTestTypes}
          existingTests={tests}
        />
      )}

      {/* Add / Edit Form Modal */}
      {isFormModalOpen && (
        <TestFormModal
          isOpen={isFormModalOpen}
          onClose={() => { setIsFormModalOpen(false); setEditingRecord(null) }}
          onSuccess={() => window.location.reload()}
          userRole={userRole}
          knownProjects={allProjects}
          knownSuppliers={allSuppliers}
          knownTestTypes={allTestTypes}
          initialData={editingRecord as any}
        />
      )}
    </div>
  )
}
