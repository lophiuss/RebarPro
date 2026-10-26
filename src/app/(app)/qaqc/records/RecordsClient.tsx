'use client'

import React, { useState, useMemo } from 'react'
import {
  Search, Plus, FileSpreadsheet, Download, Filter, Trash2, Edit3,
  Calendar, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, ChevronDown, Check, X
} from 'lucide-react'
import PasteExcelModal from './PasteExcelModal'
import TestFormModal from './TestFormModal'
import { deleteQaqcTest, updateQaqcTest } from '../actions'

export type QaqcTestRecord = {
  id: number
  running_no: string
  project: string
  supplier: string
  marking: string | null
  test_type: string
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
  const [tab, setTab] = useState<'all' | 'need_po' | 'need_inv' | 'unpaid' | 'paid'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterTestType, setFilterTestType] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [sortKey, setSortKey] = useState<keyof QaqcTestRecord>('date_test')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Modals
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<QaqcTestRecord | null>(null)

  // Derive distinct options
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

  // Filtering
  const filtered = useMemo(() => {
    const s = searchTerm.trim().toLowerCase()
    return tests.filter(item => {
      // Tab filter
      if (tab === 'need_po' && item.po_no) return false
      if (tab === 'need_inv' && (!item.po_no || item.invoice_no)) return false
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

  // Summary Metrics for currently filtered records
  const summary = useMemo(() => {
    const totalCount = sorted.length
    const totalPo = sorted.reduce((sum, r) => sum + (Number(r.po_amount) || 0), 0)
    const totalInv = sorted.reduce((sum, r) => sum + (Number(r.invoice_amount) || 0), 0)
    const totalPaid = sorted
      .filter(r => r.payment_status === 'Paid')
      .reduce((sum, r) => sum + (Number(r.invoice_amount) || 0), 0)
    const awaitingPoCount = sorted.filter(r => !r.po_no).length
    const awaitingInvCount = sorted.filter(r => r.po_no && !r.invoice_no).length
    return { totalCount, totalPo, totalInv, totalPaid, awaitingPoCount, awaitingInvCount }
  }, [sorted])

  const handleDelete = async (id: number, runningNo: string) => {
    if (!confirm(`Are you sure you want to delete test record ${runningNo}?`)) return
    try {
      await deleteQaqcTest(id)
      setTests(prev => prev.filter(t => t.id !== id))
    } catch (err: any) {
      alert('Delete failed: ' + err.message)
    }
  }

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Running No', 'Project', 'Supplier', 'Marking', 'Test Type',
      'Date Cast', 'Date Tested', 'Report No', 'Email Date', 'QAQC Remarks',
      'PO No', 'PO Date', 'PO Amount (RM)', 'Purchaser Remarks',
      'Invoice No', 'Invoice Date', 'Invoice Amount (RM)', 'Payment Status', 'Payment Date', 'Account Remarks',
    ]

    const rows = sorted.map(r => [
      r.running_no, r.project, r.supplier, r.marking || '', r.test_type,
      r.date_cast || '', r.date_test, r.report_no || '', r.email_date || '', r.qaqc_remarks || '',
      r.po_no || '', r.po_date || '', r.po_amount ?? '', r.purchaser_remarks || '',
      r.invoice_no || '', r.invoice_date || '', r.invoice_amount ?? '', r.payment_status, r.payment_date || '', r.account_remarks || '',
    ])

    const csvContent = [
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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
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
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Total Invoiced</span>
          <span className="text-xl font-bold text-emerald-700">{fmtRm(summary.totalInv)}</span>
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
              placeholder="Search running no, report, PO, invoice, lab..."
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
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-700"
          >
            <option value="">All Projects</option>
            {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-700"
          >
            <option value="">All Suppliers / Labs</option>
            {allSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={filterTestType}
            onChange={e => setFilterTestType(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-700"
          >
            <option value="">All Test Types</option>
            {allTestTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-700"
          >
            <option value="">All Years</option>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

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

      {/* Main Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-21rem)]">
          <table className="w-full text-xs text-left border-collapse min-w-[1300px]">
            <thead className="bg-slate-50 sticky top-0 z-20 shadow-xs border-b border-slate-200">
              <tr className="text-[11px] uppercase font-bold text-slate-600">
                <th className="py-2.5 px-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('running_no')}>
                  Running No <ArrowUpDown className="w-3 h-3 inline ml-0.5 opacity-50" />
                </th>
                <th className="py-2.5 px-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('project')}>
                  Project <ArrowUpDown className="w-3 h-3 inline ml-0.5 opacity-50" />
                </th>
                <th className="py-2.5 px-3">Supplier / Lab</th>
                <th className="py-2.5 px-3">Marking</th>
                <th className="py-2.5 px-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('test_type')}>
                  Test Type <ArrowUpDown className="w-3 h-3 inline ml-0.5 opacity-50" />
                </th>
                <th className="py-2.5 px-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('date_test')}>
                  Tested Date <ArrowUpDown className="w-3 h-3 inline ml-0.5 opacity-50" />
                </th>
                <th className="py-2.5 px-3">Report / Email</th>
                <th className="py-2.5 px-3 bg-amber-50/40 border-l border-amber-100">PO Details</th>
                <th className="py-2.5 px-3 bg-emerald-50/40 border-l border-emerald-100">Invoice Details</th>
                <th className="py-2.5 px-3 bg-emerald-50/40">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    No test records match your filter. Click <strong>&quot;+ New Test&quot;</strong> or <strong>&quot;Paste from Excel&quot;</strong> to add.
                  </td>
                </tr>
              ) : (
                sorted.map(row => {
                  const hasEmail = Boolean(row.email_date)
                  const hasPo = Boolean(row.po_no)
                  const hasInvoice = Boolean(row.invoice_no)
                  const isPaid = row.payment_status === 'Paid'

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onDoubleClick={() => { setEditingRecord(row); setIsFormModalOpen(true) }}
                    >
                      {/* Running Number */}
                      <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {row.running_no}
                      </td>

                      {/* Project */}
                      <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">
                        {row.project}
                      </td>

                      {/* Supplier */}
                      <td className="py-2 px-3 text-slate-700 max-w-[140px] truncate" title={row.supplier}>
                        {row.supplier}
                      </td>

                      {/* Marking */}
                      <td className="py-2 px-3 text-slate-600 max-w-[120px] truncate" title={row.marking || ''}>
                        {row.marking || '-'}
                      </td>

                      {/* Test Type */}
                      <td className="py-2 px-3">
                        <span className="font-medium text-slate-800 block truncate max-w-[180px]" title={row.test_type}>
                          {row.test_type}
                        </span>
                        {row.date_cast && (
                          <span className="text-[10px] text-slate-400">Cast: {row.date_cast}</span>
                        )}
                      </td>

                      {/* Date Tested */}
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                        {row.date_test}
                      </td>

                      {/* Report & Email */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-mono text-slate-800">{row.report_no || '-'}</div>
                        {hasEmail ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-medium">
                            <Check className="w-2.5 h-2.5" /> Sent: {row.email_date}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600">Email pending</span>
                        )}
                      </td>

                      {/* PO Details (Purchaser) */}
                      <td className="py-2 px-3 bg-amber-50/20 border-l border-amber-100 whitespace-nowrap">
                        {hasPo ? (
                          <div>
                            <span className="font-mono font-bold text-amber-900">{row.po_no}</span>
                            <div className="text-[11px] font-semibold text-slate-700">{fmtRm(row.po_amount)}</div>
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-amber-600 bg-amber-100/60 px-2 py-0.5 rounded">
                            Pending PO
                          </span>
                        )}
                      </td>

                      {/* Invoice Details (Account) */}
                      <td className="py-2 px-3 bg-emerald-50/20 border-l border-emerald-100 whitespace-nowrap">
                        {hasInvoice ? (
                          <div>
                            <span className="font-mono font-bold text-emerald-900">{row.invoice_no}</span>
                            <div className="text-[11px] font-semibold text-slate-700">{fmtRm(row.invoice_amount)}</div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {hasPo ? 'Pending invoice' : '-'}
                          </span>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="py-2 px-3 bg-emerald-50/20 whitespace-nowrap">
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
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={e => { e.stopPropagation(); setEditingRecord(row); setIsFormModalOpen(true) }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 mr-1"
                          title="Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(row.id, row.running_no) }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100"
                          title="Delete"
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
        <div className="p-3 bg-slate-50 border-t text-[11px] text-slate-500 flex justify-between items-center">
          <span>Showing {sorted.length} of {tests.length} records</span>
          <span className="italic">💡 Double-click any row to view/edit details</span>
        </div>
      </div>

      {/* Modals */}
      <PasteExcelModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onSuccess={() => { window.location.reload() }}
        knownProjects={allProjects}
        knownSuppliers={allSuppliers}
        knownTestTypes={allTestTypes}
      />

      <TestFormModal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setEditingRecord(null) }}
        onSuccess={() => { window.location.reload() }}
        initialData={editingRecord}
        userRole={userRole}
        knownProjects={allProjects}
        knownSuppliers={allSuppliers}
        knownTestTypes={allTestTypes}
      />
    </div>
  )
}
