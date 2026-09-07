'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMaintenanceFile, listMaintenanceStaff, type StaffMember } from '../actions'
import { Inbox, CheckCircle2, UserPlus, X } from 'lucide-react'
import PhotoPicker from '@/components/PhotoPicker'
import PhotoLightbox from '@/components/PhotoLightbox'

type WorkRequest = {
  id: number; requester_name: string; requester_contact: string | null; location: string | null
  issue_description: string; photo_drive_id: string | null; status: string
  assigned_to: string | null; assigned_at: string | null; completed_at: string | null
  resolution_photo_drive_id: string | null; created_at: string
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

function hoursBetween(a: string, b: string) {
  return ((new Date(b).getTime() - new Date(a).getTime()) / 3600000).toFixed(1)
}

export default function WorkRequestsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'pending' | 'my_tasks'>('pending')
  const [requests, setRequests] = useState<WorkRequest[]>([])
  const [myEmail, setMyEmail] = useState<string | null>(null)
  const [myName, setMyName] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [assignTarget, setAssignTarget] = useState<WorkRequest | null>(null)
  const [assignee, setAssignee] = useState('')
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [completeTarget, setCompleteTarget] = useState<WorkRequest | null>(null)
  const [resolutionPhoto, setResolutionPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setMyEmail(user?.email ?? null)
    const [{ data: profile }, { data: myAccess }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user?.id).maybeSingle(),
      supabase.from('user_department_access').select('role').eq('user_id', user?.id).eq('department', 'maintenance').maybeSingle(),
    ])
    setMyName(profile?.full_name ?? null)
    // Pending Queue + assigning work to someone else is a manager/admin
    // action — a technician only gets My Tasks, matching the PRD's intended
    // role split (this wasn't actually enforced before, letting anyone
    // assign work to anyone).
    const manages = myAccess?.role === 'admin' || myAccess?.role === 'manager'
    setCanManage(manages)
    if (!manages) setTab('my_tasks')

    const [{ data }, staffList] = await Promise.all([
      supabase.from('maintenance_work_requests').select('*').order('created_at', { ascending: false }).limit(200),
      manages ? listMaintenanceStaff().catch(() => []) : Promise.resolve([]),
    ])
    setRequests(data || [])
    setStaff(staffList)
    setLoading(false)
  }

  const myIdentifier = myName || myEmail || ''
  const pending = requests.filter(r => r.status === 'pending')
  const myTasks = requests.filter(r => r.assigned_to === myIdentifier)
  const myCompletedCount = myTasks.filter(r => r.status === 'completed').length

  async function doAssign() {
    if (!assignTarget || !assignee.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('maintenance_work_requests').update({
        status: 'assigned', assigned_to: assignee.trim(), assigned_at: new Date().toISOString(),
      }).eq('id', assignTarget.id)
      if (error) throw error
      setAssignTarget(null)
      setAssignee('')
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function doComplete() {
    if (!completeTarget) return
    if (!resolutionPhoto) { alert('Please attach a photo of the completed work before submitting.'); return }
    setSaving(true)
    try {
      const blob = await compressImage(resolutionPhoto)
      const fd = new FormData()
      fd.set('file', blob, 'resolution.jpg')
      const resolution_photo_drive_id = await uploadMaintenanceFile(fd)
      const { error } = await supabase.from('maintenance_work_requests').update({
        status: 'completed', completed_at: new Date().toISOString(), resolution_photo_drive_id,
      }).eq('id', completeTarget.id)
      if (error) throw error
      setCompleteTarget(null)
      setResolutionPhoto(null)
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Inbox className="w-7 h-7 text-orange-600" /> Work Requests</h1>

      {canManage && (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          <button onClick={() => setTab('pending')} className={`px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'pending' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>
            Pending Queue ({pending.length})
          </button>
          <button onClick={() => setTab('my_tasks')} className={`px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'my_tasks' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>
            My Tasks
          </button>
        </div>
      )}

      {tab === 'pending' && canManage && (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requester</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pending.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{r.requester_name}{r.requester_contact ? ` (${r.requester_contact})` : ''}</td>
                  <td className="px-4 py-3 text-sm">{r.location || '-'}</td>
                  <td className="px-4 py-3 text-sm max-w-[240px] truncate">{r.issue_description}</td>
                  <td className="px-4 py-3">
                    {r.photo_drive_id ? <img src={`/api/maintenance/file/${r.photo_drive_id}`} className="w-10 h-10 rounded object-cover cursor-zoom-in" onClick={() => setZoomSrc(`/api/maintenance/file/${r.photo_drive_id}`)} /> : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setAssignTarget(r); setAssignee('') }} className="flex items-center gap-1 text-xs bg-orange-600 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-orange-700"><UserPlus className="w-3.5 h-3.5" /> Assign</button>
                  </td>
                </tr>
              ))}
              {!loading && pending.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No pending requests.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'my_tasks' && (
        <>
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 mb-4 text-sm font-semibold text-orange-800">
            ✅ You've completed {myCompletedCount} task{myCompletedCount === 1 ? '' : 's'} so far.
          </div>
          <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time Taken</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {myTasks.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{r.assigned_at ? new Date(r.assigned_at).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3 text-sm">{r.location || '-'}</td>
                    <td className="px-4 py-3 text-sm max-w-[240px] truncate">{r.issue_description}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${r.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.completed_at && r.assigned_at ? `${hoursBetween(r.assigned_at, r.completed_at)} h` : '-'}</td>
                    <td className="px-4 py-3">
                      {r.status !== 'completed' && (
                        <button onClick={() => { setCompleteTarget(r); setResolutionPhoto(null) }} className="flex items-center gap-1 text-xs bg-green-600 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && myTasks.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Nothing assigned to you yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {assignTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Assign — {assignTarget.requester_name}</h2>
              <button onClick={() => setAssignTarget(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Assign To</label>
            <select value={assignee} onChange={e => setAssignee(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white mb-4" autoFocus>
              <option value="">Select staff…</option>
              {staff.map(s => <option key={s.name} value={s.name}>{s.name} ({s.role})</option>)}
            </select>
            {staff.length === 0 && <p className="text-xs text-gray-400 -mt-3 mb-4">No maintenance staff found — grant access in Access Control first.</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setAssignTarget(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={doAssign} disabled={saving || !assignee.trim()} className="bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700">{saving ? 'Saving...' : 'Assign'}</button>
            </div>
          </div>
        </div>
      )}

      {completeTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Complete — {completeTarget.requester_name}</h2>
              <button onClick={() => setCompleteTarget(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Attach a photo showing the completed work.</p>
            <PhotoPicker label="Resolution Photo" file={resolutionPhoto} onChange={setResolutionPhoto} />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setCompleteTarget(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={doComplete} disabled={saving} className="bg-green-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700">{saving ? 'Submitting...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
