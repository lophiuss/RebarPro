'use client'

import React, { useState, useMemo } from 'react'
import {
  Search, Plus, FileSpreadsheet, Download, Trash2, Edit3,
  Calendar, CheckCircle2, Clock, ArrowUpDown, Check, X,
  Receipt, FileCheck, Layers, Sparkles
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
  const [filterProject, setFilterProject] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterTestType, setFilterTestType] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [sortKey, setSortKey] = useState<keyof QaqcTestRecord>('date_test')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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
      if (tab === 'has_cn' && (!item.cn_no && !item.cn_amount)) return false
      if (tab === 'unpaid' && (!item.invoice_no || item.payment_status === 'Paid')) return false
      if (tab === 'paid' && item.payment_status !== 'Paid') return false

      // Dropdown filters
      if (filterProject && item.project !== filterProject) return false
      if (filterSupplier && item.supplier !== filterSupplier) return false
      if (filterTestType && item.test_type !== filterTestType) return false
      if (filterYear && !item.date_test.startsWith(filterYear)) return false

      // Search term
      if (s) {
        const hay = [
          item.running_no, item.project, item.supplier, item.marking,
          item.test_type, item.report_no, item.po_no, item.invoice_no,
          item.cn_no, item.cn_remarks, item.unit,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }

      return true
    })
  }, [tests, tab, filterProject, filterSupplier, filterTestType, filterYear, searchTerm])

  // Sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey] ?? ''
      const bVal = b[sortKey] ?? ''
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const handleSort = (key: keyof QaqcTestRecord) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
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
    <div className="space-y-4">
      {/* Top Banner & Metric Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Total Tests</span>
          <span className="text-xl font-bold text-slate-800">{summary.totalCount}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Awaiting PO</span>
          <span className={`text-xl font-bold ${summary.awaitingPoCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
            {summary.awaitingPoCount}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Awaiting Invoice</span>
          <span className={`text-xl font-bold ${summary.awaitingInvCount > 0 ? 'text-indigo-600' : 'text-slate-800'}`}>
            {summary.awaitingInvCount}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Total PO Spend</span>
          <span className="text-xl font-bold text-slate-800">{fmtRm(summary.totalPo)}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Net Invoiced</span>
          <span className="text-xl font-bold text-emerald-700">{fmtRm(summary.netInv)}</span>
          {summary.totalCn > 0 && (
            <span className="text-[10px] text-emerald-600 block">Gross {fmtRm(summary.rawInv)}</span>
          )}
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/30 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase block">CN Adjustments</span>
          <span className="text-xl font-bold text-emerald-800">
            {summary.totalCn > 0 ? `-${fmtRm(summary.totalCn)}` : 'RM 0.00'}
          </span>
          <span className="text-[10px] text-slate-500 block">{summary.cnCount} credit notes</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Total Paid</span>
          <span className="text-xl font-bold text-emerald-600">{fmtRm(summary.totalPaid)}</span>
        </div>
      </div>

      {/* Filter Tabs & Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-4">
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
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === t.key
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadQaqcTemplate}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition shadow-2xs"
              title="Download Excel / CSV template for bulk importing"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              Template
            </button>
            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              Paste from Excel
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition shadow-2xs"
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Export
            </button>
            <button
              onClick={() => { setEditingRecord(null); setIsFormModalOpen(true) }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-xs"
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
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700"
          >
            <option value="">All Projects</option>
            {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 max-w-[160px] truncate"
          >
            <option value="">All Suppliers</option>
            {allSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={filterTestType}
            onChange={e => setFilterTestType(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 max-w-[160px] truncate"
          >
            <option value="">All Test Types</option>
            {allTestTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700"
          >
            <option value="">All Years</option>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <span className="text-slate-400 text-[11px] ml-auto hidden sm:inline">
            💡 Select rows to batch-tag PO or Invoice. Click directly into cells to edit.
          </span>

          {(filterProject || filterSupplier || filterTestType || filterYear || searchTerm) && (
            <button
              onClick={() => {
                setFilterProject('')
                setFilterSupplier('')
                setFilterTestType('')
                setFilterYear('')
                setSearchTerm('')
              }}
              className="text-slate-400 hover:text-slate-600 underline font-medium"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Ledger Table with FROZEN HEADER & SELECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden relative">
        <div className="overflow-auto max-h-[calc(100vh-14rem)] relative scrollbar-thin">
          <table className="w-full text-xs text-left border-collapse min-w-[1600px]">
            {/* Frozen sticky thead */}
            <thead className="sticky top-0 z-30 bg-slate-100 shadow-xs border-b border-slate-300">
              <tr className="text-[11px] uppercase font-bold text-slate-700">
                <th className="sticky top-0 bg-slate-100 z-30 py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    title="Select / deselect all rows"
                    className="rounded text-indigo-600 cursor-pointer"
                  />
                </th>
                <th className="sticky top-0 bg-slate-100 z-30 py-3 px-3 cursor-pointer hover:bg-slate-200 transition" onClick={() => handleSort('running_no')}>
                  Running No <ArrowUpDown className="w-3 h-3 inline ml-0.5 opacity-50" />
                </th>
                <th className="sticky top-0 bg-slate-100 z-30 py-3 px-3 cursor-pointer hover:bg-slate-200 transition" onClick={() => handleSort('project')}>
                  Project <ArrowUpDown className="w-3 h-3 inline ml-0.5 opacity-50" />
                </th>
                <th className="sticky top-0 bg-slate-100 z-30 py-3 px-3">Supplier / Lab</th>
                <th className="sticky top-0 bg-slate-100 z-30 py-3 px-3">Marking</th>
                <th className="sticky top-0 bg-slate-100 z-30 py-3 px-3 cursor-pointer hover:bg-slate-200 transition" onClick={() => handleSort('test_type')}>
                  Test Type & Qty <ArrowUpDown className="w-3 h-3 inline ml-0.5 opacity-50" />
                </th>
                <th className="sticky top-0 bg-slate-100 z-30 py-3 px-3 cursor-pointer hover:bg-slate-200 transition" onClick={() => handleSort('date_test')}>
                  Tested Date <ArrowUpDown className="w-3 h-3 inline ml-0.5 opacity-50" />
                </th>
                <th className="sticky top-0 bg-slate-100 z-30 py-3 px-3">Report / Email</th>
                <th className="sticky top-0 bg-amber-50 z-30 py-3 px-3 border-l border-amber-200">
                  Purchaser PO
                </th>
                <th className="sticky top-0 bg-emerald-50 z-30 py-3 px-3 border-l border-emerald-200">
                  Invoice & CN Adjustments
                </th>
                <th className="sticky top-0 bg-emerald-50 z-30 py-3 px-3">Status</th>
                <th className="sticky top-0 bg-slate-100 z-30 py-3 px-3 text-right">Actions</th>
              </tr>
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

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/90 transition-colors group ${isChecked ? 'bg-indigo-50/40' : ''}`}
                      onDoubleClick={() => { setEditingRecord(row); setIsFormModalOpen(true) }}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center w-10">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(row.id)}
                          className="rounded text-indigo-600 cursor-pointer"
                        />
                      </td>

                      {/* Running Number */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800">{row.running_no}</span>
                      </td>

                      {/* Project */}
                      <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                        {row.project}
                      </td>

                      {/* Supplier */}
                      <td className="py-2.5 px-3 text-slate-700 max-w-[140px] truncate" title={row.supplier}>
                        {row.supplier}
                      </td>

                      {/* Marking (Inline editable by QAQC) */}
                      <td className="py-2.5 px-3 min-w-[120px]">
                        {canEditQaqc ? (
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              defaultValue={row.marking || ''}
                              onBlur={e => handleInlineSave(row.id, 'marking', e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                              placeholder="-"
                              className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1.5 py-0.5 text-xs text-slate-700 transition"
                            />
                            {savedCell === `${row.id}-marking` && (
                              <Check className="w-3 h-3 text-emerald-600 absolute right-1" />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 px-1.5">{row.marking || '-'}</span>
                        )}
                      </td>

                      {/* Test Type & Qty/Unit (Inline editable by QAQC) */}
                      <td className="py-2.5 px-3 min-w-[180px]">
                        <span className="font-medium text-slate-800 block truncate max-w-[180px]" title={row.test_type}>
                          {row.test_type}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          {canEditQaqc ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                defaultValue={row.qty ?? 1}
                                onBlur={e => handleInlineSave(row.id, 'qty', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                className="w-12 text-center bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 py-0.2 font-semibold text-slate-700 text-[11px]"
                                title="Quantity"
                              />
                              <input
                                type="text"
                                defaultValue={row.unit || 'nos'}
                                onBlur={e => handleInlineSave(row.id, 'unit', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                className="w-14 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 py-0.2 text-slate-500 text-[11px]"
                                title="Unit (e.g. cubes, nos, sets)"
                              />
                              {savedCell === `${row.id}-qty` && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                            </div>
                          ) : (
                            <span>{row.qty ?? 1} {row.unit || 'nos'}</span>
                          )}
                          {row.date_cast && (
                            <span className="text-[10px] text-slate-400">· Cast: {row.date_cast}</span>
                          )}
                        </div>
                      </td>

                      {/* Date Tested */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                        {row.date_test}
                      </td>

                      {/* Report & Email (Inline editable) */}
                      <td className="py-2.5 px-3 whitespace-nowrap min-w-[140px]">
                        {canEditQaqc ? (
                          <div className="space-y-0.5">
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                defaultValue={row.report_no || ''}
                                onBlur={e => handleInlineSave(row.id, 'report_no', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="Report no..."
                                className="w-full font-mono bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1.5 py-0.5 text-xs text-slate-800 transition"
                              />
                              {savedCell === `${row.id}-report_no` && (
                                <Check className="w-3 h-3 text-emerald-600 absolute right-1" />
                              )}
                            </div>
                            <div className="relative flex items-center">
                              <input
                                type="date"
                                defaultValue={row.email_date || ''}
                                onBlur={e => handleInlineSave(row.id, 'email_date', e.target.value)}
                                className="text-[10px] bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 text-slate-500 cursor-pointer"
                                title="Email date"
                              />
                              {savedCell === `${row.id}-email_date` && (
                                <Check className="w-2.5 h-2.5 text-emerald-600 ml-1" />
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
                      <td className="py-2.5 px-3 bg-amber-50/20 border-l border-amber-100 whitespace-nowrap min-w-[160px]">
                        {canEditPurchaser ? (
                          <div className="space-y-0.5">
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                defaultValue={row.po_no || ''}
                                onBlur={e => handleInlineSave(row.id, 'po_no', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="PO Number..."
                                list="records-po-datalist"
                                className="w-full font-mono font-bold text-amber-900 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-amber-300 focus:border-amber-500 rounded px-1.5 py-0.5 text-xs transition"
                              />
                              {savedCell === `${row.id}-po_no` && (
                                <Check className="w-3 h-3 text-emerald-600 absolute right-1" />
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <div className="relative flex items-center">
                                <span className="text-[11px] text-slate-400 mr-0.5">RM</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  defaultValue={row.po_amount !== null && row.po_amount !== undefined ? row.po_amount : ''}
                                  onBlur={e => handleInlineSave(row.id, 'po_amount', e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                  placeholder="0.00"
                                  className="w-20 text-[11px] font-semibold text-slate-700 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-amber-300 focus:border-amber-500 rounded px-1 py-0.5 transition"
                                />
                                {savedCell === `${row.id}-po_amount` && (
                                  <Check className="w-2.5 h-2.5 text-emerald-600 ml-1" />
                                )}
                              </div>
                              {poCoverage && poCoverage.count > 1 && (
                                <span
                                  className="text-[10px] font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded shadow-2xs"
                                  title={`PO covers ${poCoverage.count} tests. Combined PO total: RM ${poCoverage.total.toFixed(2)}`}
                                >
                                  covers {poCoverage.count}
                                </span>
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
                                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1 rounded">
                                      {poCoverage.count} tests
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-700">{fmtRm(row.po_amount)}</div>
                              </>
                            ) : (
                              <span className="text-[11px] text-amber-600 bg-amber-100/60 px-2 py-0.5 rounded">
                                Pending PO
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Invoice & Credit Note Details (Account - Direct editable & Multi-test Indicator) */}
                      <td className="py-2.5 px-3 bg-emerald-50/20 border-l border-emerald-100 whitespace-nowrap min-w-[220px]">
                        {canEditAccount ? (
                          <div className="space-y-1">
                            {/* Invoice No & Amount */}
                            <div className="flex items-center gap-1.5">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  defaultValue={row.invoice_no || ''}
                                  onBlur={e => handleInlineSave(row.id, 'invoice_no', e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                  placeholder="Inv No..."
                                  list="records-inv-datalist"
                                  className="w-full font-mono font-bold text-emerald-950 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-emerald-300 focus:border-emerald-500 rounded px-1.5 py-0.5 text-xs transition"
                                />
                                {savedCell === `${row.id}-invoice_no` && (
                                  <Check className="w-3 h-3 text-emerald-600 absolute right-1" />
                                )}
                              </div>
                              <div className="relative flex items-center">
                                <span className="text-[11px] text-slate-400 mr-0.5">RM</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  defaultValue={row.invoice_amount !== null && row.invoice_amount !== undefined ? row.invoice_amount : ''}
                                  onBlur={e => handleInlineSave(row.id, 'invoice_amount', e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                  placeholder="0.00"
                                  className="w-20 text-[11px] font-semibold text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-emerald-300 focus:border-emerald-500 rounded px-1 py-0.5 transition"
                                />
                                {savedCell === `${row.id}-invoice_amount` && (
                                  <Check className="w-2.5 h-2.5 text-emerald-600 ml-1" />
                                )}
                              </div>
                              {invCoverage && invCoverage.count > 1 && (
                                <span
                                  className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.5 rounded shadow-2xs"
                                  title={`Invoice covers ${invCoverage.count} tests. Combined invoice total: RM ${invCoverage.total.toFixed(2)}`}
                                >
                                  covers {invCoverage.count}
                                </span>
                              )}
                            </div>

                            {/* Credit Note (CN) Adjustment */}
                            <div className="flex items-center gap-1.5 bg-white/70 p-1 rounded border border-emerald-200/70 text-[11px]">
                              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-tight">CN:</span>
                              <input
                                type="text"
                                defaultValue={row.cn_no || ''}
                                onBlur={e => handleInlineSave(row.id, 'cn_no', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="CN No"
                                title="Credit Note Number"
                                className="w-16 font-mono text-[10px] bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-emerald-300 rounded px-1 py-0.5"
                              />
                              <span className="text-[10px] text-slate-400">-RM</span>
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={row.cn_amount !== null && row.cn_amount !== undefined ? row.cn_amount : ''}
                                onBlur={e => handleInlineSave(row.id, 'cn_amount', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                                placeholder="0.00"
                                title="Credit Note Amount"
                                className="w-16 font-semibold text-[10px] text-emerald-700 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-emerald-300 rounded px-1 py-0.5"
                              />
                              {netInv !== null && cnAmt > 0 && (
                                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-1 rounded ml-auto" title="Net Billed Amount">
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
                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1 rounded">
                                      {invCoverage.count} tests
                                    </span>
                                  )}
                                  <span className="text-[11px] font-semibold text-slate-700">{fmtRm(row.invoice_amount)}</span>
                                </div>
                                {hasCn && (
                                  <div className="text-[10px] font-medium text-emerald-800 bg-emerald-100/60 px-1.5 py-0.5 rounded inline-block">
                                    CN: -{fmtRm(row.cn_amount)} ({row.cn_no || 'CN'}) → <strong>Net {fmtRm(netInv)}</strong>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                {hasPo ? 'Pending invoice' : '-'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Payment Status (Direct Selectable Dropdown) */}
                      <td className="py-2.5 px-3 bg-emerald-50/20 whitespace-nowrap">
                        {canEditAccount ? (
                          <div className="relative inline-flex items-center">
                            <select
                              value={row.payment_status}
                              onChange={e => handleInlineSave(row.id, 'payment_status', e.target.value)}
                              className={`text-[11px] font-bold rounded-lg px-2 py-1 border transition cursor-pointer ${
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
                              <Check className="w-3 h-3 text-emerald-600 ml-1 inline animate-in fade-in" />
                            )}
                          </div>
                        ) : (
                          <div>
                            {row.payment_status === 'Paid' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> Paid
                              </span>
                            )}
                            {row.payment_status === 'Pending' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                                <Clock className="w-3 h-3" /> Pending
                              </span>
                            )}
                            {row.payment_status === 'Partially Paid' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-full">
                                Partial
                              </span>
                            )}
                            {row.payment_status === 'Void' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                                Void
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
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
