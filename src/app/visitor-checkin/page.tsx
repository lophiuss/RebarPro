'use client'

import { useState } from 'react'
import { submitVisitorCheckin } from './actions'
import { ShieldCheck, CheckCircle2 } from 'lucide-react'

export default function VisitorCheckinPage() {
  const [form, setForm] = useState({ personName: '', company: '', purpose: '', lookingFor: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.personName.trim()) { alert('Please enter your name'); return }
    setSubmitting(true)
    try {
      await submitVisitorCheckin(form)
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
          <h1 className="text-2xl font-bold text-white mb-2">You're checked in</h1>
          <p className="text-slate-400 text-sm">Please wait here — a guard will come take your photo and let you in shortly.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6 py-10">
      <div className="max-w-sm w-full">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">Visitor Check-In</span>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Your Name *</label>
            <input required autoFocus value={form.personName} onChange={e => setForm({ ...form, personName: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Company</label>
            <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Purpose of Visit</label>
            <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Who Are You Looking For?</label>
            <input value={form.lookingFor} onChange={e => setForm({ ...form, lookingFor: e.target.value })} placeholder="Name or department" className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-lg hover:bg-blue-700 mt-2">
            {submitting ? 'Submitting...' : 'Check In'}
          </button>
          <p className="text-xs text-gray-400 text-center">A guard will take your photo and let you in after this.</p>
        </form>
      </div>
    </div>
  )
}
