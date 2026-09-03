'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadSecurityPhoto } from '../actions'
import { Siren } from 'lucide-react'
import PhotoLightbox from '@/components/PhotoLightbox'
import PhotoPicker from '@/components/PhotoPicker'

type Incident = {
  id: number
  type: string
  description: string
  location: string | null
  reported_by: string
  photo_drive_id: string | null
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'closed'
  created_at: string
}

const SEVERITY_STYLE: Record<Incident['severity'], string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
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

export default function IncidentsPage() {
  const supabase = createClient()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [form, setForm] = useState({ type: '', description: '', location: '', reported_by: '', severity: 'medium' as Incident['severity'] })

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('security_incidents').select('*').order('created_at', { ascending: false }).limit(100)
    setIncidents(data || [])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.type.trim() || !form.description.trim() || !form.reported_by.trim()) { alert('Type, description, and reported by are required'); return }
    setSubmitting(true)
    try {
      let photo_drive_id: string | null = null
      if (photoFile) {
        const blob = await compressImage(photoFile)
        const fd = new FormData()
        fd.set('photo', blob, 'photo.jpg')
        fd.set('subfolder', 'incidents')
        photo_drive_id = await uploadSecurityPhoto(fd)
      }
      const { error } = await supabase.from('security_incidents').insert([{
        type: form.type.trim(), description: form.description.trim(), location: form.location || null,
        reported_by: form.reported_by.trim(), photo_drive_id, severity: form.severity, status: 'open',
      }])
      if (error) throw error
      setForm({ type: '', description: '', location: '', reported_by: '', severity: 'medium' })
      setPhotoFile(null)
      await load()
    } catch (err: any) {
      alert('Error reporting incident: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function closeIncident(id: number) {
    const { error } = await supabase.from('security_incidents').update({ status: 'closed' }).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Siren className="w-7 h-7 text-red-500" /> Incidents</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6">
        <form onSubmit={submit} className="bg-white border rounded-xl shadow-sm p-6 space-y-3 h-fit">
          <h2 className="text-sm font-bold text-slate-700 mb-1">Report an Incident</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <input required value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder="e.g. Theft, Trespassing, Fire" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" rows={3} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Reported By</label>
            <input required value={form.reported_by} onChange={e => setForm({ ...form, reported_by: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Severity</label>
            <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value as Incident['severity'] })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <PhotoPicker label="Photo Evidence" file={photoFile} onChange={setPhotoFile} />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-red-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-red-700 mt-2">
            {submitting ? 'Saving...' : 'Report Incident'}
          </button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">Recent Incidents</h2></div>
          <div className="divide-y divide-gray-100 max-h-[640px] overflow-y-auto">
            {incidents.map(i => (
              <div key={i.id} className="px-4 py-3 flex items-start gap-3">
                {i.photo_drive_id ? (
                  <img
                    src={`/api/security/photo/${i.photo_drive_id}`}
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0 cursor-zoom-in"
                    onClick={() => setZoomSrc(`/api/security/photo/${i.photo_drive_id}`)}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{i.type}</span>
                    <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 ${SEVERITY_STYLE[i.severity]}`}>{i.severity}</span>
                    {i.status === 'closed' && <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">Closed</span>}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{i.description}</p>
                  <div className="text-xs text-gray-400 mt-1">{i.location || '-'} · {i.reported_by} · {new Date(i.created_at).toLocaleString()}</div>
                </div>
                {i.status === 'open' && (
                  <button onClick={() => closeIncident(i.id)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 flex-shrink-0">Close</button>
                )}
              </div>
            ))}
            {incidents.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">No incidents reported.</p>}
          </div>
        </div>
      </div>

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
