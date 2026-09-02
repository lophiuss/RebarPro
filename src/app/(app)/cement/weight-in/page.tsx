'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CheckCircle, Scale } from 'lucide-react'

export default function WeightInPage() {
  const supabase = createClient()
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    supplier: '', weigh_date: new Date().toISOString().split('T')[0],
    do_number: '', seal_no: '', lorry_no: '', trailer_no: '',
    do_weight: '', weight_in: '',
  })
  const [file1, setFile1] = useState<File | null>(null)
  const [file2, setFile2] = useState<File | null>(null)

  useEffect(() => {
    supabase.from('cement_suppliers').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setSuppliers(data || []))
  }, [])

  // Resize to max 1024px on the long edge and re-encode as ~60%-quality JPEG,
  // same as the legacy weight-in.html did client-side before upload.
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

    const MAX = 1024
    let { width, height } = img
    if (width > height) {
      if (width > MAX) { height *= MAX / width; width = MAX }
    } else if (height > MAX) {
      width *= MAX / height; height = MAX
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

    return new Promise<Blob>(resolve => {
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.6)
    })
  }

  async function uploadPhoto(file: File | null): Promise<string | null> {
    if (!file) return null
    const blob = await compressImage(file)
    const path = `weight-in/${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.name.replace(/\.[^.]+$/, '.jpg')}`
    const { error } = await supabase.storage.from('cement-uploads').upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw error
    return path
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const [file1_path, file2_path] = await Promise.all([uploadPhoto(file1), uploadPhoto(file2)])

      const { error } = await supabase.from('cement_weight_in').insert([{
        supplier: form.supplier,
        weigh_date: form.weigh_date,
        do_number: form.do_number,
        seal_no: form.seal_no || null,
        lorry_no: form.lorry_no,
        trailer_no: form.trailer_no || null,
        do_weight: Number(form.do_weight),
        weight_in: Number(form.weight_in),
        file1_path, file2_path,
      }])
      if (error) throw error

      setSuccessMessage(`✓ Weight-in saved for lorry ${form.lorry_no} (DO ${form.do_number}). It'll show up on Unloading next.`)
      setForm({ supplier: '', weigh_date: new Date().toISOString().split('T')[0], do_number: '', seal_no: '', lorry_no: '', trailer_no: '', do_weight: '', weight_in: '' })
      setFile1(null); setFile2(null)
      const f1 = document.getElementById('file1') as HTMLInputElement | null
      const f2 = document.getElementById('file2') as HTMLInputElement | null
      if (f1) f1.value = ''
      if (f2) f2.value = ''
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      alert('Error saving weight-in: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Scale className="w-7 h-7 text-blue-600" /> Weight In</h1>

      {successMessage && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-300 text-green-800 rounded-xl px-5 py-4 shadow-sm">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border rounded-xl bg-white shadow-sm p-6 space-y-6">
        <div>
          <h2 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">🚚 Logistics Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Supplier</label>
              <select required value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} className="w-full border rounded-md px-3 py-2 bg-white">
                <option value="">Select Supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <input type="date" required value={form.weigh_date} onChange={e => setForm({ ...form, weigh_date: e.target.value })} className="w-full border rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">DO Number</label>
              <input required placeholder="#123456" value={form.do_number} onChange={e => setForm({ ...form, do_number: e.target.value })} className="w-full border rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Seal No <span className="text-gray-400">(Optional)</span></label>
              <input value={form.seal_no} onChange={e => setForm({ ...form, seal_no: e.target.value })} className="w-full border rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Lorry No</label>
              <input required placeholder="e.g. WX 1234" value={form.lorry_no} onChange={e => setForm({ ...form, lorry_no: e.target.value })} className="w-full border rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Trailer No <span className="text-gray-400">(Optional)</span></label>
              <input value={form.trailer_no} onChange={e => setForm({ ...form, trailer_no: e.target.value })} className="w-full border rounded-md px-3 py-2" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">⚖️ Weight Measurements (kg)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">DO Weight</label>
              <input type="number" step="0.01" required placeholder="0.00" value={form.do_weight} onChange={e => setForm({ ...form, do_weight: e.target.value })} className="w-full border rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Weight In</label>
              <input type="number" step="0.01" required placeholder="0.00" value={form.weight_in} onChange={e => setForm({ ...form, weight_in: e.target.value })} className="w-full border rounded-md px-3 py-2" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">📎 Attachments <span className="text-gray-400 font-normal">(Optional)</span></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">File 1</label>
              <input id="file1" type="file" accept="image/*" onChange={e => setFile1(e.target.files?.[0] ?? null)} className="w-full border border-dashed rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">File 2</label>
              <input id="file2" type="file" accept="image/*" onChange={e => setFile2(e.target.files?.[0] ?? null)} className="w-full border border-dashed rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Saving...' : '💾 Save Weight In Record'}
        </Button>
      </form>
    </div>
  )
}
