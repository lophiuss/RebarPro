'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Radio, LogOut } from 'lucide-react'

type Post = { id: number; name: string }
type PostLog = { id: number; post_name: string; guard_name: string; time_in: string; time_out: string | null; notes: string | null }

function isoToday() { return new Date().toISOString().split('T')[0] }

export default function PostLogsPage() {
  const supabase = createClient()
  const [posts, setPosts] = useState<Post[]>([])
  const [active, setActive] = useState<PostLog[]>([])
  const [history, setHistory] = useState<PostLog[]>([])
  const [date, setDate] = useState(isoToday())
  const [form, setForm] = useState({ post_name: '', guard_name: '', notes: '' })

  useEffect(() => { load() }, [])
  useEffect(() => { loadHistory() }, [date])

  async function load() {
    const [{ data: postRows }, { data: activeRows }] = await Promise.all([
      supabase.from('security_guard_posts').select('id, name').order('name'),
      supabase.from('security_post_logs').select('*').is('time_out', null).order('time_in', { ascending: false }),
    ])
    setPosts(postRows || [])
    setActive(activeRows || [])
    loadHistory()
  }

  async function loadHistory() {
    const start = new Date(date + 'T00:00:00').toISOString()
    const end = new Date(date + 'T23:59:59.999').toISOString()
    const { data } = await supabase.from('security_post_logs').select('*').gte('time_in', start).lte('time_in', end).order('time_in', { ascending: false })
    setHistory(data || [])
  }

  async function startShift(e: React.FormEvent) {
    e.preventDefault()
    if (!form.post_name || !form.guard_name.trim()) { alert('Post and guard name are required'); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('security_post_logs').insert([{
      post_name: form.post_name, guard_name: form.guard_name.trim(), time_in: new Date().toISOString(),
      notes: form.notes || null, created_by: user?.email || null,
    }])
    if (error) { alert('Error: ' + error.message); return }
    setForm({ post_name: '', guard_name: '', notes: '' })
    load()
  }

  async function endShift(id: number) {
    const { error } = await supabase.from('security_post_logs').update({ time_out: new Date().toISOString() }).eq('id', id).is('time_out', null)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Radio className="w-7 h-7 text-blue-600" /> Post Logs</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6 mb-8">
        <form onSubmit={startShift} className="bg-white border rounded-xl shadow-sm p-6 space-y-3 h-fit">
          <h2 className="text-sm font-bold text-slate-700 mb-1">Start a Shift</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Guard Post</label>
            <select required value={form.post_name} onChange={e => setForm({ ...form, post_name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
              <option value="">Select a post...</option>
              {posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Guard Name</label>
            <input required value={form.guard_name} onChange={e => setForm({ ...form, guard_name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 mt-2">Start Shift</button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">Active Shifts ({active.length})</h2></div>
          <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
            {active.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{a.post_name} — {a.guard_name}</div>
                  <div className="text-xs text-gray-500">Since {new Date(a.time_in).toLocaleString()}</div>
                </div>
                <button onClick={() => endShift(a.id)} className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2.5 py-1.5 rounded-lg hover:bg-green-100 flex-shrink-0"><LogOut className="w-3.5 h-3.5" /> End Shift</button>
              </div>
            ))}
            {active.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">No active shifts.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-slate-700">History</h2>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Post</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Guard</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">In</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Out</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {history.map(h => (
              <tr key={h.id}>
                <td className="px-4 py-2 font-medium">{h.post_name}</td>
                <td className="px-4 py-2">{h.guard_name}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(h.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-4 py-2 text-gray-500">{h.time_out ? new Date(h.time_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : <span className="text-amber-600 font-medium">Active</span>}</td>
                <td className="px-4 py-2 text-gray-500">{h.notes || '-'}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No shifts recorded for this date.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
