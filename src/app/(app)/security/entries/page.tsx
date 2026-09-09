'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadSecurityPhoto } from '../actions'
import { ClipboardEdit, LogOut, AlertTriangle, UserCheck, X } from 'lucide-react'
import PhotoLightbox from '@/components/PhotoLightbox'
import PhotoPicker from '@/components/PhotoPicker'
import { useLang } from '@/lib/i18n/useLang'
import { makeT } from '@/lib/i18n/languages'
import { securityDict } from '@/lib/i18n/dict/security'
import LanguageSwitcher from '@/components/LanguageSwitcher'

type Category = 'visitor' | 'delivery' | 'inhouse'

type Entry = {
  id: number
  // Null only while status is 'pending' — a self check-in from the QR kiosk
  // hasn't been assigned a group yet; a guard picks one on approval.
  category: Category | null
  person_name: string
  company: string | null
  purpose: string | null
  looking_for: string | null
  vehicle_no: string | null
  badge_no: string | null
  reference_no: string | null
  notes: string | null
  photo_drive_id: string | null
  status: 'pending' | 'in' | 'out'
  time_in: string
  time_out: string | null
  created_by: string | null
  abnormal_flag: boolean
  abnormal_reason: string | null
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

export default function EntriesPage() {
  const supabase = createClient()
  const [category, setCategory] = useState<Category>('visitor')
  const [active, setActive] = useState<Entry[]>([])
  const [pending, setPending] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [abnormalTarget, setAbnormalTarget] = useState<Entry | null>(null)
  const [abnormalReason, setAbnormalReason] = useState('')
  const [approving, setApproving] = useState<Entry | null>(null)
  const [approveForm, setApproveForm] = useState({
    category: '' as Category | '', person_name: '', company: '', purpose: '', looking_for: '',
    vehicle_no: '', badge_no: '', reference_no: '', notes: '',
  })
  const [approvePhoto, setApprovePhoto] = useState<File | null>(null)
  const [approving2, setApproving2] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [detail, setDetail] = useState<Entry | null>(null)

  const [form, setForm] = useState({ person_name: '', company: '', purpose: '', looking_for: '', vehicle_no: '', badge_no: '', reference_no: '', notes: '' })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [lang, setLang] = useLang()
  const t = makeT(securityDict, lang)
  const categoryLabel = (c: Category) => t(`category.${c}`)

  useEffect(() => { load() }, [category])

  async function load() {
    setLoading(true)
    // Pending self check-ins have no category yet, so they're not tied to any
    // one tab — they always show up here regardless of which tab is active.
    const [{ data }, { data: pendingRows }] = await Promise.all([
      supabase.from('security_entries').select('*').eq('category', category).eq('status', 'in').order('time_in', { ascending: false }),
      supabase.from('security_entries').select('*').eq('status', 'pending').order('time_in', { ascending: false }),
    ])
    setActive(data || [])
    setPending(pendingRows || [])
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
        looking_for: form.looking_for || null,
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

      setForm({ person_name: '', company: '', purpose: '', looking_for: '', vehicle_no: '', badge_no: '', reference_no: '', notes: '' })
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
    setActive(prev => prev.filter(e => e.id !== id))
  }

  function openApprove(p: Entry) {
    setApproving(p)
    setApproveForm({
      category: '', person_name: p.person_name, company: p.company || '', purpose: p.purpose || '',
      looking_for: p.looking_for || '', vehicle_no: p.vehicle_no || '', badge_no: p.badge_no || '',
      reference_no: p.reference_no || '', notes: p.notes || '',
    })
    setApprovePhoto(null)
  }

  async function approveVisitor() {
    if (!approving) return
    if (!approveForm.person_name.trim()) { alert('Name is required'); return }
    if (!approveForm.category) { alert('Please pick which group this person belongs to (Visitor / Delivery / In-House)'); return }
    setApproving2(true)
    try {
      let photo_drive_id: string | null = approving.photo_drive_id
      if (approvePhoto) {
        const blob = await compressImage(approvePhoto)
        const fd = new FormData()
        fd.set('photo', blob, 'photo.jpg')
        fd.set('subfolder', 'entries')
        photo_drive_id = await uploadSecurityPhoto(fd)
      }
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('security_entries').update({
        category: approveForm.category,
        person_name: approveForm.person_name.trim(),
        company: approveForm.company.trim() || null,
        purpose: approveForm.purpose.trim() || null,
        looking_for: approveForm.looking_for.trim() || null,
        vehicle_no: approveForm.vehicle_no.trim() || null,
        badge_no: approveForm.badge_no.trim() || null,
        reference_no: approveForm.reference_no.trim() || null,
        notes: approveForm.notes.trim() || null,
        status: 'in', time_in: new Date().toISOString(), photo_drive_id, created_by: user?.email || null,
      }).eq('id', approving.id).eq('status', 'pending')
      if (error) throw error
      setApproving(null)
      setApprovePhoto(null)
      await load()
    } catch (err: any) {
      alert('Error approving: ' + err.message)
    } finally {
      setApproving2(false)
    }
  }

  async function rejectVisitor(id: number) {
    if (!confirm('Reject this self check-in? It will be removed.')) return
    const { error } = await supabase.from('security_entries').delete().eq('id', id).eq('status', 'pending')
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><ClipboardEdit className="w-7 h-7 text-blue-600" /> {t('entries.title')}</h1>
        <LanguageSwitcher lang={lang} onChange={setLang} />
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {(['visitor', 'delivery', 'inhouse'] as Category[]).map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`text-sm font-medium px-4 py-2 rounded-md transition ${category === c ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {categoryLabel(c)}
          </button>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-amber-200">
            <h2 className="text-sm font-bold text-amber-800 flex items-center gap-2"><UserCheck className="w-4 h-4" /> {t('entries.pendingCheckins')} ({pending.length})</h2>
            <p className="text-xs text-amber-700 mt-0.5">{t('entries.pendingHint')}</p>
          </div>
          <div className="divide-y divide-amber-100">
            {pending.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3 bg-white">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{p.person_name}</div>
                  <div className="text-xs text-gray-500">{[p.company, p.purpose, p.vehicle_no].filter(Boolean).join(' · ') || '-'}{p.looking_for ? ` · ${t('entries.lookingFor')}: ${p.looking_for}` : ''}</div>
                  {p.notes && <div className="text-xs text-gray-400 italic">"{p.notes}"</div>}
                  <div className="text-xs text-gray-400">{t('entries.submitted')} {new Date(p.time_in).toLocaleString()}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openApprove(p)} className="text-xs bg-green-600 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-green-700">{t('entries.reviewApprove')}</button>
                  <button onClick={() => rejectVisitor(p.id)} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">{t('entries.reject')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6">
        <form onSubmit={submit} className="bg-white border rounded-xl shadow-sm p-6 space-y-3 h-fit">
          <h2 className="text-sm font-bold text-slate-700 mb-1">{t('entries.logIn')} {categoryLabel(category)} {t('entries.in')}</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.name')}</label>
            <input required value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.company')}</label>
            <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.purpose')}</label>
            <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('entries.whoLookingFor')}</label>
            <input value={form.looking_for} onChange={e => setForm({ ...form, looking_for: e.target.value })} placeholder={t('entries.whoLookingForPlaceholder')} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('entries.vehicleNo')}</label>
              <input value={form.vehicle_no} onChange={e => setForm({ ...form, vehicle_no: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('entries.badgeNo')}</label>
              <input value={form.badge_no} onChange={e => setForm({ ...form, badge_no: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('entries.referenceNo')}</label>
            <input value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.notes')}</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" rows={2} />
          </div>
          <PhotoPicker file={photoFile} onChange={setPhotoFile} />
          <button type="submit" disabled={submitting} className="w-full bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 mt-2">
            {submitting ? t('common.saving') : t('entries.checkIn')}
          </button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">{t('entries.currentlyIn')} ({active.length})</h2></div>
          <div className="divide-y divide-gray-100 max-h-[640px] overflow-y-auto">
            {active.map(e => (
              <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                {e.photo_drive_id ? (
                  <img
                    src={`/api/security/photo/${e.photo_drive_id}`}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 cursor-zoom-in"
                    onClick={() => setZoomSrc(`/api/security/photo/${e.photo_drive_id}`)}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0" />
                )}
                <button onClick={() => setDetail(e)} className="min-w-0 flex-1 text-left" title="View full details">
                  <div className="font-medium text-sm truncate flex items-center gap-1.5">
                    {e.person_name}
                    {e.abnormal_flag && <span title="Flagged abnormal"><AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /></span>}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{[e.company, e.vehicle_no, e.purpose].filter(Boolean).join(' · ') || '-'}{e.looking_for ? ` · ${t('entries.lookingFor')}: ${e.looking_for}` : ''}</div>
                  <div className="text-xs text-gray-400">{t('common.timeIn')}: {new Date(e.time_in).toLocaleString()}</div>
                </button>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => checkout(e.id)} className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2.5 py-1.5 rounded-lg hover:bg-green-100"><LogOut className="w-3.5 h-3.5" /> {t('entries.out')}</button>
                  {!e.abnormal_flag && (
                    <button onClick={() => { setAbnormalTarget(e); setAbnormalReason('') }} className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-lg hover:bg-amber-100"><AlertTriangle className="w-3.5 h-3.5" /> {t('entries.flag')}</button>
                  )}
                </div>
              </div>
            ))}
            {!loading && active.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">{t('entries.nobodyCheckedIn')}</p>}
          </div>
        </div>
      </div>

      {abnormalTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold mb-3">{t('entries.flagAbnormal')} — {abnormalTarget.person_name}</h2>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('entries.reason')}</label>
            <textarea value={abnormalReason} onChange={e => setAbnormalReason(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-4" rows={3} autoFocus />
            <div className="flex justify-end gap-3">
              <button onClick={() => setAbnormalTarget(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">{t('common.cancel')}</button>
              <button onClick={saveAbnormal} disabled={!abnormalReason.trim()} className="bg-amber-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-amber-700">{t('entries.saveFlag')}</button>
            </div>
          </div>
        </div>
      )}

      {approving && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{t('entries.reviewSelfCheckin')}</h2>
              <button onClick={() => setApproving(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('entries.whichGroup')}</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
              {(['visitor', 'delivery', 'inhouse'] as Category[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setApproveForm({ ...approveForm, category: c })}
                  className={`text-sm font-medium px-3.5 py-1.5 rounded-md transition ${approveForm.category === c ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {categoryLabel(c)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.name')}</label>
                <input value={approveForm.person_name} onChange={e => setApproveForm({ ...approveForm, person_name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.company')}</label>
                <input value={approveForm.company} onChange={e => setApproveForm({ ...approveForm, company: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.purpose')}</label>
                <input value={approveForm.purpose} onChange={e => setApproveForm({ ...approveForm, purpose: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('entries.whoLookingFor')}</label>
                <input value={approveForm.looking_for} onChange={e => setApproveForm({ ...approveForm, looking_for: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('entries.vehicleNo')}</label>
                <input value={approveForm.vehicle_no} onChange={e => setApproveForm({ ...approveForm, vehicle_no: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('entries.badgeNo')}</label>
                <input value={approveForm.badge_no} onChange={e => setApproveForm({ ...approveForm, badge_no: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('entries.referenceDoNo')}</label>
                <input value={approveForm.reference_no} onChange={e => setApproveForm({ ...approveForm, reference_no: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.notes')}</label>
                <textarea value={approveForm.notes} onChange={e => setApproveForm({ ...approveForm, notes: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" rows={2} />
              </div>
            </div>

            <div className="mb-4"><PhotoPicker file={approvePhoto} onChange={setApprovePhoto} /></div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setApproving(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">{t('common.cancel')}</button>
              <button onClick={approveVisitor} disabled={approving2} className="bg-green-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700">
                {approving2 ? t('entries.approving') : t('entries.approveLetIn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{detail.person_name}</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-4 flex-wrap mb-4">
              {detail.photo_drive_id ? (
                <img
                  src={`/api/security/photo/${detail.photo_drive_id}`}
                  className="w-32 h-32 rounded-xl object-cover border flex-shrink-0 cursor-zoom-in"
                  onClick={() => setZoomSrc(`/api/security/photo/${detail.photo_drive_id}`)}
                />
              ) : (
                <div className="w-32 h-32 rounded-xl bg-gray-100 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-[180px] text-sm">
                <span className="inline-block bg-blue-50 text-blue-700 text-xs font-bold uppercase rounded-full px-2.5 py-1 mb-2">{detail.category ? categoryLabel(detail.category) : '-'}</span>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div><strong>{t('common.company')}:</strong> {detail.company || '-'}</div>
                  <div><strong>{t('common.purpose')}:</strong> {detail.purpose || '-'}</div>
                  <div><strong>{t('dashboard.vehicle')}:</strong> {detail.vehicle_no || '-'}</div>
                  <div><strong>{t('dashboard.badge')}:</strong> {detail.badge_no || '-'}</div>
                  <div><strong>{t('dashboard.refDo')}:</strong> {detail.reference_no || '-'}</div>
                  <div><strong>{t('common.timeIn')}:</strong> {new Date(detail.time_in).toLocaleString()}</div>
                </div>
                {detail.looking_for && <div className="text-sm mt-1.5"><strong>{t('entries.lookingFor')}:</strong> {detail.looking_for}</div>}
              </div>
            </div>
            {detail.notes && <div className="text-sm bg-gray-50 border rounded-lg px-3 py-2 mb-4"><strong>{t('common.notes')}:</strong> {detail.notes}</div>}
            {detail.abnormal_flag && detail.abnormal_reason && (
              <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-amber-800"><strong>{t('entries.flagged')}:</strong> {detail.abnormal_reason}</div>
            )}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{t('dashboard.attendedBy')}: {detail.created_by || '-'}</span>
              <button onClick={() => { checkout(detail.id); setDetail(null) }} className="flex items-center gap-1.5 bg-green-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-green-700"><LogOut className="w-3.5 h-3.5" /> {t('dashboard.checkout')}</button>
            </div>
          </div>
        </div>
      )}

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
