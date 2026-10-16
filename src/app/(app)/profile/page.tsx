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

  // Sign-in details
  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [emailBusy, setEmailBusy] = useState(false)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault()
    const next = newEmail.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) { setEmailMsg({ ok: false, text: 'That does not look like an e-mail address.' }); return }
    if (next === email.toLowerCase()) { setEmailMsg({ ok: false, text: 'That is already your sign-in e-mail.' }); return }
    setEmailBusy(true); setEmailMsg(null)
    const { error } = await supabase.auth.updateUser({ email: next })
    setEmailBusy(false)
    if (error) setEmailMsg({ ok: false, text: error.message })
    else { setEmailMsg({ ok: true, text: `We sent a confirmation link to ${next} (and possibly to your current address). Your sign-in e-mail changes once you open it. Until then keep signing in with ${email}.` }); setNewEmail('') }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPw.length < 10) { setPwMsg({ ok: false, text: 'Use at least 10 characters.' }); return }
    if (newPw !== newPw2) { setPwMsg({ ok: false, text: 'The two new passwords do not match.' }); return }
    if (!curPw) { setPwMsg({ ok: false, text: 'Type your current password.' }); return }
    setPwBusy(true); setPwMsg(null)
    // Check the current password first, so a borrowed open session cannot change it.
    const check = await supabase.auth.signInWithPassword({ email, password: curPw })
    if (check.error) { setPwBusy(false); setPwMsg({ ok: false, text: 'Your current password is not right.' }); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwBusy(false)
    if (error) setPwMsg({ ok: false, text: error.message })
    else { setPwMsg({ ok: true, text: 'Password changed. Use it the next time you sign in.' }); setCurPw(''); setNewPw(''); setNewPw2('') }
  }

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
      <p className="text-sm text-gray-500 mb-8">Update your name, picture, sign-in e-mail and password. Your name is how you appear across every department.</p>

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

        <label className="block text-xs font-medium text-gray-500 mb-1">Name (username shown to others)</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="w-full border rounded-md px-3 py-2 text-sm mb-4" />

        <button onClick={save} disabled={saving} className="w-full bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-blue-700">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {savedMsg && <p className="text-sm text-green-600 font-medium text-center mt-3">{savedMsg}</p>}
      </div>

      <form onSubmit={changeEmail} className="bg-white border rounded-xl shadow-sm p-6 mt-6">
        <h2 className="font-bold mb-1">Sign-in e-mail</h2>
        <p className="text-xs text-gray-500 mb-3">Currently <b>{email}</b>. A confirmation link is sent to the new address; the change applies once you open it.</p>
        <label className="block text-xs font-medium text-gray-500 mb-1">New e-mail</label>
        <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="name@company.com" autoComplete="email" className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
        <button disabled={emailBusy || !newEmail.trim()} className="w-full bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-slate-900">{emailBusy ? 'Sending…' : 'Change e-mail'}</button>
        {emailMsg && <p className={`text-sm mt-3 ${emailMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{emailMsg.text}</p>}
      </form>

      <form onSubmit={changePassword} className="bg-white border rounded-xl shadow-sm p-6 mt-6">
        <h2 className="font-bold mb-3">Change password</h2>
        <label className="block text-xs font-medium text-gray-500 mb-1">Current password</label>
        <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} autoComplete="current-password" className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
        <label className="block text-xs font-medium text-gray-500 mb-1">New password <span className="text-gray-400">(at least 10 characters)</span></label>
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" minLength={10} className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
        <label className="block text-xs font-medium text-gray-500 mb-1">Repeat new password</label>
        <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} autoComplete="new-password" className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
        <button disabled={pwBusy || !curPw || !newPw} className="w-full bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-slate-900">{pwBusy ? 'Changing…' : 'Change password'}</button>
        {pwMsg && <p className={`text-sm mt-3 ${pwMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{pwMsg.text}</p>}
      </form>
    </div>
  )
}
