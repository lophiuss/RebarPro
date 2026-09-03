'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadSecurityPhoto } from '../actions'
import { ClipboardEdit, LogOut, AlertTriangle, Camera } from 'lucide-react'

type Category = 'visitor' | 'delivery' | 'inhouse'

type Entry = {
  id: number
  category: Category
  person_name: string
  company: string | null
  purpose: string | null
  vehicle_no: string | null
  badge_no: string | null
  reference_no: string | null
  notes: string | null
  photo_drive_id: string | null
  status: 'in' | 'out'
  time_in: string
  time_out: string | null
  abnormal_flag: boolean
  abnormal_reason: string | null
}

const CATEGORY_LABEL: Record<Category, string> = { visitor: 'Visitor', delivery: 'Delivery', inhouse: 'In-House' }

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

export default function EntriesPage() {
  const supabase = createClient()
  const [category, setCategory] = useState<Category>('visitor')
  const [active, setActive] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [abnormalTarget, setAbnormalTarget] = useState<Entry | null>(null)
  const [abnormalReason, setAbnormalReason] = useState('')

  const [form, setForm] = useState({ person_name: '', company: '', purpose: '', vehicle_no: '', badge_no: '', reference_no: '', notes: '' })
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  useEffect(() => { load() }, [category])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('security_entries').select('*').eq('category', category).eq('status', 'in').order('time_in', { ascending: false })
    setActive(data || [])
    setLoading(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.person_name.trim()) { alert('Name is required'); return }
    setSubmitting(true)
    try {
      let photo_drive_id: string | null = null
      if (photoFile) {
        const blob = await compressImage(photoFile)
        const fd = new FormData()
        fd.set('photo', blob, 'photo.jpg')
        fd.set('subfolder', 'entries')
        photo_drive_id = await uploadSecurityPhoto(fd)
      }

      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('security_entries').insert([{
        category,
        person_name: form.person_name.trim(),
        company: form.company || null,
        purpose: form.purpose || null,
        vehicle_no: form.vehicle_no || null,
        badge_no: form.badge_no || null,
        reference_no: form.reference_no || null,
        notes: form.notes || null,
        photo_drive_id,
        status: 'in',
        time_in: new Date().toISOString(),
        created_by: user?.email || null,
      }])
      if (error) throw error

      setForm({ person_name: '', company: '', purpose: '', vehicle_no: '', badge_no: '', reference_no: '', notes: '' })
      setPhotoFile(null)
      await load()
    } catch (err: any) {
      alert('Error saving entry: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function checkout(id: number) {
    const { error } = await supabase.from('security_entries').update({ status: 'out', time_out: new Date().toISOString() }).eq('id', id).eq('status', 'in')
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  async function saveAbnormal() {
    if (!abnormalTarget || !abnormalReason.trim()) return
    const { error } = await supabase.from('security_entries').update({
      abnormal_flag: true, abnormal_reason: abnormalReason.trim(), abnormal_at: new Date().toISOString(),
    }).eq('id', abnormalTarget.id)
    if (error) { alert('Error: ' + error.message); return }
    setAbnormalTarget(null)
    setAbnormalReason('')
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><ClipboardEdit className="w-7 h-7 text-blue-600" /> Entries</h1>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {(['visitor', 'delivery', 'inhouse'] as Category[]).map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`text-sm font-medium px-4 py-2 rounded-md transition ${category === c ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6">
        <form onSubmit={submit} className="bg-white border rounded-xl shadow-sm p-6 space-y-3 h-fit">
          <h2 className="text-sm font-bold text-slate-700 mb-1">Log {CATEGORY_LABEL[category]} In</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input required value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
            <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Purpose</label>
            <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Vehicle No</label>
              <input value={form.vehicle_no} onChange={e => setForm({ ...form, vehicle_no: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Badge No</label>
              <input value={form.badge_no} onChange={e => setForm({ ...form, badge_no: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Reference No</label>
            <input value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" rows={2} />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1"><Camera className="w-3.5 h-3.5" /> Photo</label>
            <input type="file" accept="image/*" capture="environment" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 mt-2">
            {submitting ? 'Saving...' : `Check In`}
          </button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">Currently In ({active.length})</h2></div>
          <div className="divide-y divide-gray-100 max-h-[640px] overflow-y-auto">
            {active.map(e => (
              <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                {e.photo_drive_id ? (
                  <img src={`/api/security/photo/${e.photo_drive_id}`} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate flex items-center gap-1.5">
                    {e.person_name}
                    {e.abnormal_flag && <span title="Flagged abnormal"><AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /></span>}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{[e.company, e.vehicle_no, e.purpose].filter(Boolean).join(' · ') || '-'}</div>
                  <div className="text-xs text-gray-400">In: {new Date(e.time_in).toLocaleString()}</div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => checkout(e.id)} className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2.5 py-1.5 rounded-lg hover:bg-green-100"><LogOut className="w-3.5 h-3.5" /> Out</button>
                  {!e.abnormal_flag && (
                    <button onClick={() => { setAbnormalTarget(e); setAbnormalReason('') }} className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-lg hover:bg-amber-100"><AlertTriangle className="w-3.5 h-3.5" /> Flag</button>
                  )}
                </div>
              </div>
            ))}
            {!loading && active.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Nobody checked in for this category.</p>}
          </div>
        </div>
      </div>

      {abnormalTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold mb-3">Flag Abnormal — {abnormalTarget.person_name}</h2>
            <label className="block text-xs font-medium text-gray-500 mb-1">Reason</label>
            <textarea value={abnormalReason} onChange={e => setAbnormalReason(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-4" rows={3} autoFocus />
            <div className="flex justify-end gap-3">
              <button onClick={() => setAbnormalTarget(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={saveAbnormal} disabled={!abnormalReason.trim()} className="bg-amber-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-amber-700">Save Flag</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
