'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DoorClosed, DoorOpen, Plus, Trash2, X } from 'lucide-react'

type Gate = { id: number; name: string; pos_x: number; pos_y: number; status: 'locked' | 'open'; updated_at: string }
type Layout = { id: number; photo_drive_id: string | null; photo_url: string | null } | null

export default function GatesPage() {
  const supabase = createClient()
  const [gates, setGates] = useState<Gate[]>([])
  const [layout, setLayout] = useState<Layout>(null)
  const [isManager, setIsManager] = useState(false)
  const [editing, setEditing] = useState<Gate | null>(null)
  const [placing, setPlacing] = useState(false)
  const [newGateName, setNewGateName] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: gateRows }, { data: layoutRow }, { data: { user } }] = await Promise.all([
      supabase.from('security_gates').select('*').order('id'),
      supabase.from('security_layout').select('id, photo_drive_id, photo_url').order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.auth.getUser(),
    ])
    setGates(gateRows || [])
    setLayout(layoutRow)

    if (user) {
      const { data: access } = await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'security').maybeSingle()
      setIsManager(access?.role === 'admin' || access?.role === 'manager')
    }
  }

  async function toggleGate(gate: Gate) {
    const { data: { user } } = await supabase.auth.getUser()
    const newStatus = gate.status === 'locked' ? 'open' : 'locked'
    const { error } = await supabase.from('security_gates').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', gate.id)
    if (error) { alert('Error: ' + error.message); return }
    await supabase.from('security_gate_events').insert([{ gate_id: gate.id, gate_name: gate.name, action: newStatus, username: user?.email || null }])
    load()
  }

  function handleMapClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placing) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos_x = ((e.clientX - rect.left) / rect.width) * 100
    const pos_y = ((e.clientY - rect.top) / rect.height) * 100
    createGate(pos_x, pos_y)
  }

  async function createGate(pos_x: number, pos_y: number) {
    if (!newGateName.trim()) { alert('Enter a gate name first'); return }
    const { error } = await supabase.from('security_gates').insert([{ name: newGateName.trim(), pos_x, pos_y, status: 'locked', updated_at: new Date().toISOString() }])
    if (error) { alert('Error: ' + error.message); return }
    setNewGateName('')
    setPlacing(false)
    load()
  }

  async function saveGate() {
    if (!editing) return
    const { error } = await supabase.from('security_gates').update({ name: editing.name, pos_x: editing.pos_x, pos_y: editing.pos_y }).eq('id', editing.id)
    if (error) { alert('Error: ' + error.message); return }
    setEditing(null)
    load()
  }

  async function deleteGate(id: number) {
    if (!confirm('Delete this gate?')) return
    const { error } = await supabase.from('security_gates').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-bold flex items-center gap-2"><DoorClosed className="w-7 h-7 text-blue-600" /> Gates</h1>
        {isManager && (
          <div className="flex items-center gap-2">
            <input
              value={newGateName}
              onChange={e => setNewGateName(e.target.value)}
              placeholder="New gate name"
              className="border rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={() => setPlacing(p => !p)}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg ${placing ? 'bg-amber-100 text-amber-800' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              <Plus className="w-4 h-4" /> {placing ? 'Click the map to place it' : 'Add Gate'}
            </button>
          </div>
        )}
      </div>

      <div
        onClick={handleMapClick}
        className={`relative w-full aspect-video bg-gray-100 border rounded-xl overflow-hidden mb-6 ${placing ? 'cursor-crosshair' : ''}`}
      >
        {layout?.photo_url || (layout?.photo_drive_id && layout.photo_drive_id !== 'PENDING') ? (
          <img src={layout.photo_url || `/api/security/photo/${layout!.photo_drive_id}`} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">No site layout uploaded yet</div>
        )}
        {gates.map(g => (
          <button
            key={g.id}
            onClick={e => { e.stopPropagation(); if (!placing) toggleGate(g) }}
            title={`${g.name} — ${g.status}`}
            style={{ left: `${g.pos_x}%`, top: `${g.pos_y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 group`}
          >
            <span className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md ${g.status === 'locked' ? 'bg-red-500' : 'bg-green-500'}`}>
              {g.status === 'locked' ? <DoorClosed className="w-4 h-4 text-white" /> : <DoorOpen className="w-4 h-4 text-white" />}
            </span>
            <span className="text-[10px] font-semibold bg-white/90 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">{g.name}</span>
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gate</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gates.map(g => (
              <tr key={g.id}>
                <td className="px-4 py-2.5 font-medium">{g.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-bold uppercase rounded-full px-2.5 py-1 ${g.status === 'locked' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{g.status}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{new Date(g.updated_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => toggleGate(g)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">
                      {g.status === 'locked' ? 'Unlock' : 'Lock'}
                    </button>
                    {isManager && (
                      <>
                        <button onClick={() => setEditing(g)} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-100">Edit</button>
                        <button onClick={() => deleteGate(g.id)} className="text-red-500 hover:text-red-700 p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {gates.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No gates configured yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit Gate</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Position X (%)</label>
                <input type="number" value={editing.pos_x} onChange={e => setEditing({ ...editing, pos_x: Number(e.target.value) })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Position Y (%)</label>
                <input type="number" value={editing.pos_y} onChange={e => setEditing({ ...editing, pos_y: Number(e.target.value) })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={saveGate} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
