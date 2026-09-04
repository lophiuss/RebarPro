'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Megaphone, Plus, X } from 'lucide-react'

type Department = 'rebar' | 'cement' | 'security'
type Shoutout = { id: number; to_name: string; message: string; from_name: string; created_at: string }

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// A small team-recognition feed, dropped into each department's landing
// page. Posting a shoutout is limited (in the UI, same nav-hiding
// convention used elsewhere in this app) to admin/manager in that
// department; everyone with department access can read the feed.
export default function ShoutoutBoard({ department }: { department: Department }) {
  const supabase = createClient()
  const [items, setItems] = useState<Shoutout[]>([])
  const [loading, setLoading] = useState(true)
  const [canPost, setCanPost] = useState(false)
  const [composing, setComposing] = useState(false)
  const [toName, setToName] = useState('')
  const [message, setMessage] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => { load() }, [department])

  async function load() {
    setLoading(true)
    const [{ data: { user } }, { data }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('shoutouts').select('id, to_name, message, from_name, created_at').eq('department', department).order('created_at', { ascending: false }).limit(15),
    ])
    setItems(data || [])
    if (user) {
      const { data: access } = await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', department).maybeSingle()
      setCanPost(access?.role === 'admin' || access?.role === 'manager')
    }
    setLoading(false)
  }

  async function post() {
    if (!toName.trim() || !message.trim()) { alert('Please fill in who this is for and the message'); return }
    setPosting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).maybeSingle()
      const { error } = await supabase.from('shoutouts').insert([{
        department, to_name: toName.trim(), message: message.trim(),
        from_name: profile?.full_name || user?.email || 'A teammate', from_user: user?.id || null,
      }])
      if (error) throw error
      setComposing(false)
      setToName(''); setMessage('')
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-8">
      <div className="px-5 py-3.5 border-b flex items-center justify-between bg-gradient-to-r from-amber-50 to-white">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Megaphone className="w-4 h-4 text-amber-500" /> Shoutouts</h2>
        {canPost && (
          <button onClick={() => setComposing(true)} className="flex items-center gap-1 text-xs font-semibold bg-amber-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-amber-600">
            <Plus className="w-3.5 h-3.5" /> Give a Shoutout
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
        {items.map(s => (
          <div key={s.id} className="px-5 py-3 text-sm">
            <div><span className="font-semibold text-slate-800">🎉 {s.to_name}</span> <span className="text-gray-600">— {s.message}</span></div>
            <div className="text-xs text-gray-400 mt-0.5">from {s.from_name} · {timeAgo(s.created_at)}</div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-gray-400">No shoutouts yet{canPost ? ' — be the first to recognize someone!' : '.'}</p>
        )}
      </div>

      {composing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2"><Megaphone className="w-5 h-5 text-amber-500" /> Give a Shoutout</h2>
              <button onClick={() => setComposing(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Who's this for?</label>
            <input value={toName} onChange={e => setToName(e.target.value)} placeholder="Name" className="w-full border rounded-md px-3 py-2 text-sm mb-3" autoFocus />
            <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="e.g. Great catch flagging that visitor yesterday!" className="w-full border rounded-md px-3 py-2 text-sm mb-4" rows={3} />
            <div className="flex justify-end gap-3">
              <button onClick={() => setComposing(false)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={post} disabled={posting} className="bg-amber-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-amber-600">
                {posting ? 'Posting...' : 'Post Shoutout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
