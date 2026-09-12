'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMaintenanceFile } from '../actions'
import { ClipboardEdit, CheckCircle, X, Printer } from 'lucide-react'
import PhotoPicker from '@/components/PhotoPicker'
import PhotoLightbox from '@/components/PhotoLightbox'
import CategoryEquipmentPicker, { type EquipmentOption } from '@/components/CategoryEquipmentPicker'
import { jobNo } from '@/lib/utils/jobNo'

// This page is the logged-in equivalent of the public /maintenance-request
// form — same fields, same category -> equipment picker — so a staff
// member doesn't have to leave the app to raise one. Submitting here goes
// through the exact same maintenance_work_requests pipeline as the public
// form: lands in Work Requests > Pending Queue, gets assigned, accepted,
// completed, and approved there — this page is submission + a personal
// history of what you've raised, not its own separate flow.
type MyRequest = {
  id: number; status: string; issue_description: string; location: string | null
  created_at: string; assigned_to: string | null; assigned_at: string | null; accepted_at: string | null
  completed_at: string | null; photo_drive_id: string | null; resolution_photo_drive_id: string | null
  completion_remark: string | null; approved_at: string | null; approved_by: string | null; rejection_reason: string | null
  maintenance_equipment: { name: string } | null
}

function hoursBetween(a: string, b: string) {
  return ((new Date(b).getTime() - new Date(a).getTime()) / 3600000).toFixed(1)
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  accepted: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
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
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([])
  const [myRequests, setMyRequests] = useState<MyRequest[]>([])
  const [myIdentifier, setMyIdentifier] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [detailJob, setDetailJob] = useState<MyRequest | null>(null)

  const [category, setCategory] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [form, setForm] = useState({ location: '', issueDescription: '' })
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = user ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : { data: null }
    const identifier = profile?.full_name || user?.email || ''
    setMyIdentifier(identifier)

    const [{ data: eq }, { data: reqs }] = await Promise.all([
      // Spoiled equipment is retired — hidden here too, same default as
      // the Equipment list and the public form's picker.
      supabase.from('maintenance_equipment').select('id, name, category').eq('is_active', true).or('condition.neq.spoil,condition.is.null').order('name'),
      identifier
        ? supabase.from('maintenance_work_requests').select('id, status, issue_description, location, created_at, assigned_to, assigned_at, accepted_at, completed_at, photo_drive_id, resolution_photo_drive_id, completion_remark, approved_at, approved_by, rejection_reason, maintenance_equipment(name)').eq('requester_name', identifier).order('created_at', { ascending: false }).limit(100)
        : Promise.resolve({ data: [] }),
    ])
    setEquipmentOptions(eq || [])
    setMyRequests((reqs as any) || [])
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
      const { error } = await supabase.from('maintenance_work_requests').insert([{
        requester_name: myIdentifier,
        location: form.location || null,
        equipment_id: equipmentId ? Number(equipmentId) : null,
        issue_description: form.issueDescription.trim(),
        photo_drive_id,
        status: 'pending',
      }])
      if (error) throw error
      showSuccess('✓ Job submitted — a manager will review and assign it')
      setForm({ location: '', issueDescription: '' })
      setCategory('')
      setEquipmentId('')
      setPhotoFile(null)
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // No PDF library — opens a print-friendly page in a new tab and triggers
  // the browser's print dialog, where "Save as PDF" is a built-in
  // destination on every major browser. Same approach as Job History's and
  // PM Schedule's exports. User-supplied text is HTML-escaped since it can
  // originate from the unauthenticated public /maintenance-request form.
  function printJob(r: MyRequest) {
    const w = window.open('', '_blank', 'width=800,height=900')
    if (!w) { alert('Please allow pop-ups for this site to print.'); return }
    const equipmentOrLocation = escapeHtml(r.maintenance_equipment?.name || r.location || '-')
    const photos = [
      r.photo_drive_id ? `<div><div class="label">Evidence Photo</div><img src="/api/maintenance/file/${r.photo_drive_id}" /></div>` : '',
      r.resolution_photo_drive_id ? `<div><div class="label">Resolution Photo</div><img src="/api/maintenance/file/${r.resolution_photo_drive_id}" /></div>` : '',
    ].filter(Boolean).join('')
    w.document.write(`<!doctype html><html><head><title>${jobNo(r.id)}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#111;}
      h1{font-size:18px;margin:0 0 4px;}
      .sub{color:#666;font-size:12px;margin-bottom:20px;}
      .row{display:flex;gap:24px;margin-bottom:12px;}
      .field{flex:1;}
      .label{font-size:10px;text-transform:uppercase;color:#888;font-weight:bold;margin-bottom:2px;}
      .value{font-size:13px;}
      .status{display:inline-block;font-size:11px;font-weight:bold;text-transform:uppercase;padding:2px 8px;border-radius:9999px;background:#f3f4f6;}
      .photos{display:flex;gap:16px;margin-top:16px;flex-wrap:wrap;}
      img{max-width:320px;max-height:320px;object-fit:cover;border:1px solid #ddd;border-radius:6px;margin-top:6px;display:block;}
    </style></head><body>
      <h1>${jobNo(r.id)}</h1>
      <div class="sub">Submitted ${new Date(r.created_at).toLocaleString()}</div>
      <div class="row">
        <div class="field"><div class="label">Status</div><div class="value"><span class="status">${escapeHtml(r.status)}</span></div></div>
        <div class="field"><div class="label">Equipment / Location</div><div class="value">${equipmentOrLocation}</div></div>
      </div>
      <div class="field" style="margin-bottom:12px;"><div class="label">Issue Description</div><div class="value">${escapeHtml(r.issue_description)}</div></div>
      <div class="row">
        <div class="field"><div class="label">Assigned To</div><div class="value">${r.assigned_to ? escapeHtml(r.assigned_to) : '-'}</div></div>
        <div class="field"><div class="label">Assigned</div><div class="value">${r.assigned_at ? new Date(r.assigned_at).toLocaleString() : '-'}</div></div>
      </div>
      <div class="row">
        <div class="field"><div class="label">Completed</div><div class="value">${r.completed_at ? new Date(r.completed_at).toLocaleString() : '-'}</div></div>
        <div class="field"><div class="label">Approved</div><div class="value">${r.approved_at ? new Date(r.approved_at).toLocaleString() + (r.approved_by ? ' — ' + escapeHtml(r.approved_by) : '') : '-'}</div></div>
      </div>
      ${r.completion_remark ? `<div class="field" style="margin-bottom:12px;"><div class="label">Completion Remark</div><div class="value">${escapeHtml(r.completion_remark)}</div></div>` : ''}
      ${r.rejection_reason ? `<div class="field" style="margin-bottom:12px;"><div class="label">Rejection Reason</div><div class="value">${escapeHtml(r.rejection_reason)}</div></div>` : ''}
      <div class="photos">${photos}</div>
    </body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><ClipboardEdit className="w-7 h-7 text-orange-600" /> Jobs</h1>

      {successMessage && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-300 text-green-800 rounded-xl px-5 py-4 shadow-sm">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
        <form onSubmit={submit} className="bg-white border rounded-xl shadow-sm p-6 space-y-3 h-fit">
          <h2 className="text-sm font-bold text-slate-700 mb-1">Raise a Job</h2>
          <p className="text-xs text-gray-400 -mt-2 mb-1">Submitted as <span className="font-medium text-gray-600">{myIdentifier || '...'}</span> — same queue a public Work Request lands in, reviewed and assigned by a manager.</p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. PLO 68 Batching Plant 1" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Which machine? (optional)</label>
            <CategoryEquipmentPicker options={equipmentOptions} categoryValue={category} equipmentValue={equipmentId} onCategoryChange={setCategory} onEquipmentChange={setEquipmentId} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Issue Description</label>
            <textarea required value={form.issueDescription} onChange={e => setForm({ ...form, issueDescription: e.target.value })} rows={3} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <PhotoPicker label="Evidence Photo (optional)" file={photoFile} onChange={setPhotoFile} />
          <button type="submit" disabled={submitting} className="w-full bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-orange-700 mt-2">
            {submitting ? 'Saving...' : 'Submit Job'}
          </button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">My Submitted Jobs ({myRequests.length})</h2></div>
          <div className="overflow-auto max-h-[640px]">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job No.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {myRequests.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailJob(r)}>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-500">{jobNo(r.id)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.maintenance_equipment?.name || r.location || '-'}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate">{r.issue_description}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      {r.photo_drive_id ? (
                        <img src={`/api/maintenance/file/${r.photo_drive_id}`} className="w-10 h-10 rounded object-cover cursor-zoom-in" onClick={() => setZoomSrc(`/api/maintenance/file/${r.photo_drive_id}`)} />
                      ) : '-'}
                    </td>
                  </tr>
                ))}
                {!loading && myRequests.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">You haven't submitted any jobs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detailJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailJob(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">{jobNo(detailJob.id)}</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => printJob(detailJob)} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 font-medium px-2.5 py-1.5 rounded-lg hover:bg-gray-200"><Printer className="w-3.5 h-3.5" /> Print</button>
                <button onClick={() => setDetailJob(null)} className="text-gray-400 hover:text-gray-600 p-1.5"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4">Submitted {new Date(detailJob.created_at).toLocaleString()}</p>
            <div className="space-y-3 text-sm">
              <div>
                <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${STATUS_STYLE[detailJob.status] || 'bg-gray-100 text-gray-600'}`}>{detailJob.status}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-400 uppercase">Issue</div>
                <div className="mt-0.5">{detailJob.issue_description}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Equipment / Location</div>
                  <div className="mt-0.5">{detailJob.maintenance_equipment?.name || detailJob.location || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Assigned To</div>
                  <div className="mt-0.5">{detailJob.assigned_to || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Assigned</div>
                  <div className="mt-0.5">{detailJob.assigned_at ? new Date(detailJob.assigned_at).toLocaleString() : '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Completed</div>
                  <div className="mt-0.5">{detailJob.completed_at ? new Date(detailJob.completed_at).toLocaleString() : '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Time Taken</div>
                  <div className="mt-0.5">{detailJob.completed_at && detailJob.accepted_at ? `${hoursBetween(detailJob.accepted_at, detailJob.completed_at)} h` : '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Approved</div>
                  <div className="mt-0.5">{detailJob.approved_at ? new Date(detailJob.approved_at).toLocaleString() : '-'}{detailJob.approved_by ? ` — ${detailJob.approved_by}` : ''}</div>
                </div>
              </div>
              {detailJob.completion_remark && (
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Completion Remark</div>
                  <div className="mt-0.5">{detailJob.completion_remark}</div>
                </div>
              )}
              {detailJob.rejection_reason && (
                <div>
                  <div className="text-xs font-medium text-red-500 uppercase">Rejection Reason</div>
                  <div className="mt-0.5 text-red-600">{detailJob.rejection_reason}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-4">
                {detailJob.photo_drive_id && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase mb-1">Evidence Photo</div>
                    <img src={`/api/maintenance/file/${detailJob.photo_drive_id}`} className="rounded-lg max-h-56 cursor-zoom-in" onClick={() => setZoomSrc(`/api/maintenance/file/${detailJob.photo_drive_id}`)} />
                  </div>
                )}
                {detailJob.resolution_photo_drive_id && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase mb-1">Resolution Photo</div>
                    <img src={`/api/maintenance/file/${detailJob.resolution_photo_drive_id}`} className="rounded-lg max-h-56 cursor-zoom-in" onClick={() => setZoomSrc(`/api/maintenance/file/${detailJob.resolution_photo_drive_id}`)} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
