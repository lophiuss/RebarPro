'use client'

import { useState } from 'react'
import { submitVisitorCheckin } from './actions'
import { ShieldCheck, CheckCircle2 } from 'lucide-react'
import { useLang } from '@/lib/i18n/useLang'
import { makeT } from '@/lib/i18n/languages'
import { visitorCheckinDict } from '@/lib/i18n/dict/visitorCheckin'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function VisitorCheckinPage() {
  const [form, setForm] = useState({ personName: '', company: '', purpose: '', lookingFor: '', vehicleNo: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [lang, setLang] = useLang()
  const t = makeT(visitorCheckinDict, lang)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.personName.trim()) { alert(t('nameRequired')); return }
    setSubmitting(true)
    try {
      await submitVisitorCheckin(form)
      setDone(true)
    } catch (err: any) {
      alert(t('submitError') + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
        <div className="max-w-sm w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">{t('doneTitle')}</h1>
          <p className="text-slate-400 text-sm">{t('doneBody')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6 py-10">
      <div className="max-w-sm w-full">
        <div className="flex items-center justify-between gap-2.5 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">{t('checkIn')}</span>
          </div>
          <LanguageSwitcher lang={lang} onChange={setLang} dark />
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('name')}</label>
            <input required autoFocus value={form.personName} onChange={e => setForm({ ...form, personName: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('company')}</label>
            <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('purpose')}</label>
            <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('lookingFor')}</label>
            <input value={form.lookingFor} onChange={e => setForm({ ...form, lookingFor: e.target.value })} placeholder={t('lookingForPlaceholder')} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('vehicleNo')}</label>
            <input value={form.vehicleNo} onChange={e => setForm({ ...form, vehicleNo: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('notes')}</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-lg hover:bg-blue-700 mt-2">
            {submitting ? t('submitting') : t('submit')}
          </button>
          <p className="text-xs text-gray-400 text-center">{t('footer')}</p>
        </form>
      </div>
    </div>
  )
}
