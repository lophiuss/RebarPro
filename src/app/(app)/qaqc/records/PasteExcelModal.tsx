'use client'

import React, { useState } from 'react'
import { X, ClipboardPaste, Check, AlertCircle, FileSpreadsheet, ArrowRight } from 'lucide-react'
import { bulkCreateQaqcTests, type QaqcTestInput } from '../actions'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  knownProjects: string[]
  knownSuppliers: string[]
  knownTestTypes: string[]
}

const FIELD_OPTIONS = [
  { key: 'ignore', label: '-- Ignore Column --' },
  { key: 'project', label: 'Project *' },
  { key: 'supplier', label: 'Supplier / Lab *' },
  { key: 'marking', label: 'Marking / Element' },
  { key: 'test_type', label: 'Type of Test *' },
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

export default function PasteExcelModal({ isOpen, onClose, onSuccess, knownProjects, knownSuppliers, knownTestTypes }: Props) {
  const [rawText, setRawText] = useState('')
  const [hasHeader, setHasHeader] = useState(true)
  const [columnMap, setColumnMap] = useState<string[]>([])
  const [parsedRows, setParsedRows] = useState<string[][]>([])
  const [defaultProject, setDefaultProject] = useState('')
  const [defaultSupplier, setDefaultSupplier] = useState('')
  const [defaultTestType, setDefaultTestType] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

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

    const grid = lines.map(line => line.split('\t').map(c => c.trim()))
    setParsedRows(grid)

    // Auto-detect header columns
    const firstRow = grid[0]
    const detected: string[] = firstRow.map(h => {
      const lower = h.toLowerCase()
      if (lower.includes('proj')) return 'project'
      if (lower.includes('supp') || lower.includes('lab') || lower.includes('vendor')) return 'supplier'
      if (lower.includes('mark') || lower.includes('heat') || lower.includes('elem') || lower.includes('sample')) return 'marking'
      if (lower.includes('test') && (lower.includes('type') || lower.includes('name'))) return 'test_type'
      if (lower.includes('cast')) return 'date_cast'
      if (lower.includes('test') && lower.includes('date')) return 'date_test'
      if (lower.includes('report') || lower.includes('cert')) return 'report_no'
      if (lower.includes('email') || lower.includes('sent') || lower.includes('submit')) return 'email_date'
      if (lower.includes('po') && lower.includes('no')) return 'po_no'
      if (lower.includes('po') && lower.includes('date')) return 'po_date'
      if (lower.includes('po') && (lower.includes('amt') || lower.includes('amount') || lower.includes('price'))) return 'po_amount'
      if (lower.includes('inv') && lower.includes('no')) return 'invoice_no'
      if (lower.includes('inv') && lower.includes('date')) return 'invoice_date'
      if (lower.includes('inv') && (lower.includes('amt') || lower.includes('amount'))) return 'invoice_amount'
      if (lower.includes('pay') || lower.includes('status')) return 'payment_status'
      return 'ignore'
    })

    // If at least 2 columns match known fields, assume header exists
    const matchCount = detected.filter(k => k !== 'ignore').length
    const likelyHasHeader = matchCount >= 2
    setHasHeader(likelyHasHeader)

    if (likelyHasHeader) {
      setColumnMap(detected)
    } else {
      // Default guess: Project, Supplier, Marking, Test Type, Date Cast, Date Test, Report No, Email Date
      const defaultSequence = ['project', 'supplier', 'marking', 'test_type', 'date_cast', 'date_test', 'report_no', 'email_date']
      setColumnMap(firstRow.map((_, idx) => defaultSequence[idx] || 'ignore'))
    }
  }

  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows

  // Construct valid QaqcTestInput items
  const compiledItems: QaqcTestInput[] = dataRows.map(row => {
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
      project: finalProject,
      supplier: finalSupplier,
      marking: item.marking?.trim() || null,
      test_type: finalTestType,
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
      payment_status: ['Paid', 'Partially Paid', 'Void'].includes(item.payment_status) ? item.payment_status : 'Pending',
    }
  })

  const isValid = compiledItems.length > 0 && compiledItems.every(r => r.project && r.supplier && r.test_type && r.date_test)

  const handleImport = async () => {
    if (!isValid) {
      setErrorMsg('Please ensure Project, Supplier, and Test Type are provided for each row (or set defaults).')
      return
    }
    setSaving(true)
    setErrorMsg(null)
    try {
      await bulkCreateQaqcTests(compiledItems)
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to import records')
    } finally {
      setSaving(false)
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
              <h2 className="text-base font-bold text-slate-800">Paste from Excel or Google Sheets</h2>
              <p className="text-xs text-slate-500">Copy table rows in Excel (Ctrl+C) and paste them here (Ctrl+V)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {parsedRows.length === 0 ? (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
                Paste Excel Data Here
              </label>
              <textarea
                autoFocus
                rows={9}
                value={rawText}
                onChange={e => parsePastedText(e.target.value)}
                placeholder={"Project\tSupplier\tMarking\tType of Test\tDate Cast\tDate Tested\tReport No\tEmail Date\nSBG\tCast Lab\tBeam 1\tConcrete Cube (28D)\t2026-09-01\t2026-09-29\tR-1029\t2026-10-02\nProject A\tSETSCO\tCol C2\tSteel Tensile\t\t2026-10-15\tR-2044\t2026-10-18"}
                className="w-full font-mono text-xs border-2 border-dashed border-emerald-300 rounded-xl p-4 bg-emerald-50/20 focus:bg-white focus:border-emerald-500 focus:outline-hidden transition"
              />
              <p className="text-xs text-slate-400 mt-2">
                💡 Tip: Highlight your table in Excel or Google Sheets, press <strong>Ctrl+C</strong>, then click the box above and press <strong>Ctrl+V</strong>.
              </p>
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
                    placeholder="e.g. SBG"
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
                    placeholder="e.g. Concrete Cube 28 Days"
                    list="known-test-types"
                    className="w-full border rounded px-2 py-1 bg-white"
                  />
                  <datalist id="known-test-types">
                    {knownTestTypes.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
              </div>

              {/* Column Mapping & Data Preview Table */}
              <div className="border rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[46vh]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 shadow-xs">
                      <tr>
                        <th className="p-2 text-slate-500 font-semibold w-10 text-center">#</th>
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
                                Excel: &quot;{parsedRows[0][idx]}&quot;
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {compiledItems.slice(0, 30).map((item, rowIdx) => {
                        const rowValid = item.project && item.supplier && item.test_type && item.date_test
                        return (
                          <tr key={rowIdx} className={`hover:bg-slate-50 ${!rowValid ? 'bg-red-50/40' : ''}`}>
                            <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{rowIdx + 1}</td>
                            {columnMap.map((field, colIdx) => {
                              const rawVal = dataRows[rowIdx]?.[colIdx] ?? ''
                              return (
                                <td key={colIdx} className="p-2 truncate max-w-[200px]" title={rawVal}>
                                  {field === 'ignore' ? (
                                    <span className="text-slate-300 line-through">{rawVal}</span>
                                  ) : (
                                    <span className={!rawVal && ['project', 'supplier', 'test_type'].includes(field) ? 'text-red-500 font-semibold italic' : 'text-slate-800'}>
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
                {compiledItems.length > 30 && (
                  <div className="p-2 text-center text-xs text-slate-500 bg-slate-50 border-t">
                    Showing first 30 of {compiledItems.length} rows. All {compiledItems.length} will be imported.
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
              onClick={handleImport}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold text-sm shadow-md transition"
            >
              {saving ? 'Importing…' : `Import ${compiledItems.length} Test Record${compiledItems.length === 1 ? '' : 's'}`}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
