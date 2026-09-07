'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMaintenanceFile, listMaintenanceStaff, type StaffMember } from '../actions'
import { Inbox, CheckCircle2, UserPlus, X, Pencil, ClipboardCheck, XCircle, PlayCircle, Trash2 } from 'lucide-react'
import PhotoPicker from '@/components/PhotoPicker'
import PhotoLightbox from '@/components/PhotoLightbox'

type WorkRequest = {
  id: number; requester_name: string; requester_contact: string | null; location: string | null
  issue_description: string; photo_drive_id: string | null; status: string
  assigned_to: string | null; assigned_at: string | null; accepted_at: string | null
  completed_at: string | null; resolution_photo_drive_id: string | null; completion_remark: string | null
  approved_at: string | null; approved_by: string | null; rejection_reason: string | null
  created_at: string
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

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  accepted: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default function WorkRequestsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'pending' | 'in_progress' | 'approval' | 'my_tasks'>('pending')
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
  const [completionRemark, setCompletionRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<WorkRequest | null>(null)
  const [editForm, setEditForm] = useState({ requesterName: '', requesterContact: '', location: '', issueDescription: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

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
    // Pending Queue + Approval + assigning work to someone else is a
    // manager/admin action — a technician only gets My Tasks.
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
  const inProgress = requests.filter(r => r.status === 'assigned' || r.status === 'accepted')
  const awaitingApproval = requests.filter(r => r.status === 'completed')
  const myTasks = requests.filter(r => r.assigned_to === myIdentifier)
  const myCompletedCount = myTasks.filter(r => r.status === 'approved').length

  function openEdit(r: WorkRequest) {
    setEditTarget(r)
    setEditForm({ requesterName: r.requester_name, requesterContact: r.requester_contact || '', location: r.location || '', issueDescription: r.issue_description })
  }

  async function saveEdit() {
    if (!editTarget) return
    if (!editForm.requesterName.trim() || !editForm.issueDescription.trim()) { alert('Requester name and issue description are required'); return }
    setSavingEdit(true)
    try {
      const { error } = await supabase.from('maintenance_work_requests').update({
        requester_name: editForm.requesterName.trim(), requester_contact: editForm.requesterContact || null,
        location: editForm.location || null, issue_description: editForm.issueDescription.trim(),
      }).eq('id', editTarget.id)
      if (error) throw error
      setEditTarget(null)
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

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

  // Technician acknowledges the assignment before starting work — the
  // "technician will accept the job" step.
  async function acceptTask(r: WorkRequest) {
    setBusyId(r.id)
    try {
      const { error } = await supabase.from('maintenance_work_requests').update({
        status: 'accepted', accepted_at: new Date().toISOString(),
      }).eq('id', r.id)
      if (error) throw error
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function doComplete() {
    if (!completeTarget) return
    setSaving(true)
    try {
      let resolution_photo_drive_id: string | null = null
      if (resolutionPhoto) {
        const blob = await compressImage(resolutionPhoto)
        const fd = new FormData()
        fd.set('file', blob, 'resolution.jpg')
        resolution_photo_drive_id = await uploadMaintenanceFile(fd)
      }
      const { error } = await supabase.from('maintenance_work_requests').update({
        status: 'completed', completed_at: new Date().toISOString(), resolution_photo_drive_id,
        completion_remark: completionRemark.trim() || null, rejection_reason: null,
      }).eq('id', completeTarget.id)
      if (error) throw error
      setCompleteTarget(null)
      setResolutionPhoto(null)
      setCompletionRemark('')
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Manager reviews the technician's submitted evidence — approving is what
  // finally counts the task as done; rejecting sends it back to the
  // technician (still "accepted", so they can straight away redo it).
  async function approveTask(r: WorkRequest) {
    setBusyId(r.id)
    try {
      const { error } = await supabase.from('maintenance_work_requests').update({
        status: 'approved', approved_at: new Date().toISOString(), approved_by: myIdentifier || null,
      }).eq('id', r.id)
      if (error) throw error
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function rejectTask(r: WorkRequest) {
    const reason = window.prompt('Reason for rejecting this completed work (the technician will need to redo it):')
    if (reason === null) return
    setBusyId(r.id)
    try {
      const { error } = await supabase.from('maintenance_work_requests').update({
        status: 'accepted', completed_at: null, rejection_reason: reason || null,
      }).eq('id', r.id)
      if (error) throw error
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  // Manager delete — must be logged (per the request), so the row is
  // snapshotted into maintenance_deletion_log before it's removed.
  async function deleteRequest(r: WorkRequest) {
    if (!confirm(`Delete this job — "${r.issue_description.slice(0, 60)}"? This is logged and cannot be undone.`)) return
    setBusyId(r.id)
    try {
      const { error: logErr } = await supabase.from('maintenance_deletion_log').insert([{
        table_name: 'maintenance_work_requests', record_id: r.id, record_snapshot: r, deleted_by: myIdentifier || null,
      }])
      if (logErr) throw logErr
      const { error } = await supabase.from('maintenance_work_requests').delete().eq('id', r.id)
      if (error) throw error
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setBusyId(null)
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
          <button onClick={() => setTab('in_progress')} className={`px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'in_progress' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>
            In Progress ({inProgress.length})
          </button>
          <button onClick={() => setTab('approval')} className={`px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'approval' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>
            Awaiting Approval ({awaitingApproval.length})
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
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600 p-1.5" title="Edit before assigning"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setAssignTarget(r); setAssignee('') }} className="flex items-center gap-1 text-xs bg-orange-600 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-orange-700"><UserPlus className="w-3.5 h-3.5" /> Assign</button>
                      <button onClick={() => deleteRequest(r)} disabled={busyId === r.id} className="text-red-400 hover:text-red-600 disabled:opacity-50 p-1.5" title="Delete (logged)"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
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

      {tab === 'in_progress' && canManage && (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Accepted?</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {inProgress.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{r.assigned_at ? new Date(r.assigned_at).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{r.assigned_to || '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.accepted_at ? (
                      <span className="text-xs font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">✓ Accepted {new Date(r.accepted_at).toLocaleDateString()}</span>
                    ) : (
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">Not yet accepted</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm max-w-[240px] truncate">{r.issue_description}</td>
                  <td className="px-4 py-3 text-sm">{r.location || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => deleteRequest(r)} disabled={busyId === r.id} className="text-red-400 hover:text-red-600 disabled:opacity-50 p-1.5" title="Delete (logged)"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
              {!loading && inProgress.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Nothing assigned right now.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'approval' && canManage && (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Technician</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evidence</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {awaitingApproval.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{r.completed_at ? new Date(r.completed_at).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{r.assigned_to || '-'}</td>
                  <td className="px-4 py-3 text-sm max-w-[240px]">
                    <div className="truncate">{r.issue_description}</div>
                    {r.completion_remark && <div className="text-xs text-gray-500 mt-0.5 truncate">Remark: {r.completion_remark}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {r.resolution_photo_drive_id ? <img src={`/api/maintenance/file/${r.resolution_photo_drive_id}`} className="w-10 h-10 rounded object-cover cursor-zoom-in" onClick={() => setZoomSrc(`/api/maintenance/file/${r.resolution_photo_drive_id}`)} /> : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => approveTask(r)} disabled={busyId === r.id} className="flex items-center gap-1 text-xs bg-green-600 disabled:opacity-50 text-white font-medium px-2.5 py-1.5 rounded-lg hover:bg-green-700"><ClipboardCheck className="w-3.5 h-3.5" /> Approve</button>
                      <button onClick={() => rejectTask(r)} disabled={busyId === r.id} className="flex items-center gap-1 text-xs bg-gray-100 disabled:opacity-50 text-gray-600 font-medium px-2.5 py-1.5 rounded-lg hover:bg-gray-200"><XCircle className="w-3.5 h-3.5" /> Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && awaitingApproval.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Nothing awaiting approval.</td></tr>
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
                    <td className="px-4 py-3 text-sm max-w-[240px]">
                      <div className="truncate">{r.issue_description}</div>
                      {r.rejection_reason && r.status === 'accepted' && (
                        <div className="text-xs text-red-600 mt-0.5">Rejected: {r.rejection_reason} — please redo.</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.completed_at && r.accepted_at ? `${hoursBetween(r.accepted_at, r.completed_at)} h` : '-'}</td>
                    <td className="px-4 py-3">
                      {r.status === 'assigned' && (
                        <button onClick={() => acceptTask(r)} disabled={busyId === r.id} className="flex items-center gap-1 text-xs bg-blue-600 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700"><PlayCircle className="w-3.5 h-3.5" /> Accept</button>
                      )}
                      {r.status === 'accepted' && (
                        <button onClick={() => { setCompleteTarget(r); setResolutionPhoto(null); setCompletionRemark('') }} className="flex items-center gap-1 text-xs bg-green-600 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete</button>
                      )}
                      {r.status === 'completed' && <span className="text-xs text-gray-400">Awaiting manager approval</span>}
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

      {editTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit Request</h2>
              <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Requester Name</label>
                <input value={editForm.requesterName} onChange={e => setEditForm({ ...editForm, requesterName: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Requester Contact</label>
                <input value={editForm.requesterContact} onChange={e => setEditForm({ ...editForm, requesterContact: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                <input value={editForm.location} onChange={e => setEditForm({ ...editForm, location: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Issue Description</label>
                <textarea value={editForm.issueDescription} onChange={e => setEditForm({ ...editForm, issueDescription: e.target.value })} rows={3} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditTarget(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={saveEdit} disabled={savingEdit} className="bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700">{savingEdit ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
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
            <p className="text-sm text-gray-500 mb-3">Your manager will review and approve it.</p>
            <PhotoPicker label="Resolution Photo (optional)" file={resolutionPhoto} onChange={setResolutionPhoto} />
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Remark (optional)</label>
              <textarea value={completionRemark} onChange={e => setCompletionRemark(e.target.value)} rows={3} placeholder="What did you do?" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
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
