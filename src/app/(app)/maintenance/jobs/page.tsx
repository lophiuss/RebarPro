'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMaintenanceFile } from '../actions'
import { ClipboardEdit, CheckCircle, Pencil, X, Check } from 'lucide-react'
import PhotoPicker from '@/components/PhotoPicker'
import PhotoLightbox from '@/components/PhotoLightbox'

type Equipment = { id: number; name: string; category: string | null }
type JobReport = {
  id: number; equipment_id: number | null; category: string | null; report_date: string
  reported_by: string | null; issue_description: string | null; downtime_hours: number | null
  repair_time_hours: number | null; status: string; photo_drive_id: string | null; notes: string | null
  reported_at: string; resolved_at: string | null
  maintenance_equipment: { name: string; category: string | null } | null
}

function hoursBetween(a: string, b: string) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000)
}

async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const MAX = 900
  let { width, height } = img
  if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX } }
  else if (height > MAX) { width *= MAX / height; height = MAX }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  return new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.75))
}

export default function JobsPage() {
  const supabase = createClient()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [reports, setReports] = useState<JobReport[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [form, setForm] = useState({
    equipmentId: '', category: '', reportDate: new Date().toISOString().split('T')[0],
    issueDescription: '', notes: '',
  })
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [canManage, setCanManage] = useState(false)
  const [editing, setEditing] = useState<JobReport | null>(null)
  const [editForm, setEditForm] = useState({ equipmentId: '', category: '', issueDescription: '', notes: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: eq }, { data: rep }, { data: myAccess }] = await Promise.all([
      // Spoiled equipment is retired — same default-hide as the Equipment
      // list, so the picker (and the category filter's options) don't fill
      // up with machines nobody should be logging new issues against.
      supabase.from('maintenance_equipment').select('id, name, category').eq('is_active', true).or('condition.neq.spoil,condition.is.null').order('name'),
      supabase.from('maintenance_job_reports').select('*, maintenance_equipment(name, category)').order('reported_at', { ascending: false }).limit(100),
      user ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'maintenance').maybeSingle() : Promise.resolve({ data: null }),
    ])
    setEquipment(eq || [])
    setReports((rep as any) || [])
    setCanManage(myAccess?.role === 'admin' || myAccess?.role === 'manager')
    if (eq && eq.length > 0 && !form.equipmentId) setForm(f => ({ ...f, equipmentId: String(eq[0].id) }))
    setLoading(false)
  }

  function showSuccess(msg: string) {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 4000)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.issueDescription.trim()) { alert('Please describe the issue'); return }
    setSubmitting(true)
    try {
      let photo_drive_id: string | null = null
      if (photoFile) {
        const blob = await compressImage(photoFile)
        const fd = new FormData()
        fd.set('file', blob, 'photo.jpg')
        photo_drive_id = await uploadMaintenanceFile(fd)
      }
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).maybeSingle()
      const { error } = await supabase.from('maintenance_job_reports').insert([{
        equipment_id: form.equipmentId ? Number(form.equipmentId) : null,
        category: form.category || null,
        report_date: form.reportDate,
        reported_at: new Date().toISOString(),
        reported_by: profile?.full_name || user?.email || null,
        issue_description: form.issueDescription.trim(),
        status: 'open',
        photo_drive_id,
        notes: form.notes || null,
      }])
      if (error) throw error
      showSuccess('✓ Job report saved')
      setForm(f => ({ ...f, issueDescription: '', notes: '' }))
      setPhotoFile(null)
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Downtime/repair time are no longer typed in — resolving a report stamps
  // resolved_at and derives both hour figures from the elapsed time since
  // it was reported (same simplification Work Requests use: one elapsed-time
  // number, not a separate "downtime" vs "hands-on repair" split).
  async function markResolved(report: JobReport) {
    if (!confirm('Mark this job report resolved? Repair time will be calculated from when it was reported.')) return
    setResolvingId(report.id)
    try {
      const resolvedAt = new Date().toISOString()
      const hours = Math.round(hoursBetween(report.reported_at, resolvedAt) * 10) / 10
      const { error } = await supabase.from('maintenance_job_reports').update({
        resolved_at: resolvedAt, downtime_hours: hours, repair_time_hours: hours, status: 'completed',
      }).eq('id', report.id)
      if (error) throw error
      showSuccess('✓ Marked resolved')
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setResolvingId(null)
    }
  }

  // Manager can fix a technician's report before it's picked up — some
  // people can't describe the issue or pick the right machine correctly.
  function openEdit(r: JobReport) {
    if (!canManage) return
    setEditing(r)
    setEditForm({ equipmentId: r.equipment_id ? String(r.equipment_id) : '', category: r.category || '', issueDescription: r.issue_description || '', notes: r.notes || '' })
  }

  async function saveEdit() {
    if (!editing) return
    setSavingEdit(true)
    try {
      const { error } = await supabase.from('maintenance_job_reports').update({
        equipment_id: editForm.equipmentId ? Number(editForm.equipmentId) : null,
        category: editForm.category || null,
        issue_description: editForm.issueDescription.trim(),
        notes: editForm.notes || null,
      }).eq('id', editing.id)
      if (error) throw error
      setEditing(null)
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const categories = [...new Set(equipment.map(e => e.category).filter(Boolean))].sort() as string[]
  const filteredReports = categoryFilter
    ? reports.filter(r => (r.maintenance_equipment?.category || r.category) === categoryFilter)
    : reports

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><ClipboardEdit className="w-7 h-7 text-orange-600" /> Job Reports</h1>

      {successMessage && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-300 text-green-800 rounded-xl px-5 py-4 shadow-sm">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
        <form onSubmit={submit} className="bg-white border rounded-xl shadow-sm p-6 space-y-3 h-fit">
          <h2 className="text-sm font-bold text-slate-700 mb-1">Log a Job Report</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Equipment</label>
            <select value={form.equipmentId} onChange={e => setForm({ ...form, equipmentId: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
              <option value="">(Not equipment-specific)</option>
              {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Crane, Batching Plant" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" required value={form.reportDate} onChange={e => setForm({ ...form, reportDate: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Issue Description</label>
            <textarea required value={form.issueDescription} onChange={e => setForm({ ...form, issueDescription: e.target.value })} rows={3} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <PhotoPicker label="Evidence Photo (optional)" file={photoFile} onChange={setPhotoFile} />
          <button type="submit" disabled={submitting} className="w-full bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-orange-700 mt-2">
            {submitting ? 'Saving...' : 'Save Job Report'}
          </button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-slate-700">History ({filteredReports.length}{categoryFilter ? ` of ${reports.length}` : ''})</h2>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs bg-white">
              <option value="">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="overflow-auto max-h-[640px]">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReports.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{r.report_date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.maintenance_equipment?.name || r.category || '-'}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate">{r.issue_description}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${r.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                      {r.status === 'completed' && r.repair_time_hours != null && (
                        <span className="block text-[11px] text-gray-400 mt-0.5">{r.repair_time_hours}h to resolve</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.photo_drive_id ? (
                        <img src={`/api/maintenance/file/${r.photo_drive_id}`} className="w-10 h-10 rounded object-cover cursor-zoom-in" onClick={() => setZoomSrc(`/api/maintenance/file/${r.photo_drive_id}`)} />
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {canManage && r.status !== 'completed' && (
                          <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600 p-1" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                        {r.status !== 'completed' && (
                          <button onClick={() => markResolved(r)} disabled={resolvingId === r.id} className="text-xs bg-green-600 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg hover:bg-green-700">
                            {resolvingId === r.id ? 'Saving...' : 'Mark Resolved'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredReports.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">{reports.length === 0 ? 'No job reports yet.' : 'No job reports in this category.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit Job Report</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Equipment</label>
                <select value={editForm.equipmentId} onChange={e => setEditForm({ ...editForm, equipmentId: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">(Not equipment-specific)</option>
                  {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <input value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Issue Description</label>
                <textarea value={editForm.issueDescription} onChange={e => setEditForm({ ...editForm, issueDescription: e.target.value })} rows={3} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditing(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={saveEdit} disabled={savingEdit} className="flex items-center gap-1.5 bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700"><Check className="w-4 h-4" /> {savingEdit ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
