'use client'

import { useState } from 'react'
import { ShieldCheck, UserPlus, Check } from 'lucide-react'
import { createMeetingsPerson } from './actions'
import { reportActionError } from '@/lib/staleAction'
import MeetingsInvite from './MeetingsInvite'

// Access Control as a Meetings MANAGER sees it: only the Meetings module, and only two things: invite someone
// by e-mail, or create a login for them (Member role). Everything else on this page is admin-only.
export default function MeetingsManagerView() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setDone('')
    try {
      const res = await createMeetingsPerson(email, password, name)
      if (!res.ok) {
        reportActionError(new Error(res.error || 'Could not add this person'), 'Could not add this person')
        return
      }
      setDone(`${name.trim() || email.trim()} was added to Meetings.`)
      setName(''); setEmail(''); setPassword('')
    } catch (err) {
      reportActionError(err, 'Could not add this person')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-blue-600" /> Access Control</h1>
      <p className="text-sm text-gray-500 mb-6">As a Meetings manager you can bring people into <b>Meetings</b> with the Member role. Other departments and roles are managed by their admins.</p>

      <MeetingsInvite onDone={() => {}} />

      <form onSubmit={add} className="mb-8 border rounded-xl bg-white shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Add a person with a password</h2>
        <p className="text-xs text-gray-500 mb-3">Creates their login and gives them Meetings access. Tell them the password yourself and ask them to change it.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs font-medium text-gray-500">Name
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="mt-1 block border rounded-md px-3 py-2 text-sm w-56 text-slate-900 font-normal" />
          </label>
          <label className="text-xs font-medium text-gray-500">E-mail
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" className="mt-1 block border rounded-md px-3 py-2 text-sm w-64 text-slate-900 font-normal" />
          </label>
          <label className="text-xs font-medium text-gray-500">Password (10+ characters)
            <input required minLength={10} type="text" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block border rounded-md px-3 py-2 text-sm w-56 text-slate-900 font-normal" />
          </label>
          <button disabled={busy || !email.trim() || password.length < 10} className="inline-flex items-center gap-1.5 bg-blue-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <UserPlus className="w-4 h-4" /> {busy ? 'Adding…' : 'Add person'}
          </button>
        </div>
        {done && <p className="mt-3 text-sm text-green-700 flex items-center gap-1.5"><Check className="w-4 h-4" /> {done}</p>}
      </form>
    </div>
  )
}
