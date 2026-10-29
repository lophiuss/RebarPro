'use client'

import React, { useState, useRef, useMemo } from 'react'
import {
  X, ClipboardPaste, Check, AlertCircle, FileSpreadsheet,
  ArrowRight, Download, Copy, UploadCloud, Sparkles,
  AlertTriangle, ShieldCheck, RefreshCw, Zap, CheckCircle2,
  HelpCircle
} from 'lucide-react'
import {
  bulkImportQaqcTests,
  type DuplicateHandlingMode,
  type BulkImportItem,
  type BulkImportResult,
  type QaqcTestInput
} from '../actions'
import type { QaqcTestRecord } from './RecordsClient'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  knownProjects: string[]
  knownSuppliers: string[]
  knownTestTypes: string[]
  existingTests?: QaqcTestRecord[]
}

interface DuplicateMatch {
  existingRecord: QaqcTestRecord
  matchReason: string
}

export const TEMPLATE_COLUMNS = [
  'Project',
  'Supplier',
  'Marking',
  'Type of Test',
  'Quantity',
  'Unit',
  'Date Cast',
  'Date Tested',
  'Report Number',
  'Email Date',
  'QAQC Remarks',
  'PO Number',
  'PO Date',
  'PO Amount',
  'Invoice Number',
  'Invoice Date',
  'Invoice Amount',
  'Payment Status'
]

export const TEMPLATE_SAMPLE_ROWS = [
  [
    'Project Alpha',
    'Cast Laboratories',
    'Beam B1-04',
    'Concrete Cube (28D)',
    '2026-10-01',
    '2026-10-29',
    'REP-2026-0881',
    '2026-10-30',
    'Passed cube strength',
    'PO-26-0045',
    '2026-10-31',
    '450.00',
    'INV-8834',
    '2026-11-02',
    '450.00',
    'Pending'
  ],
  [
    'SBG Depot',
    'SETSCO Services',
    'Column C2-10',
    'Steel Tensile Test',
    '',
    '2026-10-15',
    'REP-2026-0902',
    '2026-10-16',
    'Sample submitted to lab',
    'PO-26-0052',
    '2026-10-18',
    '820.00',
    '',
    '',
    '',
    'Pending'
  ]
]

export function downloadQaqcTemplate() {
  const csvContent = '\uFEFF' + [
    TEMPLATE_COLUMNS.join(','),
    ...TEMPLATE_SAMPLE_ROWS.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', 'qaqc_test_import_template.csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const FIELD_OPTIONS = [
  { key: 'ignore', label: '-- Ignore Column --' },
  { key: 'running_no', label: 'Running No (e.g. QAQC-2026-0001)' },
  { key: 'project', label: 'Project *' },
  { key: 'supplier', label: 'Supplier / Lab *' },
  { key: 'marking', label: 'Marking / Element' },
  { key: 'test_type', label: 'Type of Test *' },
  { key: 'qty', label: 'Quantity' },
  { key: 'unit', label: 'Unit (nos, cubes, sets)' },
  { key: 'date_cast', label: 'Date Cast (YYYY-MM-DD)' },
  { key: 'date_test', label: 'Date Tested *' },
  { key: 'report_no', label: 'Report Number' },
  { key: 'email_date', label: 'Email Date' },
  { key: 'qaqc_remarks', label: 'QAQC Remarks' },
  { key: 'po_no', label: 'PO Number' },
  { key: 'po_date', label: 'PO Date' },
  { key: 'po_amount', label: 'PO Amount' },
  { key: 'invoice_no', label: 'Invoice Number' },
  { key: 'invoice_date', label: 'Invoice Date' },
  { key: 'invoice_amount', label: 'Invoice Amount' },
  { key: 'cn_no', label: 'Credit Note (CN) Number' },
  { key: 'cn_date', label: 'Credit Note Date' },
  { key: 'cn_amount', label: 'Credit Note Amount' },
  { key: 'cn_remarks', label: 'Credit Note Remarks' },
  { key: 'payment_status', label: 'Payment Status' },
]

function normalizeDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null

  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const slashParts = s.split(/[\/\-\.]/)
  if (slashParts.length === 3) {
    let [d, m, y] = slashParts
    if (d.length === 4) {
      // YYYY/MM/DD
      return `${d}-${m.padStart(2, '0')}-${y.padStart(2, '0')}`
    }
    if (y.length === 2) y = `20${y}`
    if (y.length === 4) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
  }

  // Excel serial number (e.g. 45570)
  const num = Number(s)
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const d = new Date((num - (25567 + 2)) * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }

  return s
}

// Split a CSV line respecting quoted strings
function parseCsvLine(text: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim())
      cur = ''
    } else {
      cur += char
    }
  }
  result.push(cur.trim())
  return result
}

export default function PasteExcelModal({
  isOpen,
  onClose,
  onSuccess,
  knownProjects,
  knownSuppliers,
  knownTestTypes,
  existingTests = []
}: Props) {
  const [rawText, setRawText] = useState('')
  const [hasHeader, setHasHeader] = useState(true)
  const [columnMap, setColumnMap] = useState<string[]>([])
  const [parsedRows, setParsedRows] = useState<string[][]>([])
  const [defaultProject, setDefaultProject] = useState('')
  const [defaultSupplier, setDefaultSupplier] = useState('')
  const [defaultTestType, setDefaultTestType] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copiedHeader, setCopiedHeader] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState<DuplicateHandlingMode>('skip')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const parsePastedText = (text: string) => {
    setRawText(text)
    setErrorMsg(null)
    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      setParsedRows([])
      setColumnMap([])
      return
    }

    // Detect TSV or CSV
    const isTsv = lines[0].includes('\t')
    const grid: string[][] = lines.map(line => {
      if (isTsv) {
        return line.split('\t').map(c => c.trim())
      }
      return parseCsvLine(line)
    })

    setParsedRows(grid)

    // Auto-detect header columns
    const firstRow = grid[0]
    const detected: string[] = firstRow.map(h => {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (lower.includes('running') || lower.includes('qaqcno') || lower.includes('runno')) return 'running_no'
      if (lower.includes('proj')) return 'project'
      if (lower.includes('supp') || lower.includes('lab') || lower.includes('vendor')) return 'supplier'
      if (lower.includes('mark') || lower.includes('heat') || lower.includes('elem') || lower.includes('sample')) return 'marking'
      if (lower.includes('type') || lower.includes('testtype')) return 'test_type'
      if (lower.includes('qty') || lower.includes('quantity') || lower.includes('count')) return 'qty'
      if (lower.includes('unit') || lower.includes('uom')) return 'unit'
      if (lower.includes('cast')) return 'date_cast'
      if (lower.includes('tested') || lower.includes('datetest') || lower.includes('testdate')) return 'date_test'
      if (lower.includes('report') || lower.includes('cert')) return 'report_no'
      if (lower.includes('email') || lower.includes('sent') || lower.includes('submit')) return 'email_date'
      if (lower.includes('pono') || lower.includes('ponum')) return 'po_no'
      if (lower.includes('podate')) return 'po_date'
      if (lower.includes('poamt') || lower.includes('poamount') || lower.includes('poprice')) return 'po_amount'
      if (lower.includes('invno') || lower.includes('invoiceno') || lower.includes('invoicenum')) return 'invoice_no'
      if (lower.includes('invdate') || lower.includes('invoicedate')) return 'invoice_date'
      if (lower.includes('invamt') || lower.includes('invamount') || lower.includes('invoiceamount')) return 'invoice_amount'
      if (lower.includes('cnno') || lower.includes('creditnoteno') || lower.includes('creditnote#')) return 'cn_no'
      if (lower.includes('cndate') || lower.includes('creditnotedate')) return 'cn_date'
      if (lower.includes('cnamt') || lower.includes('cnamount') || lower.includes('creditnoteamt')) return 'cn_amount'
      if (lower.includes('cnremark') || lower.includes('cnreason')) return 'cn_remarks'
      if (lower.includes('pay') || lower.includes('status')) return 'payment_status'
      if (lower.includes('remark') || lower.includes('comment') || lower.includes('note')) return 'qaqc_remarks'
      return 'ignore'
    })

    // If at least 2 columns match known fields, assume header exists
    const matchCount = detected.filter(k => k !== 'ignore').length
    const likelyHasHeader = matchCount >= 2
    setHasHeader(likelyHasHeader)

    if (likelyHasHeader) {
      setColumnMap(detected)
    } else {
      // Default sequence
      const defaultSequence = [
        'project', 'supplier', 'marking', 'test_type',
        'date_cast', 'date_test', 'report_no', 'email_date',
        'qaqc_remarks', 'po_no', 'po_date', 'po_amount',
        'invoice_no', 'invoice_date', 'invoice_amount', 'payment_status'
      ]
      setColumnMap(firstRow.map((_, idx) => defaultSequence[idx] || 'ignore'))
    }
  }

  const handleCopyHeaders = () => {
    navigator.clipboard.writeText(TEMPLATE_COLUMNS.join('\t'))
    setCopiedHeader(true)
    setTimeout(() => setCopiedHeader(false), 2000)
  }

  const handleLoadSample = () => {
    const tsvData = [
      TEMPLATE_COLUMNS.join('\t'),
      ...TEMPLATE_SAMPLE_ROWS.map(r => r.join('\t'))
    ].join('\n')
    parsePastedText(tsvData)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const content = ev.target?.result as string
      if (content) parsePastedText(content)
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = ev => {
        const content = ev.target?.result as string
        if (content) parsePastedText(content)
      }
      reader.readAsText(file)
    }
  }

  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows

  // Construct valid QaqcTestInput items
  const compiledItems: (QaqcTestInput & { running_no?: string | null })[] = dataRows.map(row => {
    const item: Record<string, any> = {}
    row.forEach((val, colIdx) => {
      const field = columnMap[colIdx]
      if (field && field !== 'ignore') {
        item[field] = val
      }
    })

    const finalProject = item.project?.trim() || defaultProject.trim()
    const finalSupplier = item.supplier?.trim() || defaultSupplier.trim()
    const finalTestType = item.test_type?.trim() || defaultTestType.trim()
    const finalDateTest = normalizeDate(item.date_test) || new Date().toISOString().slice(0, 10)

    return {
      running_no: item.running_no?.trim() || null,
      project: finalProject,
      supplier: finalSupplier,
      marking: item.marking?.trim() || null,
      test_type: finalTestType,
      qty: item.qty ? Number(String(item.qty).replace(/[^0-9.]/g, '')) : 1,
      unit: item.unit?.trim() || 'nos',
      date_cast: normalizeDate(item.date_cast),
      date_test: finalDateTest,
      report_no: item.report_no?.trim() || null,
      email_date: normalizeDate(item.email_date),
      qaqc_remarks: item.qaqc_remarks?.trim() || null,
      po_no: item.po_no?.trim() || null,
      po_date: normalizeDate(item.po_date),
      po_amount: item.po_amount ? Number(String(item.po_amount).replace(/[^0-9.]/g, '')) : null,
      invoice_no: item.invoice_no?.trim() || null,
      invoice_date: normalizeDate(item.invoice_date),
      invoice_amount: item.invoice_amount ? Number(String(item.invoice_amount).replace(/[^0-9.]/g, '')) : null,
      cn_no: item.cn_no?.trim() || null,
      cn_date: normalizeDate(item.cn_date),
      cn_amount: item.cn_amount ? Number(String(item.cn_amount).replace(/[^0-9.]/g, '')) : null,
      cn_remarks: item.cn_remarks?.trim() || null,
      payment_status: ['Paid', 'Partially Paid', 'Void'].includes(item.payment_status) ? item.payment_status : 'Pending',
    }
  })

  // Duplicate detection against existing database tests
  const rowMatches = useMemo<(DuplicateMatch | null)[]>(() => {
    if (!existingTests || existingTests.length === 0) {
      return compiledItems.map(() => null)
    }

    return compiledItems.map(item => {
      // 1. By Running No (if provided in sheet)
      if (item.running_no && item.running_no.trim()) {
        const rNo = item.running_no.trim().toLowerCase()
        const found = existingTests.find(t => t.running_no && t.running_no.toLowerCase() === rNo)
        if (found) {
          return { existingRecord: found, matchReason: `Running No (${found.running_no})` }
        }
      }

      // 2. By Report No (if report_no is provided)
      if (item.report_no && item.report_no.trim().length >= 2) {
        const rep = item.report_no.trim().toLowerCase()
        const found = existingTests.find(t => t.report_no && t.report_no.trim().toLowerCase() === rep)
        if (found) {
          return { existingRecord: found, matchReason: `Report #${found.report_no}` }
        }
      }

      // 3. By Composite: Project + Test Type + Date Tested + Marking
      if (item.project && item.test_type && item.date_test) {
        const proj = item.project.trim().toLowerCase()
        const type = item.test_type.trim().toLowerCase()
        const dTest = item.date_test.trim()
        const mark = item.marking?.trim().toLowerCase() || ''

        const found = existingTests.find(t => {
          const tProj = t.project.trim().toLowerCase()
          const tType = t.test_type.trim().toLowerCase()
          const tDTest = t.date_test.trim()
          const tMark = t.marking?.trim().toLowerCase() || ''

          if (tProj !== proj || tType !== type || tDTest !== dTest) return false
          if (mark || tMark) {
            return mark === tMark
          }
          return true
        })

        if (found) {
          const label = found.marking ? `Marking "${found.marking}"` : `Test on ${found.date_test}`
          return { existingRecord: found, matchReason: `${label} (${found.running_no})` }
        }
      }

      return null
    })
  }, [compiledItems, existingTests])

  const duplicateCount = useMemo(() => rowMatches.filter(Boolean).length, [rowMatches])
  const newCount = compiledItems.length - duplicateCount

  const itemsWithExisting = useMemo<BulkImportItem[]>(() => {
    return compiledItems.map((item, idx) => ({
      ...item,
      existingId: rowMatches[idx]?.existingRecord.id,
    }))
  }, [compiledItems, rowMatches])

  const isValid = compiledItems.length > 0 && compiledItems.every(r => r.project && r.supplier && r.test_type && r.date_test)

  const handleImportClick = () => {
    if (!isValid) {
      setErrorMsg('Please ensure Project, Supplier, and Test Type are provided for each row (or set fallback defaults below).')
      return
    }
    setErrorMsg(null)
    // If duplicates exist, prompt double-check confirmation first
    if (duplicateCount > 0) {
      setShowConfirmModal(true)
    } else {
      executeImport()
    }
  }

  const executeImport = async () => {
    if (!isValid) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const res = await bulkImportQaqcTests(itemsWithExisting, duplicateMode)
      setImportResult(res)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1500)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to import records')
      setSaving(false)
      setShowConfirmModal(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Paste or Import from Excel / Google Sheets</h2>
              <p className="text-xs text-slate-500">Copy table rows from Excel (Ctrl+C) and paste below, or download our ready-to-use template</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template Helper Toolbar */}
        <div className="bg-emerald-50/60 border-b border-emerald-100 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-emerald-900">Need the template?</span>
            <button
              type="button"
              onClick={downloadQaqcTemplate}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg shadow-2xs transition"
            >
              <Download className="w-3.5 h-3.5" />
              Download Excel Template (.csv)
            </button>
            <button
              type="button"
              onClick={handleCopyHeaders}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 font-medium px-3 py-1.5 rounded-lg transition"
            >
              {copiedHeader ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              {copiedHeader ? 'Headers Copied!' : 'Copy Headers for Excel'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.tsv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium px-3 py-1.5 rounded-lg transition"
            >
              <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
              Upload .CSV File
            </button>
            {parsedRows.length === 0 && (
              <button
                type="button"
                onClick={handleLoadSample}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-emerald-700 underline font-medium"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Try Sample Data
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {parsedRows.length === 0 ? (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-2xl transition ${isDragging ? 'ring-2 ring-emerald-500 bg-emerald-50' : ''}`}
            >
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-2">
                Paste Excel Data Here (or drag and drop a .CSV file)
              </label>
              <textarea
                autoFocus
                rows={9}
                value={rawText}
                onChange={e => parsePastedText(e.target.value)}
                placeholder={"Project\tSupplier\tMarking\tType of Test\tDate Cast\tDate Tested\tReport Number\tEmail Date\tPO Number\tPO Date\tPO Amount\nProject Alpha\tCast Laboratories\tBeam B1-04\tConcrete Cube (28D)\t2026-10-01\t2026-10-29\tREP-2026-0881\t2026-10-30\tPO-26-0045\t2026-10-31\t450.00\nSBG Depot\tSETSCO Services\tColumn C2-10\tSteel Tensile Test\t\t2026-10-15\tREP-2026-0902\t2026-10-16\t\t\t"}
                className="w-full font-mono text-xs border-2 border-dashed border-emerald-300 rounded-xl p-4 bg-emerald-50/20 focus:bg-white focus:border-emerald-500 focus:outline-hidden transition"
              />
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 mt-2 gap-2">
                <span>💡 <strong>Quick Steps:</strong> 1. Download template &gt; 2. Fill rows in Excel &gt; 3. Press <strong>Ctrl+C</strong> in Excel and <strong>Ctrl+V</strong> here.</span>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="text-emerald-700 hover:text-emerald-800 font-semibold underline"
                >
                  Load 2 sample rows to see preview
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-md border shadow-xs">
                    {dataRows.length} rows found
                  </span>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasHeader}
                      onChange={e => setHasHeader(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    First row contains headers
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => { setRawText(''); setParsedRows([]); setColumnMap([]) }}
                  className="text-xs text-slate-500 hover:text-red-600 underline font-medium"
                >
                  Clear & paste new
                </button>
              </div>

              {/* Default fallbacks if Excel is missing some columns */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-amber-50/60 p-3 rounded-xl border border-amber-200/80 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-amber-900 mb-1">Fallback Project (if blank):</label>
                  <input
                    type="text"
                    value={defaultProject}
                    onChange={e => setDefaultProject(e.target.value)}
                    placeholder="e.g. Project Alpha"
                    list="known-projects"
                    className="w-full border rounded px-2 py-1 bg-white"
                  />
                  <datalist id="known-projects">
                    {knownProjects.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-900 mb-1">Fallback Supplier / Lab:</label>
                  <input
                    type="text"
                    value={defaultSupplier}
                    onChange={e => setDefaultSupplier(e.target.value)}
                    placeholder="e.g. Cast Laboratories"
                    list="known-suppliers"
                    className="w-full border rounded px-2 py-1 bg-white"
                  />
                  <datalist id="known-suppliers">
                    {knownSuppliers.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-900 mb-1">Fallback Test Type:</label>
                  <input
                    type="text"
                    value={defaultTestType}
                    onChange={e => setDefaultTestType(e.target.value)}
                    placeholder="e.g. Concrete Cube (28D)"
                    list="known-test-types"
                    className="w-full border rounded px-2 py-1 bg-white"
                  />
                  <datalist id="known-test-types">
                    {knownTestTypes.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
              </div>

              {/* Duplicate Detection Alert & Mode Selector */}
              {duplicateCount > 0 ? (
                <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-amber-950">
                          {duplicateCount} Existing Record{duplicateCount === 1 ? '' : 's'} Detected
                        </h3>
                        <span className="text-[11px] font-semibold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                          {newCount} New · {duplicateCount} Existing
                        </span>
                      </div>
                      <p className="text-xs text-amber-900/80 mt-0.5">
                        These records match tests already in the system (by Report No or Project + Marking + Date). How would you like to handle them?
                      </p>
                    </div>
                  </div>

                  {/* 3 Choices */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-0.5">
                    {/* Mode 1: Skip */}
                    <label className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition select-none ${
                      duplicateMode === 'skip'
                        ? 'bg-white border-emerald-500 shadow-xs ring-1 ring-emerald-500'
                        : 'bg-white/60 border-amber-200 hover:bg-white hover:border-amber-300'
                    }`}>
                      <input
                        type="radio"
                        name="dup_mode"
                        checked={duplicateMode === 'skip'}
                        onChange={() => setDuplicateMode('skip')}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                          <span>⚡ Skip Duplicates</span>
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">Recommended</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                          Import only <strong>{newCount} new</strong> records. Leave existing {duplicateCount} records completely untouched.
                        </p>
                      </div>
                    </label>

                    {/* Mode 2: Update */}
                    <label className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition select-none ${
                      duplicateMode === 'update'
                        ? 'bg-white border-blue-500 shadow-xs ring-1 ring-blue-500'
                        : 'bg-white/60 border-amber-200 hover:bg-white hover:border-amber-300'
                    }`}>
                      <input
                        type="radio"
                        name="dup_mode"
                        checked={duplicateMode === 'update'}
                        onChange={() => setDuplicateMode('update')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>🔄 Update Existing</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                          Update the <strong>{duplicateCount} existing</strong> records with new details. <em>(Preserves existing POs & Invoices).</em>
                        </p>
                      </div>
                    </label>

                    {/* Mode 3: Insert All */}
                    <label className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition select-none ${
                      duplicateMode === 'insert_all'
                        ? 'bg-white border-purple-500 shadow-xs ring-1 ring-purple-500'
                        : 'bg-white/60 border-amber-200 hover:bg-white hover:border-amber-300'
                    }`}>
                      <input
                        type="radio"
                        name="dup_mode"
                        checked={duplicateMode === 'insert_all'}
                        onChange={() => setDuplicateMode('insert_all')}
                        className="mt-0.5 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>➕ Import All as New</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                          Force import all <strong>{compiledItems.length}</strong> rows as new records with new running numbers.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span><strong>Zero duplicates detected:</strong> All {compiledItems.length} rows are brand new records and ready to import.</span>
                </div>
              )}

              {/* Column Mapping & Data Preview Table */}
              <div className="border rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[46vh]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 shadow-xs">
                      <tr>
                        <th className="p-2 text-slate-500 font-semibold w-8 text-center">#</th>
                        <th className="p-2 text-slate-700 font-semibold min-w-[105px]">Status</th>
                        {columnMap.map((curField, idx) => (
                          <th key={idx} className="p-2 min-w-[140px]">
                            <select
                              value={curField}
                              onChange={e => {
                                const next = [...columnMap]
                                next[idx] = e.target.value
                                setColumnMap(next)
                              }}
                              className={`w-full text-xs font-semibold rounded-md p-1 border ${
                                curField !== 'ignore' ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-white text-slate-500'
                              }`}
                            >
                              {FIELD_OPTIONS.map(opt => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                              ))}
                            </select>
                            {hasHeader && parsedRows[0] && (
                              <div className="text-[10px] text-slate-500 mt-1 truncate" title={parsedRows[0][idx]}>
                                Header: &quot;{parsedRows[0][idx]}&quot;
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {compiledItems.slice(0, 50).map((item, rowIdx) => {
                        const rowValid = item.project && item.supplier && item.test_type && item.date_test
                        const match = rowMatches[rowIdx]
                        const isDup = !!match

                        let rowStyle = 'hover:bg-slate-50 transition'
                        if (!rowValid) {
                          rowStyle = 'bg-red-50/40'
                        } else if (isDup) {
                          if (duplicateMode === 'skip') {
                            rowStyle = 'bg-slate-50/80 opacity-60 text-slate-400'
                          } else if (duplicateMode === 'update') {
                            rowStyle = 'bg-blue-50/50'
                          } else {
                            rowStyle = 'bg-amber-50/40'
                          }
                        }

                        return (
                          <tr key={rowIdx} className={rowStyle}>
                            <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{rowIdx + 1}</td>
                            <td className="p-2 whitespace-nowrap">
                              {match ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    duplicateMode === 'skip'
                                      ? 'bg-slate-200 text-slate-600 line-through'
                                      : duplicateMode === 'update'
                                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                                  }`}>
                                    {duplicateMode === 'skip' ? '⚡ SKIP' : duplicateMode === 'update' ? '🔄 UPDATE' : '➕ DUPLICATE'}
                                  </span>
                                  <span
                                    className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]"
                                    title={`Existing: ${match.existingRecord.running_no} (${match.matchReason})`}
                                  >
                                    {match.existingRecord.running_no}
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  🟢 NEW
                                </span>
                              )}
                            </td>
                            {columnMap.map((field, colIdx) => {
                              const rawVal = dataRows[rowIdx]?.[colIdx] ?? ''
                              return (
                                <td key={colIdx} className="p-2 truncate max-w-[200px]" title={rawVal}>
                                  {field === 'ignore' ? (
                                    <span className="text-slate-300 line-through">{rawVal}</span>
                                  ) : (
                                    <span className={!rawVal && ['project', 'supplier', 'test_type'].includes(field) ? 'text-red-500 font-semibold italic' : ''}>
                                      {rawVal || (item as any)[field] || '-'}
                                    </span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {compiledItems.length > 50 && (
                  <div className="p-2 text-center text-xs text-slate-500 bg-slate-50 border-t">
                    Showing first 50 of {compiledItems.length} rows. All {compiledItems.length} will be processed.
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition"
          >
            Cancel
          </button>
          {parsedRows.length > 0 && (
            <button
              type="button"
              disabled={saving || !isValid}
              onClick={handleImportClick}
              className={`flex items-center gap-2 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold text-sm shadow-md transition ${
                duplicateCount > 0 && duplicateMode === 'update'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : duplicateCount > 0 && duplicateMode === 'insert_all'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {saving
                ? 'Processing…'
                : duplicateCount > 0 && duplicateMode === 'skip'
                ? `Import ${newCount} New Record${newCount === 1 ? '' : 's'} (Skip ${duplicateCount})`
                : duplicateCount > 0 && duplicateMode === 'update'
                ? `Import ${newCount} New & Update ${duplicateCount} Existing`
                : duplicateCount > 0 && duplicateMode === 'insert_all'
                ? `Import All ${compiledItems.length} Records as New`
                : `Import ${compiledItems.length} Test Record${compiledItems.length === 1 ? '' : 's'}`
              }
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Double-Check Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-xs shrink-0 ${
                duplicateMode === 'skip'
                  ? 'bg-emerald-100 text-emerald-700'
                  : duplicateMode === 'update'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700'
              }`}>
                {duplicateMode === 'skip' ? <Zap className="w-5 h-5" /> : duplicateMode === 'update' ? <RefreshCw className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm QAQC Batch Import</h3>
                <p className="text-xs text-slate-500">Please review your duplicate handling choice</p>
              </div>
            </div>

            <div className="bg-slate-50 border rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-600">Total rows pasted from Excel:</span>
                <span className="font-bold text-slate-800 font-mono text-sm">{compiledItems.length}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-600">Selected duplicate action:</span>
                <span className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded font-mono ${
                  duplicateMode === 'skip' ? 'bg-emerald-100 text-emerald-800' : duplicateMode === 'update' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                }`}>
                  {duplicateMode === 'skip' ? '⚡ Skip Duplicates' : duplicateMode === 'update' ? '🔄 Update Existing' : '➕ Import All as New'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-emerald-700 font-medium">New records to be created:</span>
                <span className="font-bold text-emerald-800 font-mono text-sm">+{duplicateMode === 'insert_all' ? compiledItems.length : newCount}</span>
              </div>
              {duplicateCount > 0 && (
                <div className="flex justify-between items-center py-1">
                  <span className={duplicateMode === 'skip' ? 'text-slate-400 line-through' : 'text-blue-700 font-medium'}>
                    Existing records {duplicateMode === 'skip' ? 'skipped' : duplicateMode === 'update' ? 'to update' : 'to duplicate'}:
                  </span>
                  <span className={`font-bold font-mono text-sm ${duplicateMode === 'skip' ? 'text-slate-400' : 'text-blue-800'}`}>
                    {duplicateCount}
                  </span>
                </div>
              )}
            </div>

            {duplicateMode === 'skip' && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Safe & clean:</strong> Existing tests in your database will not be touched or modified. Only brand-new tests will be created.</span>
              </div>
            )}

            {duplicateMode === 'update' && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-3 text-xs flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span><strong>Smart Merge Protection:</strong> Existing PO Numbers, Invoices, and Payment statuses entered by Purchaser/Accounts will be safely preserved.</span>
              </div>
            )}

            {duplicateMode === 'insert_all' && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span><strong>Notice:</strong> This will create duplicate test records in your database, each with a new running number.</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Go Back & Review
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={executeImport}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md flex items-center gap-1.5 transition ${
                  duplicateMode === 'update'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : duplicateMode === 'insert_all'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {saving ? 'Processing…' : 'Confirm & Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Toast Modal */}
      {importResult && (
        <div className="fixed inset-0 z-70 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-3.5 border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Batch Import Successful!</h3>
              <p className="text-xs text-slate-500 mt-0.5">QAQC Test records have been updated</p>
            </div>
            <div className="text-xs text-slate-700 space-y-1.5 bg-slate-50 p-3.5 rounded-xl border text-left font-medium">
              {importResult.insertedCount > 0 && (
                <div className="flex justify-between items-center text-emerald-700">
                  <span>✓ Created new tests:</span>
                  <span className="font-bold font-mono">+{importResult.insertedCount}</span>
                </div>
              )}
              {importResult.updatedCount > 0 && (
                <div className="flex justify-between items-center text-blue-700">
                  <span>✓ Updated existing tests:</span>
                  <span className="font-bold font-mono">{importResult.updatedCount}</span>
                </div>
              )}
              {importResult.skippedCount > 0 && (
                <div className="flex justify-between items-center text-slate-500">
                  <span>⚡ Skipped duplicates:</span>
                  <span className="font-bold font-mono">{importResult.skippedCount}</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400">Refreshing tracker data…</p>
          </div>
        </div>
      )}
    </div>
  )
}
