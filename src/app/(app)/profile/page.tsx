'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User as UserIcon, Camera } from 'lucide-react'

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
  const MAX = 512
  let { width, height } = img
  if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX } }
  else if (height > MAX) { width *= MAX / height; height = MAX }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  return new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.7))
}

export default function ProfilePage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    setEmail(user.email || '')
    const { data: profile } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single()
    setName(profile?.full_name || '')
    setAvatarUrl(profile?.avatar_url || null)
    setLoading(false)
  }

  function pickAvatarFile(file: File | null) {
    setAvatarFile(file)
    if (file) setAvatarPreview(URL.createObjectURL(file))
  }

  async function save() {
    if (!userId) return
    setSaving(true)
    setSavedMsg(null)
    try {
      let newAvatarUrl = avatarUrl
      if (avatarFile) {
        const blob = await compressImage(avatarFile)
        const path = `${userId}/${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        if (upErr) throw upErr
        newAvatarUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      }
      const { error } = await supabase.from('profiles').update({ full_name: name.trim() || null, avatar_url: newAvatarUrl }).eq('id', userId)
      if (error) throw error
      setAvatarUrl(newAvatarUrl)
      setAvatarFile(null)
      setSavedMsg('Saved!')
      setTimeout(() => setSavedMsg(null), 3000)
    } catch (err: any) {
      alert('Error saving: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>

  const displayAvatar = avatarPreview || avatarUrl

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-2">My Profile</h1>
      <p className="text-sm text-gray-500 mb-8">Update your display name and profile picture — this is how you appear across every department.</p>

      <div className="bg-white border rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          {displayAvatar ? (
            <img src={displayAvatar} className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center"><UserIcon className="w-8 h-8" /></div>
          )}
          <div>
            <label className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-200 cursor-pointer">
              <Camera className="w-3.5 h-3.5" /> Change Picture
              <input type="file" accept="image/*" className="hidden" onChange={e => pickAvatarFile(e.target.files?.[0] ?? null)} />
            </label>
            <p className="text-xs text-gray-400 mt-1">{email}</p>
          </div>
        </div>

        <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="w-full border rounded-md px-3 py-2 text-sm mb-4" />

        <button onClick={save} disabled={saving} className="w-full bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-blue-700">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {savedMsg && <p className="text-sm text-green-600 font-medium text-center mt-3">{savedMsg}</p>}
      </div>
    </div>
  )
}
