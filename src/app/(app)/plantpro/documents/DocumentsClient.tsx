'use client'

import { guard } from '../feedback'
import { useState } from 'react'
import { FolderClock, Plus, Trash2, ChevronLeft, ChevronRight, Eye, Tag, List, Table2, Search, Upload } from 'lucide-react'
import { createDocumentType, updateDocumentType, deleteDocumentType, uploadPlantproDocument, deletePlantproDocument } from '../actions'
import { getDocumentStatus, type DocumentStatus } from '@/lib/plantpro-documents'

type DocumentType = { id: number; name: string; scope: 'WORKER' | 'HOSTEL' | 'BOTH' }
type DocumentRecord = {
  id: number
  owner_type: 'WORKER' | 'HOSTEL'
  worker_id: number | null
  hostel_id: number | null
  document_type_id: number
  file_name: string | null
  stored_name: string | null
  issue_date: string | null
  expiry_date: string | null
  remarks: string | null
  uploaded_at: string
}
type Worker = { id: number; worker_no: string; name: string; line: string | null }
type Hostel = { id: number; name: string }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']


function StatusBadge({ expiryDate }: { expiryDate: string | null }) {
  const status = getDocumentStatus(expiryDate)
  if (!expiryDate) return <span className="text-xs text-gray-400">-</span>
  const cls = status === 'expired' ? 'bg-red-100 text-red-700' : status === 'expiring' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
  const label = status === 'expired' ? 'Expired' : status === 'expiring' ? 'Expiring Soon' : 'OK'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

export default function DocumentsClient({ documentTypes, documents, workers, hostels }: {
  documentTypes: DocumentType[]; documents: DocumentRecord[]; workers: Worker[]; hostels: Hostel[]
}) {
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeScope, setNewTypeScope] = useState<'WORKER' | 'HOSTEL' | 'BOTH'>('WORKER')
  const [filterOwnerType, setFilterOwnerType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterFlaggedOnly, setFilterFlaggedOnly] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [docsView, setDocsView] = useState<'list' | 'byWorker'>('list')
  const [searchTerm, setSearchTerm] = useState('')

  const [uploadOwnerType, setUploadOwnerType] = useState<'WORKER' | 'HOSTEL'>('WORKER')
  const [uploadOwnerId, setUploadOwnerId] = useState('')
  const [uploadTypeId, setUploadTypeId] = useState('')
  const [uploadIssueDate, setUploadIssueDate] = useState('')
  const [uploadExpiryDate, setUploadExpiryDate] = useState('')
  const [uploadRemarks, setUploadRemarks] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const workerById = new Map(workers.map(w => [w.id, w]))
  const hostelById = new Map(hostels.map(h => [h.id, h]))
  const typeById = new Map(documentTypes.map(t => [t.id, t]))
  const ownerName = (d: DocumentRecord) => d.owner_type === 'WORKER' ? (workerById.get(d.worker_id!)?.name || `#${d.worker_id}`) : (hostelById.get(d.hostel_id!)?.name || `#${d.hostel_id}`)
  const idFor = (d: DocumentRecord) => d.owner_type === 'WORKER' ? (workerById.get(d.worker_id!)?.worker_no || '') : d.hostel_id ? `H${d.hostel_id}` : ''
  const docTypeName = (d: DocumentRecord) => typeById.get(d.document_type_id)?.name || '-'

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTypeName.trim()) return
    await guard(() => createDocumentType(newTypeName.trim(), newTypeScope))
    setNewTypeName('')
  }

  const ownerOptions = uploadOwnerType === 'WORKER' ? workers.map(w => ({ id: w.id, label: `${w.worker_no} - ${w.name}` })) : hostels.map(h => ({ id: h.id, label: h.name }))
  const eligibleUploadTypes = documentTypes.filter(t => t.scope === uploadOwnerType || t.scope === 'BOTH')
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadOwnerId || !uploadTypeId || !uploadFile) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('ownerType', uploadOwnerType)
      fd.set('ownerId', uploadOwnerId)
      fd.set('documentTypeId', uploadTypeId)
      if (uploadIssueDate) fd.set('issueDate', uploadIssueDate)
      if (uploadExpiryDate) fd.set('expiryDate', uploadExpiryDate)
      if (uploadRemarks) fd.set('remarks', uploadRemarks)
      fd.set('file', uploadFile)
      await uploadPlantproDocument(fd)
      setUploadOwnerId(''); setUploadTypeId(''); setUploadIssueDate(''); setUploadExpiryDate(''); setUploadRemarks(''); setUploadFile(null)
      const fileInput = document.getElementById('doc-upload-file-input') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const searchLower = searchTerm.trim().toLowerCase()
  const filteredDocs = documents.filter(d => {
    if (filterOwnerType && d.owner_type !== filterOwnerType) return false
    if (filterStatus && getDocumentStatus(d.expiry_date) !== filterStatus) return false
    if (filterType && docTypeName(d) !== filterType) return false
    if (searchLower && !ownerName(d).toLowerCase().includes(searchLower) && !idFor(d).toLowerCase().includes(searchLower)) return false
    return true
  })
  const distinctDocTypes = [...new Set(documentTypes.map(t => t.name))].sort()

  // By-worker matrix: Passport / Permit due-date columns, flagged if missing or expiring/expired.
  const passportByWorker = new Map<number, DocumentRecord>()
  const permitByWorker = new Map<number, DocumentRecord>()
  documents.forEach(d => {
    if (d.owner_type !== 'WORKER' || !d.worker_id) return
    const tn = docTypeName(d)
    if (tn === 'Passport') passportByWorker.set(d.worker_id, d)
    else if (tn === 'Permit') permitByWorker.set(d.worker_id, d)
  })
  const isFlagged = (doc: DocumentRecord | undefined) => !doc || !doc.expiry_date || getDocumentStatus(doc.expiry_date) !== 'ok'
  const DueCell = ({ doc }: { doc: DocumentRecord | undefined }) => {
    const flagged = isFlagged(doc)
    if (!doc) return <span className="text-red-600 font-bold text-xs">Missing</span>
    if (!doc.expiry_date) return <span className="text-red-600 font-bold text-xs">No date</span>
    return <span className={flagged ? 'text-red-600 font-bold' : 'text-gray-700'}>{doc.expiry_date}</span>
  }
  const filteredWorkersForMatrix = workers
    .filter(w => !searchLower || w.name.toLowerCase().includes(searchLower) || w.worker_no.toLowerCase().includes(searchLower))
    .filter(w => !filterFlaggedOnly || isFlagged(passportByWorker.get(w.id)) || isFlagged(permitByWorker.get(w.id)))

  // Calendar
  const year = currentDate.getFullYear(), month = currentDate.getMonth()
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const leadingBlanks = monthStart.getDay()
  const daysInMonth: Date[] = []
  for (let d = 1; d <= monthEnd.getDate(); d++) daysInMonth.push(new Date(year, month, d))
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const docsByDay: Record<string, DocumentRecord[]> = {}
  documents.forEach(d => {
    if (!d.expiry_date) return
    if (!docsByDay[d.expiry_date]) docsByDay[d.expiry_date] = []
    docsByDay[d.expiry_date].push(d)
  })
  const selectedDocs = selectedDay ? docsByDay[selectedDay] || [] : []

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Manage Document Types */}
        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h3 className="font-bold flex items-center gap-2 text-indigo-700 mb-4"><Tag className="w-5 h-5" /> Manage Document Types</h3>
          <form onSubmit={handleAddType} className="flex flex-wrap gap-2 mb-4">
            <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="New Type (e.g. Insurance)" required className="flex-1 min-w-[140px] border rounded-md px-3 py-2 text-sm" />
            <select value={newTypeScope} onChange={e => setNewTypeScope(e.target.value as any)} className="border rounded-md px-3 py-2 text-sm bg-white w-28">
              <option value="WORKER">Worker</option>
              <option value="HOSTEL">Hostel</option>
              <option value="BOTH">Both</option>
            </select>
            <button type="submit" className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Add</button>
          </form>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Type</th><th>Scope</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {documentTypes.map(t => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="py-2"><input defaultValue={t.name} onBlur={e => e.target.value.trim() && guard(() => updateDocumentType(t.id, { name: e.target.value.trim() }))} className="border rounded px-2 py-1 w-32" /></td>
                  <td><select defaultValue={t.scope} onChange={e => guard(() => updateDocumentType(t.id, { scope: e.target.value as any }))} className="border rounded px-2 py-1 bg-white"><option value="WORKER">Worker</option><option value="HOSTEL">Hostel</option><option value="BOTH">Both</option></select></td>
                  <td className="text-right"><button onClick={() => confirm(`Delete document type "${t.name}"?`) && guard(() => deleteDocumentType(t.id))} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
              {documentTypes.length === 0 && <tr><td colSpan={3} className="text-gray-400 py-4">No document types defined.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Calendar */}
        <div className="bg-white border rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDay(null) }} className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft className="w-5 h-5" /></button>
            <h3 className="font-bold w-40 text-center">{monthStart.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h3>
            <button onClick={() => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDay(null) }} className="p-1.5 rounded hover:bg-gray-100"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
            {WEEKDAYS.map(wd => <div key={wd}>{wd}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
            {daysInMonth.map(day => {
              const dateStr = fmtDate(day)
              const dayDocs = docsByDay[dateStr] || []
              const hasExpired = dayDocs.some(d => getDocumentStatus(d.expiry_date) === 'expired')
              const hasExpiring = dayDocs.some(d => getDocumentStatus(d.expiry_date) === 'expiring')
              return (
                <div key={dateStr} onClick={() => setSelectedDay(selectedDay === dateStr ? null : dateStr)}
                  className={`text-center rounded-md py-1.5 cursor-pointer text-xs ${selectedDay === dateStr ? 'ring-2 ring-indigo-500' : ''} ${dayDocs.length > 0 ? 'bg-gray-50' : ''}`}>
                  <div>{day.getDate()}</div>
                  {dayDocs.length > 0 && (
                    <div className="flex items-center justify-center gap-0.5 mt-0.5">
                      {hasExpired && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                      {hasExpiring && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {selectedDay && (
            <div className="mt-4 border-t pt-3">
              <h4 className="text-sm font-semibold mb-2">Documents expiring {selectedDay}</h4>
              {selectedDocs.length === 0 ? <p className="text-xs text-gray-400">None.</p> : (
                <table className="w-full text-xs">
                  <tbody>
                    {selectedDocs.map(d => (
                      <tr key={d.id} className="border-b border-gray-100">
                        <td className="py-1">{ownerName(d)}</td>
                        <td>{docTypeName(d)}</td>
                        <td><StatusBadge expiryDate={d.expiry_date} /></td>
                        <td className="text-right">
                          {d.stored_name ? <a href={`/api/plantpro/file/${d.stored_name}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800"><Eye className="w-3.5 h-3.5 inline" /></a> : <span className="text-gray-400">No file</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upload Document */}
      <div className="bg-white border rounded-xl shadow-sm p-5 mb-6">
        <h3 className="font-bold flex items-center gap-2 text-green-700 mb-4"><Upload className="w-5 h-5" /> Upload Document</h3>
        <form onSubmit={handleUpload} className="flex flex-wrap gap-2 items-center">
          <select value={uploadOwnerType} onChange={e => { setUploadOwnerType(e.target.value as any); setUploadOwnerId(''); setUploadTypeId('') }} className="border rounded-md px-3 py-2 text-sm bg-white w-28">
            <option value="WORKER">Worker</option>
            <option value="HOSTEL">Hostel</option>
          </select>
          <select value={uploadOwnerId} onChange={e => setUploadOwnerId(e.target.value)} required className="flex-1 min-w-[180px] border rounded-md px-3 py-2 text-sm bg-white">
            <option value="" disabled>Select {uploadOwnerType === 'WORKER' ? 'Worker' : 'Hostel'}</option>
            {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select value={uploadTypeId} onChange={e => setUploadTypeId(e.target.value)} required className="border rounded-md px-3 py-2 text-sm bg-white w-40">
            <option value="" disabled>Document Type</option>
            {eligibleUploadTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="date" title="Issue Date" value={uploadIssueDate} onChange={e => setUploadIssueDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm w-40" />
          <input type="date" title="Expiry Date" value={uploadExpiryDate} onChange={e => setUploadExpiryDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm w-40" />
          <input type="text" placeholder="Remarks (optional)" value={uploadRemarks} onChange={e => setUploadRemarks(e.target.value)} className="flex-1 min-w-[140px] border rounded-md px-3 py-2 text-sm" />
          <input id="doc-upload-file-input" type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)} required className="text-sm min-w-[160px]" />
          <button type="submit" disabled={uploading} className="flex items-center gap-1 bg-green-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"><Upload className="w-4 h-4" /> {uploading ? 'Uploading...' : 'Upload'}</button>
        </form>
      </div>

      {/* Documents Tracker */}
      <div className="bg-white border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-bold flex items-center gap-2 text-amber-700"><FolderClock className="w-5 h-5" /> All Documents</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex border rounded-lg overflow-hidden">
              <button onClick={() => setDocsView('list')} className={`flex items-center gap-1 px-3 py-1.5 text-xs ${docsView === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}><List className="w-3.5 h-3.5" /> List View</button>
              <button onClick={() => setDocsView('byWorker')} className={`flex items-center gap-1 px-3 py-1.5 text-xs ${docsView === 'byWorker' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}><Table2 className="w-3.5 h-3.5" /> By Worker</button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search name or ID..." className="border rounded-md pl-7 pr-2 py-1.5 text-sm w-44" />
            </div>
            {docsView === 'list' ? (
              <>
                <select value={filterOwnerType} onChange={e => setFilterOwnerType(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option value="">All Owner Types</option><option value="WORKER">Worker</option><option value="HOSTEL">Hostel</option>
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option value="">All Types</option>{distinctDocTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option value="">All Statuses</option><option value="ok">OK</option><option value="expiring">Expiring Soon</option><option value="expired">Expired</option>
                </select>
              </>
            ) : (
              <label className="flex items-center gap-1 text-sm cursor-pointer">
                <input type="checkbox" checked={filterFlaggedOnly} onChange={e => setFilterFlaggedOnly(e.target.checked)} /> Flagged only
              </label>
            )}
          </div>
        </div>

        {docsView === 'list' ? (
          <div className="overflow-auto max-h-[calc(100vh-12rem)]">
            <table className="w-full text-xs">
              <thead><tr className="text-[11px] text-gray-500 uppercase text-left [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-white [&>th]:py-1.5 [&>th]:shadow-[inset_0_-1px_0_#e5e7eb]"><th>ID</th><th>Owner</th><th>Type</th><th>Owner Type</th><th>Issue Date</th><th>Expiry Date</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filteredDocs.map(d => (
                  <tr key={d.id} className="border-b border-gray-100">
                    <td className="py-0.5 pr-3 text-gray-500">{idFor(d) || <em className="text-gray-400">-</em>}</td>
                    <td>{ownerName(d)}</td>
                    <td>{docTypeName(d)}</td>
                    <td>{d.owner_type === 'WORKER' ? 'Worker' : 'Hostel'}</td>
                    <td>{d.issue_date || <em className="text-gray-400">-</em>}</td>
                    <td>{d.expiry_date || <em className="text-gray-400">-</em>}</td>
                    <td><StatusBadge expiryDate={d.expiry_date} /></td>
                    <td className="text-right whitespace-nowrap">
                      {d.stored_name && (
                        <a href={`/api/plantpro/file/${d.stored_name}`} target="_blank" rel="noreferrer" className="inline-block text-indigo-600 hover:text-indigo-800 p-1" title="View"><Eye className="w-4 h-4" /></a>
                      )}
                      <button onClick={() => confirm('Delete this document? This cannot be undone.') && guard(() => deletePlantproDocument(d.id))} className="text-red-500 hover:text-red-700 p-1" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {filteredDocs.length === 0 && <tr><td colSpan={8} className="text-gray-400 py-4">No documents found.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-12rem)]">
            <table className="w-full text-xs">
              <thead><tr className="text-[11px] text-gray-500 uppercase text-left [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-white [&>th]:py-1.5 [&>th]:shadow-[inset_0_-1px_0_#e5e7eb]"><th>ID</th><th>Name</th><th>Department</th><th>Passport Due</th><th>Permit Due</th></tr></thead>
              <tbody>
                {filteredWorkersForMatrix.map(w => (
                  <tr key={w.id} className="border-b border-gray-100">
                    <td className="py-0.5 pr-3 text-gray-500">{w.worker_no}</td>
                    <td className="font-medium">{w.name}</td>
                    <td>{w.line || <em className="text-gray-400">-</em>}</td>
                    <td><DueCell doc={passportByWorker.get(w.id)} /></td>
                    <td><DueCell doc={permitByWorker.get(w.id)} /></td>
                  </tr>
                ))}
                {filteredWorkersForMatrix.length === 0 && <tr><td colSpan={5} className="text-gray-400 py-4">No workers found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
