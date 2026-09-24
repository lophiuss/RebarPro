'use client'

import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { createMouldJob, completeMouldJob } from '../actions'

type Job = {
  id: number; job_no: string | null; job_type: string; cost_center: string; status: string
  started_on: string | null; completed_on: string | null
  added_steel_kg: number | null; material_cost_snapshot: number | null
  mould: { id: number; name: string } | null
  project: { name: string } | null
}
type Mould = { id: number; name: string; status: string }

const JOB_TYPE_LABEL: Record<string, string> = {
  fabrication: 'Fabrication', change: 'Change', maintenance: 'Maintenance', decommission: 'Decommission',
}
const STATUS_STYLE: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700', in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-gray-200 text-gray-500',
}

export default function JobsTable({ jobs, moulds }: { jobs: Job[]; moulds: Mould[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ mould_id: '', job_type: 'change', started_on: new Date().toISOString().slice(0, 10), notes: '' })
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState<Job | null>(null)
  const [completeForm, setCompleteForm] = useState({ completed_on: new Date().toISOString().slice(0, 10), added_steel_kg: '', scrap_weight_kg: '' })

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.mould_id) return
    setSaving(true)
    try {
      await createMouldJob({
        mould_id: Number(form.mould_id),
        job_type: form.job_type as any,
        started_on: form.started_on,
        notes: form.notes || undefined,
      })
      setForm({ mould_id: '', job_type: 'change', started_on: new Date().toISOString().slice(0, 10), notes: '' })
      setShowAdd(false)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function openComplete(job: Job) {
    setCompleting(job)
    setCompleteForm({ completed_on: new Date().toISOString().slice(0, 10), added_steel_kg: '', scrap_weight_kg: '' })
  }

  async function submitComplete() {
    if (!completing) return
    setSaving(true)
    try {
      await completeMouldJob(completing.id, {
        completed_on: completeForm.completed_on,
        added_steel_kg: completeForm.added_steel_kg ? Number(completeForm.added_steel_kg) : 0,
        scrap_weight_kg: completeForm.scrap_weight_kg ? Number(completeForm.scrap_weight_kg) : 0,
      })
      setCompleting(null)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700">
          <Plus className="w-4 h-4" /> New Job
        </button>
      </div>

      {showAdd && (
        <form onSubmit={add} className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mould</label>
            <select required value={form.mould_id} onChange={e => setForm({ ...form, mould_id: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-48">
              <option value="">Select...</option>
              {moulds.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Job Type</label>
            <select value={form.job_type} onChange={e => setForm({ ...form, job_type: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white">
              <option value="fabrication">Fabrication (new mould)</option>
              <option value="change">Change (modify existing)</option>
              <option value="maintenance">Maintenance</option>
              <option value="decommission">Decommission</option>
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Started</label><input type="date" value={form.started_on} onChange={e => setForm({ ...form, started_on: e.target.value })} className="border rounded-md px-3 py-2 text-sm" /></div>
          <div className="flex-1 min-w-[160px]"><label className="block text-xs font-medium text-gray-500 mb-1">Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
          <button type="submit" disabled={saving} className="bg-teal-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mould</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cost To</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Added Steel (kg)</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material Cost</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {jobs.map(j => (
              <tr key={j.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium whitespace-nowrap">{j.mould?.name || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{JOB_TYPE_LABEL[j.job_type] || j.job_type}</td>
                <td className="px-3 py-2 whitespace-nowrap">{j.cost_center === 'factory' ? <span className="text-gray-500">Factory</span> : (j.project?.name || '-')}</td>
                <td className="px-3 py-2 whitespace-nowrap"><span className={`text-[11px] font-bold uppercase rounded-full px-1.5 py-0.5 ${STATUS_STYLE[j.status] || 'bg-gray-100'}`}>{j.status.replace('_', ' ')}</span></td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">{j.started_on || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">{j.completed_on || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{j.added_steel_kg ?? '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{j.material_cost_snapshot != null ? `RM ${j.material_cost_snapshot.toFixed(2)}` : '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {j.status !== 'completed' && j.status !== 'cancelled' && (
                    <button onClick={() => openComplete(j)} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">
                      <Check className="w-3.5 h-3.5" /> Complete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No jobs yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {completing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold mb-1">Complete — {completing.mould?.name}</h2>
            <p className="text-xs text-gray-400 mb-4">{JOB_TYPE_LABEL[completing.job_type]}. Enter what the mould department weighed after the work was done.</p>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Completed on</label><input type="date" value={completeForm.completed_on} onChange={e => setCompleteForm({ ...completeForm, completed_on: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
              {completing.job_type !== 'decommission' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Added steel weight (kg)</label>
                  <input type="number" step="0.1" value={completeForm.added_steel_kg} onChange={e => setCompleteForm({ ...completeForm, added_steel_kg: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="0" />
                  <p className="text-xs text-gray-400 mt-1">0 if nothing was added — this is what determines whether it&apos;s costed as a modification.</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Scrap weight (kg)</label>
                  <input type="number" step="0.1" value={completeForm.scrap_weight_kg} onChange={e => setCompleteForm({ ...completeForm, scrap_weight_kg: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="0" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setCompleting(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={submitComplete} disabled={saving} className="bg-teal-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-700">{saving ? 'Saving...' : 'Complete Job'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
