'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMaintenanceFile } from '../actions'
import { ClipboardEdit, CheckCircle } from 'lucide-react'
import PhotoPicker from '@/components/PhotoPicker'
import PhotoLightbox from '@/components/PhotoLightbox'
import CategoryEquipmentPicker, { type EquipmentOption } from '@/components/CategoryEquipmentPicker'

// This page is the logged-in equivalent of the public /maintenance-request
// form — same fields, same category -> equipment picker — so a staff
// member doesn't have to leave the app to raise one. Submitting here goes
// through the exact same maintenance_work_requests pipeline as the public
// form: lands in Work Requests > Pending Queue, gets assigned, accepted,
// completed, and approved there — this page is submission + a personal
// history of what you've raised, not its own separate flow.
type MyRequest = {
  id: number; status: string; issue_description: string; location: string | null
  created_at: string; completed_at: string | null; photo_drive_id: string | null
  maintenance_equipment: { name: string } | null
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
        ? supabase.from('maintenance_work_requests').select('id, status, issue_description, location, created_at, completed_at, photo_drive_id, maintenance_equipment(name)').eq('requester_name', identifier).order('created_at', { ascending: false }).limit(100)
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {myRequests.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.maintenance_equipment?.name || r.location || '-'}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate">{r.issue_description}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      {r.photo_drive_id ? (
                        <img src={`/api/maintenance/file/${r.photo_drive_id}`} className="w-10 h-10 rounded object-cover cursor-zoom-in" onClick={() => setZoomSrc(`/api/maintenance/file/${r.photo_drive_id}`)} />
                      ) : '-'}
                    </td>
                  </tr>
                ))}
                {!loading && myRequests.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">You haven't submitted any jobs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
