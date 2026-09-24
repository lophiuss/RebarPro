'use client'

import { useState, Fragment } from 'react'
import { Plus, Trash2, Folder, UserCheck, Tag, DollarSign, ArrowUp, ArrowDown, ShieldAlert } from 'lucide-react'
import {
  createProject, updateProject, deleteProject,
  createProjectType, renameProjectType, deleteProjectType,
  createSupervisor, updateSupervisor, deleteSupervisor,
  createPayColumn, updatePayColumn, deletePayColumn, reorderPayColumns, applyMultiplierPayColumnToAllWorkers,
} from '../actions'

type Project = { id: number; name: string; type_id: number | null; status: string }
type ProjectType = { id: number; name: string }
type Supervisor = { id: number; name: string; status: string }
type PayColumn = {
  id: number; key: string; label: string; type: 'ADD' | 'DEDUCT'; sort_order: number
  include_in_gross: boolean; include_in_net_deduct: boolean
  compute_mode: 'MANUAL' | 'MULTIPLIER'; multiplier_percent: number | null
}
type PayColumnBase = { column_id: number; base_column_id: number }

async function guard(fn: () => Promise<any>) {
  try { await fn() } catch (err: any) { alert('Error: ' + err.message) }
}

export default function ConfigClient({ projects, projectTypes, supervisors, payColumns, payColumnBases }: {
  projects: Project[]; projectTypes: ProjectType[]; supervisors: Supervisor[]; payColumns: PayColumn[]; payColumnBases: PayColumnBase[]
}) {
  const [newProject, setNewProject] = useState('')
  const [newType, setNewType] = useState('')
  const [newSupervisor, setNewSupervisor] = useState('')
  const [newPayLabel, setNewPayLabel] = useState('')
  const [newPayType, setNewPayType] = useState<'ADD' | 'DEDUCT'>('ADD')
  const [newPayIsMultiplier, setNewPayIsMultiplier] = useState(false)
  const [newPayMultiplierPercent, setNewPayMultiplierPercent] = useState('11')
  const [newPayBaseIds, setNewPayBaseIds] = useState<number[]>([])
  const [showArchivedProjects, setShowArchivedProjects] = useState(false)
  const [showArchivedSupervisors, setShowArchivedSupervisors] = useState(false)
  const [applying, setApplying] = useState<number | null>(null)

  const basesOf = (colId: number) => payColumnBases.filter(b => b.column_id === colId).map(b => b.base_column_id)

  function movePayColumn(index: number, direction: 'up' | 'down') {
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= payColumns.length) return
    const order = payColumns.map(c => c.id)
    ;[order[index], order[nextIndex]] = [order[nextIndex], order[index]]
    guard(() => reorderPayColumns(order))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Projects */}
      <div className="bg-white border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2 text-indigo-700"><Folder className="w-5 h-5" /> Manage Projects</h3>
          <button onClick={() => setShowArchivedProjects(v => !v)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">
            {showArchivedProjects ? 'Hide Archive' : 'Show Archive'}
          </button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (!newProject.trim()) return; guard(() => createProject(newProject.trim(), projectTypes[0]?.id ?? null)); setNewProject('') }}
          className="flex gap-2 mb-4">
          <input value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="New Project Name" required className="flex-1 border rounded-md px-3 py-2 text-sm" />
          <button type="submit" className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Add</button>
        </form>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Name</th><th className="pb-2">Type</th><th className="pb-2">Status</th><th className="pb-2 text-right">Actions</th></tr></thead>
          <tbody>
            {projects.filter(p => showArchivedProjects || p.status === 'Active').map(p => (
              <tr key={p.id} className={`border-b border-gray-100 ${p.status === 'Inactive' ? 'opacity-50' : ''}`}>
                <td className="py-2"><input defaultValue={p.name} onBlur={e => e.target.value.trim() && e.target.value !== p.name && guard(() => updateProject(p.id, { name: e.target.value.trim() }))} className="border rounded px-2 py-1 w-full" /></td>
                <td className="py-2">
                  <select value={p.type_id ?? ''} onChange={e => guard(() => updateProject(p.id, { type_id: e.target.value ? Number(e.target.value) : null }))} className="border rounded px-2 py-1 bg-white">
                    <option value="">None</option>
                    {projectTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
                <td className="py-2">
                  <button onClick={() => guard(() => updateProject(p.id, { status: p.status === 'Active' ? 'Inactive' : 'Active' }))}
                    className={`text-xs font-bold px-2 py-1 rounded-full ${p.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{p.status}</button>
                </td>
                <td className="py-2 text-right">
                  <button onClick={() => confirm(`Delete project "${p.name}"? This will delete all allocations and claims for this project.`) && guard(() => deleteProject(p.id))} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {projects.length === 0 && <tr><td colSpan={4} className="text-gray-400 py-4">No projects added.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Project Types */}
      <div className="bg-white border rounded-xl shadow-sm p-5">
        <h3 className="font-bold flex items-center gap-2 text-amber-700 mb-4"><Tag className="w-5 h-5" /> Manage Project Types</h3>
        <form onSubmit={e => { e.preventDefault(); if (!newType.trim()) return; guard(() => createProjectType(newType.trim())); setNewType('') }} className="flex gap-2 mb-4">
          <input value={newType} onChange={e => setNewType(e.target.value)} placeholder="New Project Type (e.g. SBG)" required className="flex-1 border rounded-md px-3 py-2 text-sm" />
          <button type="submit" className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Add</button>
        </form>
        <table className="w-full text-sm">
          <tbody>
            {projectTypes.map(t => (
              <tr key={t.id} className="border-b border-gray-100">
                <td className="py-2"><input defaultValue={t.name} onBlur={e => e.target.value.trim() && e.target.value !== t.name && guard(() => renameProjectType(t.id, e.target.value.trim()))} className="border rounded px-2 py-1 w-full" /></td>
                <td className="py-2 text-right"><button onClick={() => confirm(`Delete project type "${t.name}"?`) && guard(() => deleteProjectType(t.id))} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
            {projectTypes.length === 0 && <tr><td className="text-gray-400 py-4">No types defined.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Supervisors */}
      <div className="bg-white border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2 text-green-700"><UserCheck className="w-5 h-5" /> Manage Supervisors</h3>
          <button onClick={() => setShowArchivedSupervisors(v => !v)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">
            {showArchivedSupervisors ? 'Hide Archive' : 'Show Archive'}
          </button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (!newSupervisor.trim()) return; guard(() => createSupervisor(newSupervisor.trim())); setNewSupervisor('') }} className="flex gap-2 mb-4">
          <input value={newSupervisor} onChange={e => setNewSupervisor(e.target.value)} placeholder="New Supervisor Name" required className="flex-1 border rounded-md px-3 py-2 text-sm" />
          <button type="submit" className="flex items-center gap-1 bg-green-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-green-700"><Plus className="w-4 h-4" /> Add</button>
        </form>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Name</th><th className="pb-2">Status</th><th className="pb-2 text-right">Actions</th></tr></thead>
          <tbody>
            {supervisors.filter(s => showArchivedSupervisors || s.status === 'Active').map(s => (
              <tr key={s.id} className={`border-b border-gray-100 ${s.status === 'Inactive' ? 'opacity-50' : ''}`}>
                <td className="py-2"><input defaultValue={s.name} onBlur={e => e.target.value.trim() && e.target.value !== s.name && guard(() => updateSupervisor(s.id, { name: e.target.value.trim() }))} className="border rounded px-2 py-1 w-full" /></td>
                <td className="py-2">
                  <button onClick={() => guard(() => updateSupervisor(s.id, { status: s.status === 'Active' ? 'Inactive' : 'Active' }))}
                    className={`text-xs font-bold px-2 py-1 rounded-full ${s.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{s.status}</button>
                </td>
                <td className="py-2 text-right"><button onClick={() => confirm(`Delete supervisor "${s.name}"?`) && guard(() => deleteSupervisor(s.id))} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
            {supervisors.length === 0 && <tr><td colSpan={3} className="text-gray-400 py-4">No supervisors added.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Pay Columns */}
      <div className="bg-white border rounded-xl shadow-sm p-5">
        <h3 className="font-bold flex items-center gap-2 text-indigo-700 mb-4"><DollarSign className="w-5 h-5" /> Manage Pay Sheet Columns</h3>
        <form onSubmit={e => {
          e.preventDefault()
          if (!newPayLabel.trim()) return
          guard(() => createPayColumn({
            label: newPayLabel.trim(), type: newPayType,
            computeMode: newPayIsMultiplier ? 'MULTIPLIER' : 'MANUAL',
            multiplierPercent: newPayIsMultiplier ? (Number(newPayMultiplierPercent) || 0) : undefined,
            baseColumnIds: newPayIsMultiplier ? newPayBaseIds : undefined,
          }))
          setNewPayLabel(''); setNewPayIsMultiplier(false); setNewPayMultiplierPercent('11'); setNewPayBaseIds([])
        }} className="mb-4">
          <div className="flex flex-wrap gap-2">
            <input value={newPayLabel} onChange={e => setNewPayLabel(e.target.value)} placeholder="Column Label (e.g. Allowance)" required className="flex-1 min-w-[160px] border rounded-md px-3 py-2 text-sm" />
            <select value={newPayType} onChange={e => setNewPayType(e.target.value as 'ADD' | 'DEDUCT')} className="border rounded-md px-3 py-2 text-sm bg-white w-32">
              <option value="ADD">Addition</option><option value="DEDUCT">Deduction</option>
            </select>
            <button type="submit" className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Add</button>
          </div>
          <label className="flex items-center gap-1.5 text-sm mt-2 cursor-pointer">
            <input type="checkbox" checked={newPayIsMultiplier} onChange={e => setNewPayIsMultiplier(e.target.checked)} /> Compute as % of other columns
          </label>
          {newPayIsMultiplier && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <input type="number" step="0.01" value={newPayMultiplierPercent} onChange={e => setNewPayMultiplierPercent(e.target.value)} className="w-20 border rounded px-2 py-1 text-sm" />
                <span className="text-sm">% of sum of:</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {payColumns.map(c => (
                  <label key={c.id} className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="checkbox" checked={newPayBaseIds.includes(c.id)} onChange={() => setNewPayBaseIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} /> {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </form>

        <table className="w-full text-sm mb-5">
          <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Order</th><th className="pb-2">Label</th><th className="pb-2">Type</th><th className="pb-2">Multiplier</th><th className="pb-2 text-right">Actions</th></tr></thead>
          <tbody>
            {payColumns.map((col, index) => {
              const isMultiplier = col.compute_mode === 'MULTIPLIER'
              const bases = basesOf(col.id)
              return (
                <Fragment key={col.id}>
                  <tr className={isMultiplier ? '' : 'border-b border-gray-100'}>
                    <td className="py-2 flex gap-0.5">
                      <button disabled={index === 0} onClick={() => movePayColumn(index, 'up')} className="text-gray-400 hover:text-indigo-600 disabled:opacity-30 p-0.5"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button disabled={index === payColumns.length - 1} onClick={() => movePayColumn(index, 'down')} className="text-gray-400 hover:text-indigo-600 disabled:opacity-30 p-0.5"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </td>
                    <td className="py-2"><input defaultValue={col.label} disabled={col.key === 'payrate'} onBlur={e => e.target.value.trim() && e.target.value !== col.label && guard(() => updatePayColumn(col.id, { label: e.target.value.trim() }))} className="border rounded px-2 py-1 w-full disabled:bg-gray-50" /></td>
                    <td className="py-2">
                      <select value={col.type} disabled={col.key === 'payrate'} onChange={e => guard(() => updatePayColumn(col.id, { type: e.target.value as 'ADD' | 'DEDUCT' }))} className="border rounded px-2 py-1 bg-white disabled:bg-gray-50">
                        <option value="ADD">Addition</option><option value="DEDUCT">Deduction</option>
                      </select>
                    </td>
                    <td className="py-2">
                      <label className={`flex items-center gap-1 text-xs ${col.key === 'payrate' ? 'text-gray-300' : 'cursor-pointer'}`}>
                        <input type="checkbox" checked={isMultiplier} disabled={col.key === 'payrate'} onChange={e => guard(() => updatePayColumn(col.id, { compute_mode: e.target.checked ? 'MULTIPLIER' : 'MANUAL' }))} /> % of columns
                      </label>
                    </td>
                    <td className="py-2 text-right"><button disabled={col.key === 'payrate'} onClick={() => confirm('Delete pay column? This will remove all values associated with this column for all workers.') && guard(() => deletePayColumn(col.id, col.key))} className="text-red-500 hover:text-red-700 disabled:opacity-30 p-1"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                  {isMultiplier && (
                    <tr className="border-b border-gray-100">
                      <td /><td colSpan={4} className="pb-3">
                        <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 rounded-lg border">
                          <input type="number" step="0.01" defaultValue={col.multiplier_percent ?? 0} onBlur={e => guard(() => updatePayColumn(col.id, { multiplier_percent: Number(e.target.value) || 0 }))} className="w-20 border rounded px-2 py-1 text-sm" />
                          <span className="text-xs">% of:</span>
                          {payColumns.filter(c => c.id !== col.id).map(c => (
                            <label key={c.id} className="flex items-center gap-1 text-xs cursor-pointer">
                              <input type="checkbox" checked={bases.includes(c.id)} onChange={() => {
                                const next = bases.includes(c.id) ? bases.filter(x => x !== c.id) : [...bases, c.id]
                                guard(() => updatePayColumn(col.id, { base_column_ids: next }))
                              }} /> {c.label}
                            </label>
                          ))}
                          <button disabled={applying === col.id} onClick={async () => {
                            if (!confirm(`Recompute "${col.label}" for ALL workers from its current % and base columns? This will overwrite any hand-edited values.`)) return
                            setApplying(col.id)
                            try { const n = await applyMultiplierPayColumnToAllWorkers(col.id); alert(`Applied to ${n} worker(s).`) } catch (err: any) { alert('Error: ' + err.message) } finally { setApplying(null) }
                          }} className="ml-auto text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50">
                            {applying === col.id ? 'Applying...' : 'Apply to all workers'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        <div className="border-t pt-4">
          <h4 className="flex items-center gap-1.5 font-bold text-indigo-700 mb-3"><ShieldAlert className="w-4 h-4" /> Payroll Formulas</h4>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1.5">Gross Pay Components:</label>
            <div className="flex flex-wrap gap-3">
              {payColumns.map(c => (
                <label key={c.id} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={c.include_in_gross} onChange={() => guard(() => updatePayColumn(c.id, { include_in_gross: !c.include_in_gross }))} /> {c.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">Net Pay Deductions:</label>
            <div className="flex flex-wrap gap-3">
              {payColumns.map(c => (
                <label key={c.id} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={c.include_in_net_deduct} onChange={() => guard(() => updatePayColumn(c.id, { include_in_net_deduct: !c.include_in_net_deduct }))} /> {c.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
