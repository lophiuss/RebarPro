'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KeyRound, Plus, Trash2 } from 'lucide-react'

type Key = { id: number; key_name: string; key_no: string | null; description: string | null }
type KeyLog = { id: number; key_id: number; key_name: string; issued_to: string; issued_by: string; purpose: string | null; time_issued: string; time_returned: string | null; status: 'out' | 'returned'; returned_by: string | null }

export default function KeysPage() {
  const supabase = createClient()
  const [keys, setKeys] = useState<Key[]>([])
  const [logs, setLogs] = useState<KeyLog[]>([])
  const [isManager, setIsManager] = useState(false)

  const [issueForm, setIssueForm] = useState({ key_id: '', issued_to: '', purpose: '' })
  const [newKey, setNewKey] = useState({ key_name: '', key_no: '', description: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: keyRows }, { data: logRows }, { data: { user } }] = await Promise.all([
      supabase.from('security_keys').select('*').order('key_name'),
      supabase.from('security_key_logs').select('*').order('time_issued', { ascending: false }).limit(100),
      supabase.auth.getUser(),
    ])
    setKeys(keyRows || [])
    setLogs(logRows || [])
    if (user) {
      const { data: access } = await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'security').maybeSingle()
      setIsManager(access?.role === 'admin' || access?.role === 'manager')
    }
  }

  async function issueKey(e: React.FormEvent) {
    e.preventDefault()
    if (!issueForm.key_id || !issueForm.issued_to.trim()) { alert('Key and issued-to name are required'); return }
    const key = keys.find(k => k.id === Number(issueForm.key_id))
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('security_key_logs').insert([{
      key_id: Number(issueForm.key_id),
      key_name: key?.key_name || '',
      issued_to: issueForm.issued_to.trim(),
      issued_by: user?.email || 'unknown',
      purpose: issueForm.purpose || null,
      time_issued: new Date().toISOString(),
      status: 'out',
    }])
    if (error) { alert('Error: ' + error.message); return }
    setIssueForm({ key_id: '', issued_to: '', purpose: '' })
    load()
  }

  async function returnKey(log: KeyLog) {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('security_key_logs').update({
      status: 'returned', time_returned: new Date().toISOString(), returned_by: user?.email || 'unknown',
    }).eq('id', log.id).eq('status', 'out')
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  async function addKey(e: React.FormEvent) {
    e.preventDefault()
    if (!newKey.key_name.trim()) { alert('Key name is required'); return }
    const { error } = await supabase.from('security_keys').insert([{ key_name: newKey.key_name.trim(), key_no: newKey.key_no || null, description: newKey.description || null }])
    if (error) { alert('Error: ' + error.message); return }
    setNewKey({ key_name: '', key_no: '', description: '' })
    load()
  }

  async function deleteKey(id: number) {
    if (!confirm('Delete this key definition?')) return
    const { error } = await supabase.from('security_keys').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  const outLogs = logs.filter(l => l.status === 'out')

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><KeyRound className="w-7 h-7 text-blue-600" /> Keys</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6 mb-8">
        <form onSubmit={issueKey} className="bg-white border rounded-xl shadow-sm p-6 space-y-3 h-fit">
          <h2 className="text-sm font-bold text-slate-700 mb-1">Issue a Key</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Key</label>
            <select required value={issueForm.key_id} onChange={e => setIssueForm({ ...issueForm, key_id: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
              <option value="">Select a key...</option>
              {keys.map(k => <option key={k.id} value={k.id}>{k.key_name}{k.key_no ? ` (${k.key_no})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Issued To</label>
            <input required value={issueForm.issued_to} onChange={e => setIssueForm({ ...issueForm, issued_to: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Purpose</label>
            <input value={issueForm.purpose} onChange={e => setIssueForm({ ...issueForm, purpose: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 mt-2">Issue Key</button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">Currently Out ({outLogs.length})</h2></div>
          <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
            {outLogs.map(l => (
              <div key={l.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{l.key_name} — {l.issued_to}</div>
                  <div className="text-xs text-gray-500">{l.purpose || '-'} · issued {new Date(l.time_issued).toLocaleString()}</div>
                </div>
                <button onClick={() => returnKey(l)} className="text-xs bg-green-50 text-green-700 px-2.5 py-1.5 rounded-lg hover:bg-green-100 flex-shrink-0">Mark Returned</button>
              </div>
            ))}
            {outLogs.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">No keys currently out.</p>}
          </div>
        </div>
      </div>

      {isManager && (
        <div className="bg-white border rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-sm font-bold text-slate-700 mb-3">Key Definitions</h2>
          <form onSubmit={addKey} className="flex flex-wrap gap-2 items-end mb-4">
            <input placeholder="Key name" value={newKey.key_name} onChange={e => setNewKey({ ...newKey, key_name: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
            <input placeholder="Key no." value={newKey.key_no} onChange={e => setNewKey({ ...newKey, key_no: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
            <input placeholder="Description" value={newKey.description} onChange={e => setNewKey({ ...newKey, description: e.target.value })} className="border rounded-md px-3 py-2 text-sm flex-1 min-w-[150px]" />
            <button type="submit" className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> Add</button>
          </form>
          <div className="divide-y divide-gray-100">
            {keys.map(k => (
              <div key={k.id} className="py-2 flex items-center justify-between text-sm">
                <span>{k.key_name}{k.key_no ? ` (${k.key_no})` : ''} <span className="text-gray-400">{k.description}</span></span>
                <button onClick={() => deleteKey(k.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {keys.length === 0 && <p className="text-sm text-gray-400 py-2">No keys defined yet.</p>}
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">Recent Activity</h2></div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issued To</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issued</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Returned</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map(l => (
              <tr key={l.id}>
                <td className="px-4 py-2">{l.key_name}</td>
                <td className="px-4 py-2">{l.issued_to}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(l.time_issued).toLocaleString()}</td>
                <td className="px-4 py-2 text-gray-500">{l.time_returned ? new Date(l.time_returned).toLocaleString() : '-'}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${l.status === 'out' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>{l.status}</span>
                </td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No key activity yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
