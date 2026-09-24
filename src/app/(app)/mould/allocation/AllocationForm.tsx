'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Lock } from 'lucide-react'
import { addTimeEntry, deleteTimeEntry } from '../actions'

type Worker = { id: number; worker_no: string | null; name: string }
type Activity = { code: string; label: string; cost_target: 'mould' | 'project' | 'factory' }
type Job = { id: number; job_type: string; mould: { name: string } | null }
type Project = { id: number; name: string }
type Entry = {
  id: number; worker_id: number; hours: number; activity_code: string; cost_target: string; labour_cost: number
  worker: { name: string } | null
  job: { mould: { name: string } | null } | null
  project: { name: string } | null
}

export default function AllocationForm({ workDate, workers, activities, openJobs, projects, entries, isLocked }: {
  workDate: string; workers: Worker[]; activities: Activity[]; openJobs: Job[]; projects: Project[]; entries: Entry[]; isLocked: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState({ worker_id: '', activity_code: '', job_id: '', project_id: '', hours: '8' })
  const [saving, setSaving] = useState(false)

  const activity = activities.find(a => a.code === form.activity_code)

  function changeDate(d: string) {
    router.push(`/mould/allocation?date=${d}`)
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.worker_id || !form.activity_code || !form.hours) return
    setSaving(true)
    try {
      await addTimeEntry({
        work_date: workDate,
        worker_id: Number(form.worker_id),
        hours: Number(form.hours),
        activity_code: form.activity_code,
        job_id: form.job_id ? Number(form.job_id) : null,
        project_id: form.project_id ? Number(form.project_id) : null,
      })
      setForm({ worker_id: form.worker_id, activity_code: '', job_id: '', project_id: '', hours: '8' })
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    try {
      await deleteTimeEntry(id)
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  const dayTotal = entries.reduce((s, e) => s + e.hours, 0)

  return (
    <>
      <div className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex items-center gap-3">
        <label className="text-xs font-medium text-gray-500">Date</label>
        <input type="date" value={workDate} onChange={e => changeDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
        {isLocked && (
          <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
            <Lock className="w-3 h-3" /> Month locked
          </span>
        )}
        <span className="ml-auto text-sm text-gray-500">Day total: <strong>{dayTotal}h</strong></span>
      </div>

      {!isLocked && (
        <form onSubmit={add} className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Worker</label>
            <select required value={form.worker_id} onChange={e => setForm({ ...form, worker_id: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-44">
              <option value="">Select...</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.worker_no ? `${w.worker_no} - ` : ''}{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Activity</label>
            <select required value={form.activity_code} onChange={e => setForm({ ...form, activity_code: e.target.value, job_id: '', project_id: '' })} className="border rounded-md px-3 py-2 text-sm bg-white w-56">
              <option value="">Select...</option>
              {activities.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
            </select>
          </div>
          {activity?.cost_target === 'mould' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Mould Job</label>
              <select required value={form.job_id} onChange={e => setForm({ ...form, job_id: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-52">
                <option value="">Select...</option>
                {openJobs.map(j => <option key={j.id} value={j.id}>{j.mould?.name} — {j.job_type}</option>)}
              </select>
            </div>
          )}
          {activity?.cost_target === 'project' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
              <select required value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-52">
                <option value="">Select...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Hours</label><input required type="number" step="0.5" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-24" /></div>
          <button type="submit" disabled={saving} className="bg-teal-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700">{saving ? 'Saving...' : 'Add'}</button>
        </form>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Charged To</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cost (provisional)</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium whitespace-nowrap">{e.worker?.name || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{activities.find(a => a.code === e.activity_code)?.label || e.activity_code}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {e.cost_target === 'mould' ? (e.job?.mould?.name || '-') : e.cost_target === 'project' ? (e.project?.name || '-') : <span className="text-gray-500">Factory</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{e.hours}</td>
                <td className="px-3 py-2 whitespace-nowrap">RM {e.labour_cost.toFixed(2)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {!isLocked && <button onClick={() => remove(e.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>}
                </td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No hours logged for this day yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
