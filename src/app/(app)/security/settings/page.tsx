'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'
import { Settings as SettingsIcon, Plus, Trash2, Pencil, Image as ImageIcon, QrCode, Copy, Check } from 'lucide-react'

type Post = { id: number; name: string }
type LayoutRow = { photo_url: string | null; photo_drive_id: string | null } | null

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

  useEffect(() => {
    load()
    const url = `${window.location.origin}/visitor-checkin`
    setKioskUrl(url)
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQrDataUrl).catch(() => {})
  }, [])

  async function load() {
    const [{ data: postRows }, { data: layoutRow }] = await Promise.all([
      supabase.from('security_guard_posts').select('*').order('name'),
      supabase.from('security_layout').select('photo_url, photo_drive_id').order('id', { ascending: false }).limit(1).maybeSingle(),
    ])
    setPosts(postRows || [])
    setLayout(layoutRow)
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
    </div>
  )
}
