'use client'

import { useState } from 'react'
import { Mail, Send, Check, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { addInviteContact } from '../../meetings/people/actions'

type Result = { name: string; email: string | null; status: string; reason?: string }

// Access Control > Meetings: type a name and e-mail address and send the invitation. A login is
// created (or an existing one linked), Meetings access is granted, and the person is e-mailed.
export default function MeetingsInvite({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!confirm(`Send a Meetings invitation to ${name.trim()} <${email.trim()}>?\n\nThis creates their login, gives them access to the Meetings module and e-mails them ${mode === 'password' ? 'a random temporary password (they must change it at first sign-in)' : 'a one-time link to choose their own password'}.`)) return
    setBusy(true); setError(''); setResult(null)
    try {
      const contactId = await addInviteContact(name, email)
      const { data, error: err } = await createClient().functions.invoke('send-meeting-invite', {
        body: { contact_ids: [contactId], site_url: window.location.origin, message: message.trim() || undefined, mode },
      })
      if (err) {
        let detail = err.message
        try { const b = await (err as any).context?.json?.(); if (b?.error) detail = b.error } catch { /* keep generic */ }
        throw new Error(detail)
      }
      const r = (data?.results?.[0] ?? null) as Result | null
      setResult(r)
      if (r && (r.status === 'invited' || r.status === 'resent')) { setName(''); setEmail(''); setMessage(''); onDone() }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={send} className="mb-8 border rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><Mail className="w-4 h-4" /> Invite someone to Meetings by e-mail</h2>
      <p className="text-xs text-gray-500 mb-3">Type their name and e-mail address. They get a login, Meetings access and an invitation e-mail.</p>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs font-medium text-gray-500">Name
          <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="mt-1 block border rounded-md px-3 py-2 text-sm w-56 text-slate-900 font-normal" />
        </label>
        <label className="text-xs font-medium text-gray-500">E-mail
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" className="mt-1 block border rounded-md px-3 py-2 text-sm w-72 text-slate-900 font-normal" />
        </label>
        <button disabled={busy || !name.trim() || !email.trim()} className="inline-flex items-center gap-1.5 bg-blue-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <Send className="w-4 h-4" /> {busy ? 'Sending…' : 'Send invitation'}
        </button>
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <label className="inline-flex items-center gap-2"><input type="radio" name="inv-mode" checked={mode === 'password'} onChange={() => setMode('password')} /> Random temporary password (must be changed at first sign-in)</label>
        <label className="inline-flex items-center gap-2"><input type="radio" name="inv-mode" checked={mode === 'link'} onChange={() => setMode('link')} /> One-time link to choose their own password</label>
      </fieldset>
      <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Optional message in the e-mail" className="mt-3 w-full max-w-xl border rounded-md px-3 py-2 text-sm" aria-label="Message in the invitation" />
      {error && <p className="mt-3 text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}
      {result && (
        <p className={`mt-3 text-sm flex items-center gap-1.5 ${result.status === 'invited' || result.status === 'resent' ? 'text-green-700' : 'text-amber-700'}`}>
          {result.status === 'invited' || result.status === 'resent' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {result.status === 'invited' ? `Invitation sent to ${result.email}.` : result.status === 'resent' ? `Invitation sent again to ${result.email}.` : `${result.name}: ${result.reason ?? result.status}`}
        </p>
      )}
    </form>
  )
}
