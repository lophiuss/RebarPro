'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Plus, X, CheckCircle2 } from 'lucide-react'

type Equipment = { id: number; name: string }
type Issue = {
  id: number; equipment_id: number | null; equipment_label: string | null
  issue: string; lead_time_note: string | null; status: string; created_at: string
  maintenance_equipment: { name: string } | null
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function CriticalIssuesPage() {
  const supabase = createClient()
  const [issues, setIssues] = useState<Issue[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ equipmentId: '', equipmentLabel: '', issue: '', leadTimeNote: '' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: iss }, { data: eq }] = await Promise.all([
      supabase.from('maintenance_critical_issues').select('*, maintenance_equipment(name)').order('created_at', { ascending: false }),
      supabase.from('maintenance_equipment').select('id, name').eq('is_active', true).order('name'),
    ])
    setIssues((iss as any) || [])
    setEquipment(eq || [])
    setLoading(false)
  }

  async function addIssue() {
    if (!form.issue.trim()) { alert('Please describe the issue'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('maintenance_critical_issues').insert([{
        equipment_id: form.equipmentId ? Number(form.equipmentId) : null,
        equipment_label: form.equipmentId ? null : (form.equipmentLabel.trim() || null),
        issue: form.issue.trim(),
        lead_time_note: form.leadTimeNote.trim() || null,
        status: 'open',
      }])
      if (error) throw error
      setShowAdd(false)
      setForm({ equipmentId: '', equipmentLabel: '', issue: '', leadTimeNote: '' })
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id: number, status: string) {
    const patch: any = { status }
    if (status === 'completed') patch.resolved_at = new Date().toISOString()
    const { error } = await supabase.from('maintenance_critical_issues').update(patch).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><AlertTriangle className="w-7 h-7 text-red-500" /> Critical Issues</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-700">
          <Plus className="w-4 h-4" /> Report Issue
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {issues.map(i => (
              <tr key={i.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{i.maintenance_equipment?.name || i.equipment_label || '-'}</td>
                <td className="px-4 py-3 text-sm">{i.issue}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{i.lead_time_note || '-'}</td>
                <td className="px-4 py-3">
                  <select value={i.status} onChange={e => updateStatus(i.id, e.target.value)} className={`text-xs font-bold uppercase rounded-full px-2 py-1 border-0 ${STATUS_STYLE[i.status]}`}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  {i.status !== 'completed' && (
                    <button onClick={() => updateStatus(i.id, 'completed')} className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900"><CheckCircle2 className="w-3.5 h-3.5" /> Resolve</button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && issues.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No critical issues logged.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Report Critical Issue</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Equipment</label>
            <select value={form.equipmentId} onChange={e => setForm({ ...form, equipmentId: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white mb-3">
              <option value="">(Type name instead)</option>
              {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
            </select>
            {!form.equipmentId && (
              <input value={form.equipmentLabel} onChange={e => setForm({ ...form, equipmentLabel: e.target.value })} placeholder="Equipment name (free text)" className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
            )}
            <label className="block text-xs font-medium text-gray-500 mb-1">Issue</label>
            <textarea value={form.issue} onChange={e => setForm({ ...form, issue: e.target.value })} rows={3} className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
            <label className="block text-xs font-medium text-gray-500 mb-1">Lead Time / Note</label>
            <input value={form.leadTimeNote} onChange={e => setForm({ ...form, leadTimeNote: e.target.value })} placeholder="e.g. TBA, 6th Sept" className="w-full border rounded-md px-3 py-2 text-sm mb-4" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAdd(false)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={addIssue} disabled={saving} className="bg-red-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
