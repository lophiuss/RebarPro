'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadSecurityPhoto } from '../actions'
import { Settings as SettingsIcon, Plus, Trash2, Pencil, Image as ImageIcon } from 'lucide-react'

type Post = { id: number; name: string }

export default function SecuritySettingsPage() {
  const supabase = createClient()
  const [posts, setPosts] = useState<Post[]>([])
  const [newPost, setNewPost] = useState('')
  const [editing, setEditing] = useState<Post | null>(null)
  const [uploadingLayout, setUploadingLayout] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('security_guard_posts').select('*').order('name')
    setPosts(data || [])
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

  async function uploadLayout(file: File | null) {
    if (!file) return
    setUploadingLayout(true)
    try {
      const fd = new FormData()
      fd.set('photo', file, file.name)
      fd.set('subfolder', 'layout')
      const photo_drive_id = await uploadSecurityPhoto(fd)
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('security_layout').insert([{ photo_drive_id, uploaded_by: user?.email || null }])
      if (error) throw error
      alert('Site layout updated — visible on the Gates page.')
    } catch (err: any) {
      alert('Error uploading layout: ' + err.message)
    } finally {
      setUploadingLayout(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><SettingsIcon className="w-7 h-7 text-blue-600" /> Security Settings</h1>

      <div className="bg-white border rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Site Layout</h2>
        <p className="text-xs text-gray-500 mb-3">Uploaded as the background map on the Gates page.</p>
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
