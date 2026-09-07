'use client'

import { useState } from 'react'
import { submitWorkRequest } from './actions'
import { Wrench, CheckCircle2, Camera } from 'lucide-react'

async function compressToDataUrl(file: File): Promise<string> {
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
  return canvas.toDataURL('image/jpeg', 0.75)
}

export default function MaintenanceRequestPage() {
  const [form, setForm] = useState({ requesterName: '', requesterContact: '', location: '', issueDescription: '' })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.requesterName.trim() || !form.issueDescription.trim()) { alert('Please fill in your name and describe the issue'); return }
    setSubmitting(true)
    try {
      const photoDataUrl = photoFile ? await compressToDataUrl(photoFile) : undefined
      await submitWorkRequest({ ...form, photoDataUrl })
      setDone(true)
    } catch (err: any) {
      alert('Something went wrong: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
        <div className="max-w-sm w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Request submitted</h1>
          <p className="text-slate-400 text-sm">A supervisor will review and assign your request shortly.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6 py-10">
      <div className="max-w-sm w-full">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">Maintenance Request</span>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Your Name *</label>
            <input required autoFocus value={form.requesterName} onChange={e => setForm({ ...form, requesterName: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Contact (phone/extension)</label>
            <input value={form.requesterContact} onChange={e => setForm({ ...form, requesterContact: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. PLO 68 Batching Plant 1" className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">What's the issue? *</label>
            <textarea required value={form.issueDescription} onChange={e => setForm({ ...form, issueDescription: e.target.value })} rows={3} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Photo (optional)</label>
            <label className="flex items-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600 hover:border-orange-400 hover:bg-orange-50/50 cursor-pointer transition">
              <Camera className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <span className="truncate">{photoFile ? photoFile.name : 'Take or choose a photo'}</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-orange-600 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-lg hover:bg-orange-700 mt-2">
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
