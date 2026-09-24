'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { createMouldAsset, updateMouldAssetStatus, reassignMouldProject } from '../actions'

type Asset = {
  id: number; mould_code: string | null; name: string
  mould_type: 'project_bound' | 'common'; status: string
  product_weight_kg: number | null; steel_weight_kg: number
  owning_project_id: number | null; current_project_id: number | null
  owning: { name: string } | null; current: { name: string } | null
}
type Project = { id: number; name: string }

const STATUS_STYLE: Record<string, string> = {
  fabricating: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  parked: 'bg-gray-200 text-gray-600',
  eol: 'bg-red-100 text-red-700',
}

export default function AssetsTable({ assets, projects }: { assets: Asset[]; projects: Project[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ mould_code: '', name: '', mould_type: 'project_bound', owning_project_id: '', product_weight_kg: '' })
  const [saving, setSaving] = useState(false)
  const [reassigning, setReassigning] = useState<number | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await createMouldAsset({
        mould_code: form.mould_code || undefined,
        name: form.name.trim(),
        mould_type: form.mould_type as 'project_bound' | 'common',
        owning_project_id: form.owning_project_id ? Number(form.owning_project_id) : null,
        product_weight_kg: form.product_weight_kg ? Number(form.product_weight_kg) : null,
      })
      setForm({ mould_code: '', name: '', mould_type: 'project_bound', owning_project_id: '', product_weight_kg: '' })
      setShowAdd(false)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(id: number, status: string) {
    try {
      await updateMouldAssetStatus(id, status as any)
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  async function reassign(id: number, projectId: string) {
    if (!projectId) return
    try {
      await reassignMouldProject(id, Number(projectId))
      setReassigning(null)
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700">
          <Plus className="w-4 h-4" /> New Mould
        </button>
      </div>

      {showAdd && (
        <form onSubmit={add} className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Name</label><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-48" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Code</label><input value={form.mould_code} onChange={e => setForm({ ...form, mould_code: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-28" /></div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select value={form.mould_type} onChange={e => setForm({ ...form, mould_type: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white">
              <option value="project_bound">Project-Bound</option>
              <option value="common">Common</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Owning Project</label>
            <select value={form.owning_project_id} onChange={e => setForm({ ...form, owning_project_id: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-44">
              <option value="">- Factory -</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Product weight (kg)</label><input type="number" step="0.1" value={form.product_weight_kg} onChange={e => setForm({ ...form, product_weight_kg: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-32" /></div>
          <button type="submit" disabled={saving} className="bg-teal-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700">{saving ? 'Saving...' : 'Add'}</button>
        </form>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Owning Project</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Current Project</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product wt (kg)</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Steel wt (kg)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {assets.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{a.mould_code || '-'}</td>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{a.name}</td>
                <td className="px-3 py-2 whitespace-nowrap">{a.mould_type === 'project_bound' ? 'Project-Bound' : 'Common'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <select value={a.status} onChange={e => changeStatus(a.id, e.target.value)}
                    className={`text-[11px] font-bold uppercase rounded-full px-1.5 py-0.5 border-0 ${STATUS_STYLE[a.status] || 'bg-gray-100'}`}>
                    <option value="fabricating">Fabricating</option>
                    <option value="active">Active</option>
                    <option value="parked">Parked</option>
                    <option value="eol">EOL</option>
                  </select>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{a.owning?.name || <span className="text-gray-400">Factory</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {reassigning === a.id ? (
                    <select autoFocus defaultValue="" onChange={e => reassign(a.id, e.target.value)} onBlur={() => setReassigning(null)} className="border rounded px-2 py-1 text-xs bg-white">
                      <option value="" disabled>Pick project...</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <button onClick={() => setReassigning(a.id)} className="text-left hover:underline">
                      {a.current?.name || <span className="text-gray-400">Factory (unassigned)</span>}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{a.product_weight_kg ?? '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{a.steel_weight_kg}</td>
              </tr>
            ))}
            {assets.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No moulds yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">Click a mould&apos;s Current Project to reassign it (e.g. a Common mould moving between projects — the receiving project pays for its next change/maintenance job).</p>
    </>
  )
}
