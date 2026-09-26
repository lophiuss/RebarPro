'use client'

import { useState, Fragment } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Loader2, Upload, FileSearch } from 'lucide-react'
import { previewPlantproImport, commitPlantproImport, type ImportPreviewWorker, type ImportPreviewResult, type ImportCommitSummary } from '../actions'

const SOURCE_LABEL: Record<ImportPreviewWorker['source'], string> = { both: 'Both', 'pdf-only': 'PDF only', 'excel-only': 'Excel only' }
const SOURCE_CLASS: Record<ImportPreviewWorker['source'], string> = { both: 'bg-green-100 text-green-700', 'pdf-only': 'bg-amber-100 text-amber-700', 'excel-only': 'bg-amber-100 text-amber-700' }

export default function ImportClient() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [commitResult, setCommitResult] = useState<ImportCommitSummary | null>(null)

  const handlePreview = async () => {
    if (!pdfFile && !excelFile) { setError('Choose at least one file (timecard PDF and/or worker-details Excel).'); return }
    setError(null); setCommitResult(null); setPreviewing(true)
    try {
      const fd = new FormData()
      if (pdfFile) fd.set('pdf', pdfFile)
      if (excelFile) fd.set('excel', excelFile)
      const data = await previewPlantproImport(fd)
      setPreview(data)
      setExcluded(new Set(data.workers.filter(w => w.checksumOk === false).map(w => w.workerId)))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  const handleCommit = async () => {
    if (!preview) return
    setCommitting(true); setError(null)
    try {
      const included = preview.workers.filter(w => !excluded.has(w.workerId))
      const skippedCount = preview.workers.length - included.length
      const result = await commitPlantproImport(included, preview.period?.month || null, [])
      setCommitResult({ ...result, skipped: result.skipped + skippedCount })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCommitting(false)
    }
  }

  const toggleExclude = (workerId: string) => setExcluded(prev => { const next = new Set(prev); next.has(workerId) ? next.delete(workerId) : next.add(workerId); return next })
  const toggleExpand = (workerId: string) => setExpanded(prev => { const next = new Set(prev); next.has(workerId) ? next.delete(workerId) : next.add(workerId); return next })

  return (
    <>
      <div className="bg-white border rounded-xl shadow-sm p-5 mb-6">
        <h3 className="font-bold mb-2">1. Upload Files</h3>
        <p className="text-sm text-gray-500 mb-4">
          Upload the electronic time-card PDF (attendance export, one page per worker) and/or the worker-details Excel
          (nationality, passport, DOB, salary, hostel). At least one file is required.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          {([['Timecard PDF', '.pdf', pdfFile, setPdfFile], ['Worker Details Excel', '.xlsx,.xls', excelFile, setExcelFile]] as const).map(([label, accept, file, setFile]) => (
            <label key={label} className={`flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition ${file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/40'}`}>
              {file ? <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" /> : <Upload className="w-6 h-6 text-indigo-500 flex-shrink-0" />}
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">{label}</span>
                <span className="block text-xs text-gray-500 truncate">{file ? file.name : 'Click to choose a file'}</span>
              </span>
              <input type="file" accept={accept} onChange={e => setFile(e.target.files?.[0] || null)} className="hidden" />
            </label>
          ))}
        </div>
        <button onClick={handlePreview} disabled={previewing || (!pdfFile && !excelFile)} className="flex items-center justify-center gap-2 w-full sm:w-auto bg-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-600 transition-colors">
          {previewing ? <><Loader2 className="w-4 h-4 animate-spin" /> Parsing files…</> : <><FileSearch className="w-4 h-4" /> Preview Import</>}
        </button>
        <p className="text-xs text-gray-400 mt-2">Preview only reads the files — nothing is saved until you press Commit in step 2.</p>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </div>

      {preview && (
        <div className="bg-white border rounded-xl shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-bold">
              2. Review ({preview.workers.length} workers{preview.period ? `, period ${preview.period.days[0]} to ${preview.period.days[preview.period.days.length - 1]}` : ''})
            </h3>
            <button onClick={handleCommit} disabled={committing} className="flex items-center gap-2 bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-60 shadow-sm transition-colors">
              {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Committing...</> : <><Upload className="w-3.5 h-3.5" /> Commit Import ({preview.workers.length - excluded.size} of {preview.workers.length})</>}
            </button>
          </div>
          {preview.excelErrors.length > 0 && (
            <p className="text-amber-600 text-sm mb-3">{preview.excelErrors.length} Excel row(s) had parse errors and were skipped.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase text-left border-b">
                  <th className="pb-2">Exclude</th><th></th><th>Worker ID</th><th>Name</th><th>Source</th><th>New/Existing</th><th>Checksum</th><th>Hostel</th>
                </tr>
              </thead>
              <tbody>
                {preview.workers.map(w => {
                  const isExpanded = expanded.has(w.workerId)
                  const isExcluded = excluded.has(w.workerId)
                  return (
                    <Fragment key={w.workerId}>
                      <tr className={`border-b border-gray-100 ${isExcluded ? 'opacity-40' : ''}`}>
                        <td className="py-2"><input type="checkbox" checked={isExcluded} onChange={() => toggleExclude(w.workerId)} /></td>
                        <td><button onClick={() => toggleExpand(w.workerId)} className="p-1 hover:bg-gray-100 rounded">{isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button></td>
                        <td>{w.workerId}</td>
                        <td>{w.name}</td>
                        <td><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SOURCE_CLASS[w.source]}`}>{SOURCE_LABEL[w.source]}</span></td>
                        <td><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${w.isNewWorker ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{w.isNewWorker ? 'New' : 'Existing'}</span></td>
                        <td>
                          {w.checksumOk === null ? <em className="text-xs text-gray-400">n/a</em>
                            : w.checksumOk ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                            : <span title={w.checksumDiff ? `basic diff ${w.checksumDiff.basic.toFixed(2)}, ot diff ${w.checksumDiff.ot.toFixed(2)}` : 'Mismatch'} className="inline-flex items-center gap-1 text-amber-600 text-xs"><AlertTriangle className="w-4 h-4" /> Mismatch</span>}
                        </td>
                        <td className="text-xs">{w.hostelMatch ? (w.hostelMatch.isNew ? <em className="text-gray-500">New: {w.hostelMatch.hostelName}</em> : w.hostelMatch.hostelName) : <em className="text-gray-400">-</em>}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="bg-gray-50 p-3">
                            <div className="flex gap-8 flex-wrap">
                              <div>
                                <strong className="text-xs">Day-by-day (basic / OT)</strong>
                                {w.days.length === 0 ? <p className="text-xs text-gray-400">No PDF attendance data.</p> : (
                                  <table className="text-xs mt-1"><tbody>
                                    {w.days.map(d => <tr key={d.day}><td className="pr-3">{d.day}</td><td className="pr-3">{d.basic.toFixed(2)}</td><td>{d.ot.toFixed(2)}</td></tr>)}
                                  </tbody></table>
                                )}
                              </div>
                              <div>
                                <strong className="text-xs">Excel match</strong>
                                {w.excel ? (
                                  <table className="text-xs mt-1"><tbody>
                                    <tr><td className="text-gray-500 pr-3">Nationality</td><td>{w.excel.nationality || '-'}</td></tr>
                                    <tr><td className="text-gray-500 pr-3">Passport No</td><td>{w.excel.passportNo || '-'}</td></tr>
                                    <tr><td className="text-gray-500 pr-3">Passport Expiry</td><td>{w.excel.passportExpiry || '-'}</td></tr>
                                    <tr><td className="text-gray-500 pr-3">Date of Birth</td><td>{w.excel.dateOfBirth || '-'}</td></tr>
                                    <tr><td className="text-gray-500 pr-3">Permit Expiry</td><td>{w.excel.permitExpiry || '-'}</td></tr>
                                    <tr><td className="text-gray-500 pr-3">Date Joined</td><td>{w.excel.dateJoined || '-'}</td></tr>
                                    <tr><td className="text-gray-500 pr-3">Salary</td><td>{w.excel.salary ?? '-'}</td></tr>
                                    <tr><td className="text-gray-500 pr-3">Hostel Address</td><td>{w.excel.hostelAddress || '-'}</td></tr>
                                  </tbody></table>
                                ) : <p className="text-xs text-gray-400">No Excel match.</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {commitResult && (
        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h3 className="font-bold text-green-700 flex items-center gap-2 mb-3"><CheckCircle2 className="w-5 h-5" /> Import Complete</h3>
          <ul className="text-sm space-y-1.5">
            <li>Workers created: <strong>{commitResult.workersCreated}</strong></li>
            <li>Workers updated: <strong>{commitResult.workersUpdated}</strong></li>
            <li>Timesheet days written: <strong>{commitResult.timesheetDaysWritten}</strong></li>
            <li>Hostels created: <strong>{commitResult.hostelsCreated}</strong></li>
            <li>Hostel stays created: <strong>{commitResult.hostelStaysCreated}</strong></li>
            <li>Documents created: <strong>{commitResult.documentsCreated}</strong></li>
            <li>Salary values set: <strong>{commitResult.salaryValuesSet}</strong></li>
            <li>Skipped (excluded): <strong>{commitResult.skipped}</strong></li>
          </ul>
          <div className="flex gap-3 mt-4">
            <a href="/plantpro/hr" className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200">Go to HR Database</a>
            <a href="/plantpro/hostel" className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200">Go to Hostel</a>
            <a href="/plantpro/documents" className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200">Go to Documents</a>
          </div>
        </div>
      )}
    </>
  )
}
