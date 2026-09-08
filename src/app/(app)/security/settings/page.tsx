'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'
import { Settings as SettingsIcon, Plus, Trash2, Pencil, Image as ImageIcon, QrCode, Copy, Check, MapPin, X } from 'lucide-react'
import CheckpointMap from '@/components/CheckpointMap'

type Post = { id: number; name: string }
type LayoutRow = { photo_url: string | null; photo_drive_id: string | null } | null
type Checkpoint = { id: number; name: string; latitude: number; longitude: number; radius_meters: number; sequence_order: number; is_active: boolean }

export default function SecuritySettingsPage() {
  const supabase = createClient()
  const [posts, setPosts] = useState<Post[]>([])
  const [newPost, setNewPost] = useState('')
  const [editing, setEditing] = useState<Post | null>(null)
  const [uploadingLayout, setUploadingLayout] = useState(false)
  const [layout, setLayout] = useState<LayoutRow>(null)
  const [kioskUrl, setKioskUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [canManage, setCanManage] = useState(false)

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [editingCp, setEditingCp] = useState<Checkpoint | null>(null)
  const [cpForm, setCpForm] = useState({ name: '', radiusMeters: '50', sequenceOrder: '' })
  const [pendingPoint, setPendingPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [savingCp, setSavingCp] = useState(false)

  useEffect(() => {
    load()
    const url = `${window.location.origin}/visitor-checkin`
    setKioskUrl(url)
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQrDataUrl).catch(() => {})
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: postRows }, { data: layoutRow }, { data: cpRows }, { data: access }] = await Promise.all([
      supabase.from('security_guard_posts').select('*').order('name'),
      supabase.from('security_layout').select('photo_url, photo_drive_id').order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('security_checkpoints').select('*').order('sequence_order'),
      user ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'security').maybeSingle() : Promise.resolve({ data: null }),
    ])
    setPosts(postRows || [])
    setLayout(layoutRow)
    setCheckpoints(cpRows || [])
    setCanManage(access?.role === 'admin' || access?.role === 'manager')
  }

  function startAddCheckpoint(lat: number, lng: number) {
    if (!canManage) return
    setEditingCp(null)
    setPendingPoint({ lat, lng })
    setCpForm({ name: '', radiusMeters: '50', sequenceOrder: String(checkpoints.length + 1) })
  }

  function startEditCheckpoint(cp: Checkpoint) {
    if (!canManage) return
    setEditingCp(cp)
    setPendingPoint({ lat: cp.latitude, lng: cp.longitude })
    setCpForm({ name: cp.name, radiusMeters: String(cp.radius_meters), sequenceOrder: String(cp.sequence_order) })
  }

  function cancelCheckpointEdit() {
    setEditingCp(null)
    setPendingPoint(null)
    setCpForm({ name: '', radiusMeters: '50', sequenceOrder: '' })
  }

  async function saveCheckpoint() {
    if (!pendingPoint || !cpForm.name.trim()) { alert('Click a point on the map and enter a name first.'); return }
    setSavingCp(true)
    try {
      const patch = {
        name: cpForm.name.trim(), latitude: pendingPoint.lat, longitude: pendingPoint.lng,
        radius_meters: Math.max(5, Number(cpForm.radiusMeters) || 50),
        sequence_order: Number(cpForm.sequenceOrder) || checkpoints.length + 1,
      }
      const { error } = editingCp
        ? await supabase.from('security_checkpoints').update(patch).eq('id', editingCp.id)
        : await supabase.from('security_checkpoints').insert([{ ...patch, is_active: true }])
      if (error) throw error
      cancelCheckpointEdit()
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSavingCp(false)
    }
  }

  async function toggleCheckpointActive(cp: Checkpoint) {
    const { error } = await supabase.from('security_checkpoints').update({ is_active: !cp.is_active }).eq('id', cp.id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  async function deleteCheckpoint(id: number) {
    if (!confirm('Delete this checkpoint? Past clocking records against it are kept (they store their own snapshot of the name), but it will no longer be clockable.')) return
    const { error } = await supabase.from('security_checkpoints').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    if (editingCp?.id === id) cancelCheckpointEdit()
    load()
  }

  async function addPost(e: React.FormEvent) {
    e.preventDefault()
    if (!newPost.trim()) return
    const { error } = await supabase.from('security_guard_posts').insert([{ name: newPost.trim() }])
    if (error) { alert('Error: ' + error.message); return }
    setNewPost('')
    load()
  }

  async function saveEdit() {
    if (!editing) return
    const { error } = await supabase.from('security_guard_posts').update({ name: editing.name }).eq('id', editing.id)
    if (error) { alert('Error: ' + error.message); return }
    setEditing(null)
    load()
  }

  async function deletePost(id: number) {
    if (!confirm('Delete this guard post?')) return
    const { error } = await supabase.from('security_guard_posts').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  // Layout goes to Supabase Storage (public, low-sensitivity — just a site
  // map) instead of Google Drive, so it loads as a plain <img> with no auth
  // round trip — noticeably faster on the Dashboard/Gates map.
  async function uploadLayout(file: File | null) {
    if (!file) return
    setUploadingLayout(true)
    try {
      const path = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`
      const { error: upErr } = await supabase.storage.from('security-layout').upload(path, file, { contentType: file.type || 'image/jpeg' })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('security-layout').getPublicUrl(path)
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('security_layout').insert([{ photo_url: pub.publicUrl, uploaded_by: user?.email || null }])
      if (error) throw error
      alert('Site layout updated — visible on the Dashboard and Gates page.')
      load()
    } catch (err: any) {
      alert('Error uploading layout: ' + err.message)
    } finally {
      setUploadingLayout(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(kioskUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentLayoutSrc = layout?.photo_url || (layout?.photo_drive_id && layout.photo_drive_id !== 'PENDING' ? `/api/security/photo/${layout.photo_drive_id}` : null)

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><SettingsIcon className="w-7 h-7 text-blue-600" /> Security Settings</h1>

      <div className="bg-white border rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><QrCode className="w-4 h-4" /> Visitor Self Check-In Kiosk</h2>
        <p className="text-xs text-gray-500 mb-4">
          Print this QR code at the gate or reception. A visitor scans it, fills in their own name, company,
          purpose, and who they're looking for — it lands in Entries as <b>Pending</b> until a guard adds
          their photo and lets them in.
        </p>
        <div className="flex items-center gap-6 flex-wrap">
          {qrDataUrl && <img src={qrDataUrl} alt="Visitor check-in QR code" className="w-40 h-40 border rounded-lg p-1" />}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Link</label>
            <div className="flex gap-2">
              <input readOnly value={kioskUrl} className="flex-1 border rounded-md px-3 py-2 text-sm bg-gray-50" />
              <button onClick={copyLink} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-200 flex-shrink-0">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">No login needed — anyone with the link or QR code can open the form.</p>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Site Layout</h2>
        <p className="text-xs text-gray-500 mb-3">Uploaded as the background map on the Dashboard and Gates page.</p>
        {currentLayoutSrc && <img src={currentLayoutSrc} className="w-full max-h-48 object-contain border rounded-lg mb-3 bg-gray-50" />}
        <label className="inline-block bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 cursor-pointer">
          {uploadingLayout ? 'Uploading...' : 'Upload New Layout Image'}
          <input type="file" accept="image/*" className="hidden" disabled={uploadingLayout} onChange={e => uploadLayout(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-700 mb-3">Guard Posts</h2>
        <form onSubmit={addPost} className="flex gap-2 mb-4">
          <input value={newPost} onChange={e => setNewPost(e.target.value)} placeholder="New post name" className="flex-1 border rounded-md px-3 py-2 text-sm" />
          <button type="submit" className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> Add</button>
        </form>
        <div className="divide-y divide-gray-100">
          {posts.map(p => (
            <div key={p.id} className="py-2.5 flex items-center justify-between text-sm">
              {editing?.id === p.id ? (
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} onBlur={saveEdit} onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus className="border rounded-md px-2 py-1 text-sm" />
              ) : (
                <span>{p.name}</span>
              )}
              <div className="flex gap-1">
                <button onClick={() => setEditing(p)} className="text-gray-400 hover:text-blue-600 p-1"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => deletePost(p.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {posts.length === 0 && <p className="text-sm text-gray-400 py-2">No guard posts configured yet.</p>}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-6 mt-6">
        <h2 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><MapPin className="w-4 h-4" /> GPS Checkpoints</h2>
        <p className="text-xs text-gray-500 mb-4">
          Click the map to place a new checkpoint (or click an existing marker below to reposition it). The shaded
          circle is the geofence — a guard must be physically inside it to clock in. Sequence number is the suggested
          patrol order shown on the GPS Clocking page; a guard can still clock any checkpoint out of order if needed.
        </p>
        {!canManage && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">Only a Security admin/manager can add, move, or delete checkpoints.</p>}

        <CheckpointMap
          markers={checkpoints.map(c => ({ id: c.id, name: c.name, lat: c.latitude, lng: c.longitude, radiusMeters: c.radius_meters, active: c.is_active }))}
          pendingPoint={pendingPoint ? { lat: pendingPoint.lat, lng: pendingPoint.lng, radiusMeters: Math.max(5, Number(cpForm.radiusMeters) || 50) } : null}
          onPick={canManage ? startAddCheckpoint : undefined}
          center={pendingPoint || (checkpoints[0] ? { lat: checkpoints[0].latitude, lng: checkpoints[0].longitude } : undefined)}
        />

        {canManage && pendingPoint && (
          <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-blue-900">{editingCp ? `Editing — ${editingCp.name}` : 'New Checkpoint'}</h3>
              <button onClick={cancelCheckpointEdit} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                <input value={cpForm.name} onChange={e => setCpForm({ ...cpForm, name: e.target.value })} placeholder="e.g. Main Gate" className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Radius (meters)</label>
                <input type="number" min={5} value={cpForm.radiusMeters} onChange={e => setCpForm({ ...cpForm, radiusMeters: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sequence #</label>
                <input type="number" min={1} value={cpForm.sequenceOrder} onChange={e => setCpForm({ ...cpForm, sequenceOrder: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">Point: {pendingPoint.lat.toFixed(6)}, {pendingPoint.lng.toFixed(6)} — click elsewhere on the map to move it.</p>
            <div className="flex justify-end gap-2">
              <button onClick={cancelCheckpointEdit} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={saveCheckpoint} disabled={savingCp} className="bg-blue-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">{savingCp ? 'Saving...' : editingCp ? 'Save Changes' : 'Add Checkpoint'}</button>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-100 mt-4">
          {checkpoints.map(cp => (
            <div key={cp.id} className="py-2.5 flex items-center justify-between text-sm gap-2">
              <div className="min-w-0">
                <span className="font-medium">#{cp.sequence_order} {cp.name}</span>
                <span className="text-xs text-gray-400 ml-2">{cp.radius_meters}m radius</span>
                {!cp.is_active && <span className="text-xs text-gray-400 ml-2">(inactive)</span>}
              </div>
              {canManage && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => toggleCheckpointActive(cp)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">{cp.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => startEditCheckpoint(cp)} className="text-gray-400 hover:text-blue-600 p-1"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteCheckpoint(cp.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          ))}
          {checkpoints.length === 0 && <p className="text-sm text-gray-400 py-2">No checkpoints configured yet — click the map above to add one.</p>}
        </div>
      </div>
    </div>
  )
}
