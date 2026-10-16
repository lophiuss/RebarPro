'use client'

import { useMemo, useState } from 'react'
import { Mail, Send, ClipboardPaste, X, Check, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { saveContactEmail, importEmails } from './actions'
import { act } from '../act'
import Avatar from '../Avatar'

type P = { id: string; name: string; email: string; login: string | null; pending: boolean; seats: number; meetings: number; todos: number }
type Result = { contact_id: string; name: string; email: string | null; status: 'invited' | 'resent' | 'skipped' | 'failed' | 'would_invite'; reason?: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function PeopleView({ people, isAdmin }: { people: P[]; isAdmin: boolean }) {
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'waiting' | 'all'>('waiting')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'password' | 'link'>('link')
  const [paste, setPaste] = useState<string | null>(null)
  const [pasteResult, setPasteResult] = useState<{ saved: string[]; unmatched: string[]; already: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState('')

  const emailOf = (p: P) => (emails[p.id] ?? p.email).trim()
  const rows = useMemo(() => people.filter(p => filter === 'all' || !p.login), [people, filter])
  const waiting = people.filter(p => !p.login)
  const ready = waiting.filter(p => EMAIL.test(emailOf(p)))
  const outstanding = people.filter(p => p.login && p.pending && EMAIL.test(emailOf(p)))

  if (!isAdmin) {
    return <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">Only a Meetings admin can invite people.</div>
  }

  async function invite(ids: string[], resend = false) {
    const who = people.filter(p => ids.includes(p.id))
    const text = resend
      ? `Send a fresh invitation e-mail to ${who.length} ${who.length === 1 ? 'person' : 'people'}?`
      : `Invite ${who.length} ${who.length === 1 ? 'person' : 'people'}?\n\nThis creates a login for each one, gives them access to the Meetings module, hands over their to-dos, issues and seats, and e-mails each ${mode === 'password' ? 'a random temporary password. They must choose a new one the first time they sign in.' : 'a one-time link to choose their own password.'}\n\n${who.map(p => `• ${p.name} <${emailOf(p)}>`).join('\n')}`
    if (!confirm(text)) return
    setBusy(true); setError(''); setResults(null)
    try {
      // The e-mail typed in the box may not be saved yet.
      for (const p of who) if (emailOf(p) !== p.email) await saveContactEmail(p.id, emailOf(p))
      const { data, error: err } = await createClient().functions.invoke('send-meeting-invite', {
        body: { contact_ids: ids, site_url: window.location.origin, message: message.trim() || undefined, resend, mode },
      })
      if (err) {
        let detail = err.message
        try { const b = await (err as any).context?.json?.(); if (b?.error) detail = b.error } catch { /* keep generic */ }
        throw new Error(detail)
      }
      setResults(data?.results ?? [])
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function runPaste() {
    if (!paste?.trim()) return
    const r = await act(() => importEmails(paste))
    if (r) setPasteResult(r)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm">
          {(['waiting', 'all'] as const).map(k => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-md font-medium ${filter === k ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
              {k === 'waiting' ? `Without a login (${waiting.length})` : `Everyone (${people.length})`}
            </button>
          ))}
        </div>
        <button onClick={() => { setPaste(''); setPasteResult(null) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50"><ClipboardPaste className="w-4 h-4" /> Paste e-mail list</button>
        {outstanding.length > 0 && (
          <button onClick={() => invite(outstanding.map(p => p.id), true)} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"><Mail className="w-4 h-4" /> Send again to everyone who has not signed in ({outstanding.length})</button>
        )}
        <button onClick={() => invite(ready.map(p => p.id))} disabled={busy || ready.length === 0} className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          <Send className="w-4 h-4" /> {busy ? 'Sending…' : `Invite everyone with an e-mail (${ready.length})`}
        </button>
      </div>

      <fieldset className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <legend className="text-sm font-medium mb-1">How do they get in?</legend>
        <label className="inline-flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'password'} onChange={() => setMode('password')} /> Random temporary password by e-mail (less safe: the password travels in the e-mail)</label>
        <label className="inline-flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'link'} onChange={() => setMode('link')} /> One-time link to choose their own password (recommended: no password is e-mailed)</label>
      </fieldset>
      <label className="block text-sm font-medium mb-4">Message in the invitation <span className="text-gray-400 font-normal">(optional)</span>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="e.g. We are moving our weekly meetings to AlphaVision from Monday." className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal" />
      </label>

      {error && <p className="mb-4 text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}
      {results && (
        <div className="mb-4 border rounded-xl bg-white shadow-sm p-4">
          <div className="flex items-center justify-between mb-2"><b className="text-sm">Result</b><button onClick={() => setResults(null)} aria-label="Close"><X className="w-4 h-4 text-gray-400" /></button></div>
          <ul className="space-y-1 text-sm">
            {results.map(r => (
              <li key={r.contact_id} className="flex items-center gap-2">
                {r.status === 'invited' || r.status === 'resent' ? <Check className="w-4 h-4 text-green-600" /> : <AlertTriangle className={`w-4 h-4 ${r.status === 'failed' ? 'text-red-600' : 'text-amber-500'}`} />}
                <span className="font-medium">{r.name}</span>
                <span className="text-gray-500">{r.status === 'invited' ? 'invited' : r.status === 'resent' ? 'invitation sent again' : r.reason ?? r.status}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-2">Refresh the page to see who now has a login.</p>
        </div>
      )}

      <div className="border rounded-xl bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <tr><th className="text-left px-3 py-2 font-semibold">Person</th><th className="text-left px-3 py-2 font-semibold">E-mail</th><th className="px-3 py-2 font-semibold">Holds</th><th className="text-left px-3 py-2 font-semibold">Status</th><th /></tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Nobody here.</td></tr>}
            {rows.map(p => {
              const val = emailOf(p)
              const valid = EMAIL.test(val)
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2"><div className="flex items-center gap-2"><Avatar person={{ id: p.id, full_name: p.name }} size="sm" /><span className="font-medium">{p.name}</span></div></td>
                  <td className="px-3 py-2">
                    {p.login ? <span className="text-gray-500">{p.email || '—'}</span> : (
                      <input
                        type="email"
                        value={emails[p.id] ?? p.email}
                        onChange={e => setEmails({ ...emails, [p.id]: e.target.value })}
                        onBlur={() => { if (val !== p.email && (valid || val === '')) act(() => saveContactEmail(p.id, val)) }}
                        placeholder="name@company.com"
                        aria-label={`E-mail for ${p.name}`}
                        className={`w-64 border rounded-lg px-2.5 py-1.5 text-sm ${val && !valid ? 'border-red-300 bg-red-50' : ''}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-gray-500 whitespace-nowrap">{p.seats} seat{p.seats === 1 ? '' : 's'} · {p.meetings} meeting{p.meetings === 1 ? '' : 's'} · {p.todos} open to-do{p.todos === 1 ? '' : 's'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {p.login ? <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 ${p.pending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{p.pending ? 'Invited, not signed in' : <><Check className="w-3 h-3" /> Has a login</>}</span> : <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-gray-100 text-gray-600">No login yet</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!p.login && <button onClick={() => invite([p.id])} disabled={busy || !valid} title={valid ? 'Create the login and send the invitation' : 'Add an e-mail first'} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40"><Mail className="w-3.5 h-3.5" /> Send invitation</button>}
                    {p.login && p.email && <button onClick={() => invite([p.id], true)} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40"><Mail className="w-3.5 h-3.5" /> Send again</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-3">A temporary password is only ever sent to someone whose login was just created for this invitation, and they are made to change it straight after signing in. An existing login&apos;s password is never touched. “Send again” issues a new temporary password only to someone who has not signed in yet.</p>

      {paste !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b"><h2 className="font-bold text-lg">Paste e-mail list</h2><button onClick={() => { setPaste(null); if (pasteResult?.saved.length) window.location.reload() }} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">One person per line, name then e-mail, for example:<br /><code className="text-xs bg-gray-100 rounded px-1">Ivy Ong, ivy@company.com</code></p>
              <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={8} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" aria-label="E-mail list" />
              {pasteResult && (
                <div className="text-sm space-y-1">
                  <p className="text-green-700">Saved {pasteResult.saved.length}: {pasteResult.saved.join(', ') || '—'}</p>
                  {pasteResult.already.length > 0 && <p className="text-gray-600">Already have a login: {pasteResult.already.join(', ')}</p>}
                  {pasteResult.unmatched.length > 0 && <p className="text-amber-700">Could not match: {pasteResult.unmatched.join(' | ')}</p>}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button onClick={() => { setPaste(null); if (pasteResult?.saved.length) window.location.reload() }} className="px-4 py-2 text-sm rounded-lg border bg-white">Close</button>
              <button onClick={runPaste} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold">Save e-mails</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
