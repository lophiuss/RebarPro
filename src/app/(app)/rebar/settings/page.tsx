'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { naturalSort } from '@/lib/utils/sort'

export default function SettingsPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [projectTypes, setProjectTypes] = useState<any[]>([])
  const [sizes, setSizes] = useState<any[]>([])
  const [globalSettings, setGlobalSettings] = useState<any>({ target_coverage_days: 14 })
  
  // Project Type Form
  const [newProjectTypeName, setNewProjectTypeName] = useState('')
  const [editingProjectTypeId, setEditingProjectTypeId] = useState<string | null>(null)
  const [editProjectTypeData, setEditProjectTypeData] = useState<any>({})

  // Project Form
  const [projectName, setProjectName] = useState('')
  const [projectTypeId, setProjectTypeId] = useState('')
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editProjectData, setEditProjectData] = useState<any>({})

  // Size Form
  const [sizeName, setSizeName] = useState('')
  const [sizeUnit, setSizeUnit] = useState('Tons')
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null)
  const [editSizeData, setEditSizeData] = useState<any>({})

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const [projRes, pTypesRes, sizeRes, settingsRes] = await Promise.all([
      supabase.from('projects').select('*, project_types(name)').order('created_at', { ascending: false }),
      supabase.from('project_types').select('*').order('name'),
      supabase.from('rebar_sizes').select('*').order('size'),
      supabase.from('global_settings').select('*').eq('id', 1).single()
    ])
    if (pTypesRes.data) {
      const sortedPT = naturalSort(pTypesRes.data, pt => pt.name)
      setProjectTypes(sortedPT)
      if (sortedPT.length > 0 && !projectTypeId) setProjectTypeId(sortedPT[0].id)
    }
    if (projRes.data) setProjects(naturalSort(projRes.data, p => p.name))
    if (sizeRes.data) setSizes(naturalSort(sizeRes.data, s => s.size))
    if (settingsRes.data) setGlobalSettings(settingsRes.data)
  }

  // Project Types
  async function addProjectType(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('project_types').insert([{ name: newProjectTypeName }])
    if (!error) {
      setNewProjectTypeName('')
      fetchData()
    } else {
      alert('Error adding project type: ' + error.message)
    }
  }

  async function saveProjectTypeEdit(pt: any) {
    const { error } = await supabase.from('project_types').update({ name: editProjectTypeData.name }).eq('id', pt.id)
    if (!error) {
      setEditingProjectTypeId(null)
      fetchData()
    } else {
      alert('Error: ' + error.message)
    }
  }

  async function deleteProjectType(pt: any) {
    if (!confirm(`Delete project type "${pt.name}"? This might fail if projects are still assigned to it.`)) return
    const { error } = await supabase.from('project_types').delete().eq('id', pt.id)
    if (!error) {
      fetchData()
    } else {
      alert('Error: ' + error.message)
    }
  }

  // Projects
  async function addProject(e: React.FormEvent) {
    e.preventDefault()
    // Find the type string to keep backward compat in DB for a bit if needed, but we rely on project_type_id
    const typeObj = projectTypes.find(t => t.id === projectTypeId)
    const { error } = await supabase.from('projects').insert([{ name: projectName, type: typeObj?.name, project_type_id: projectTypeId }])
    if (!error) {
      setProjectName('')
      fetchData()
    } else {
      alert('Error adding project: ' + error.message)
    }
  }

  async function saveProjectEdit(p: any) {
    const typeObj = projectTypes.find(t => t.id === editProjectData.project_type_id)
    const { error } = await supabase.from('projects').update({ name: editProjectData.name, type: typeObj?.name, project_type_id: editProjectData.project_type_id }).eq('id', p.id)
    if (!error) {
      setEditingProjectId(null)
      fetchData()
    } else {
      alert('Error: ' + error.message)
    }
  }

  async function deleteProject(p: any) {
    if (!confirm(`Delete project "${p.name}"? This will delete all associated usage/suspended transactions.`)) return
    const { error } = await supabase.from('projects').delete().eq('id', p.id)
    if (!error) {
      fetchData()
    } else {
      alert('Error: ' + error.message)
    }
  }

  // Rebar Sizes
  async function addSize(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('rebar_sizes').insert([{ size: sizeName, unit: sizeUnit }])
    if (!error) {
      setSizeName('')
      fetchData()
    } else {
      alert('Error adding size: ' + error.message)
    }
  }

  async function saveSizeEdit(s: any) {
    const { error } = await supabase.from('rebar_sizes').update({ 
      size: editSizeData.size, 
      unit: editSizeData.unit,
      target_daily_usage: parseFloat(editSizeData.target_daily_usage) || 0
    }).eq('id', s.id)
    if (!error) {
      setEditingSizeId(null)
      fetchData()
    } else {
      alert('Error: ' + error.message)
    }
  }

  async function deleteSize(s: any) {
    if (!confirm(`Delete size "${s.size}"?`)) return
    await supabase.from('rebar_sizes').delete().eq('id', s.id)
    fetchData()
  }

  // Global Settings
  async function saveGlobalSettings(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('global_settings').update({
      target_coverage_days: globalSettings.target_coverage_days,
      default_unit: globalSettings.default_unit || 'kg'
    }).eq('id', 1)
    if (!error) {
      alert("Settings saved!")
    } else {
      alert('Error: ' + error.message)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-20">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      {/* Global Settings */}
      <div className="mb-12">
        <h2 className="text-xl font-bold mb-4">Global Preferences</h2>
        <form onSubmit={saveGlobalSettings} className="border p-4 rounded-xl bg-white shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Target Coverage (Days)</label>
              <input 
                type="number"
                required 
                value={globalSettings.target_coverage_days} 
                onChange={(e) => setGlobalSettings({...globalSettings, target_coverage_days: Number(e.target.value)})}
                className="w-full border rounded-md px-3 py-2" 
                min={1}
              />
              <p className="text-xs text-gray-500 mt-1">Used to calculate "Require Order" on the Dashboard.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Default Unit</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGlobalSettings({...globalSettings, default_unit: 'kg'})}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition ${
                    (globalSettings.default_unit || 'kg') === 'kg'
                      ? 'bg-blue-600 text-white border-blue-600 shadow'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  kg
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalSettings({...globalSettings, default_unit: 'ton'})}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition ${
                    globalSettings.default_unit === 'ton'
                      ? 'bg-blue-600 text-white border-blue-600 shadow'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  ton
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">All quantities across the system will display in this unit.</p>
            </div>
          </div>
          <div className="pt-2">
            <Button type="submit">Save Settings</Button>
          </div>
        </form>
      </div>

      {/* Project Types */}
      <div className="mb-12">
        <h2 className="text-xl font-bold mb-4">Manage Project Types</h2>
        <form onSubmit={addProjectType} className="flex gap-4 mb-4 items-end border p-4 rounded-xl bg-white shadow-sm">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Project Type Name</label>
            <input 
              required 
              value={newProjectTypeName} 
              onChange={(e) => setNewProjectTypeName(e.target.value)}
              className="w-full border rounded-md px-3 py-2" 
              placeholder="e.g. Bridge"
            />
          </div>
          <Button type="submit">Add</Button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {projectTypes.map((pt) => (
                <tr key={pt.id}>
                  {editingProjectTypeId === pt.id ? (
                    <>
                      <td className="px-6 py-2"><input type="text" value={editProjectTypeData.name} onChange={e => setEditProjectTypeData({...editProjectTypeData, name: e.target.value})} className="border rounded px-2 py-1 w-full" /></td>
                      <td className="px-6 py-2 flex gap-1">
                        <button onClick={() => saveProjectTypeEdit(pt)} className="text-green-600 hover:text-green-800 p-1"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingProjectTypeId(null)} className="text-gray-500 hover:text-gray-700 p-1"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-3 font-medium">{pt.name}</td>
                      <td className="px-6 py-3 flex gap-1">
                        <button onClick={() => { setEditingProjectTypeId(pt.id); setEditProjectTypeData({name: pt.name}) }} className="text-blue-600 hover:text-blue-800 p-1"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteProjectType(pt)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Projects */}
      <div className="mb-12">
        <h2 className="text-xl font-bold mb-4">Manage Projects</h2>
        <form onSubmit={addProject} className="flex gap-4 mb-4 items-end border p-4 rounded-xl bg-white shadow-sm">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Project Name</label>
            <input 
              required 
              value={projectName} 
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full border rounded-md px-3 py-2" 
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Project Type</label>
            <select 
              value={projectTypeId} 
              onChange={(e) => setProjectTypeId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 bg-white"
            >
              {projectTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
            </select>
          </div>
          <Button type="submit">Add</Button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {projects.map((p) => (
                <tr key={p.id}>
                  {editingProjectId === p.id ? (
                    <>
                      <td className="px-6 py-2"><input type="text" value={editProjectData.name} onChange={e => setEditProjectData({...editProjectData, name: e.target.value})} className="border rounded px-2 py-1 w-full" /></td>
                      <td className="px-6 py-2">
                        <select value={editProjectData.project_type_id} onChange={e => setEditProjectData({...editProjectData, project_type_id: e.target.value})} className="border rounded px-2 py-1 w-full bg-white">
                          {projectTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                        </select>
                      </td>
                      <td className="px-6 py-2 flex gap-1">
                        <button onClick={() => saveProjectEdit(p)} className="text-green-600 hover:text-green-800 p-1"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingProjectId(null)} className="text-gray-500 hover:text-gray-700 p-1"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-3 font-medium">{p.name}</td>
                      <td className="px-6 py-3">{p.project_types?.name || p.type}</td>
                      <td className="px-6 py-3 flex gap-1">
                        <button onClick={() => { setEditingProjectId(p.id); setEditProjectData({name: p.name, project_type_id: p.project_type_id}) }} className="text-blue-600 hover:text-blue-800 p-1"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteProject(p)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rebar Sizes */}
      <div className="mb-12">
        <h2 className="text-xl font-bold mb-4">Manage Rebar Sizes</h2>
        <form onSubmit={addSize} className="flex gap-4 mb-4 items-end border p-4 rounded-xl bg-white shadow-sm">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Rebar Name (Size)</label>
            <input 
              required 
              value={sizeName} 
              onChange={(e) => setSizeName(e.target.value)}
              className="w-full border rounded-md px-3 py-2" 
              placeholder="e.g. H16"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Unit</label>
            <select 
              value={sizeUnit} 
              onChange={(e) => setSizeUnit(e.target.value)}
              className="w-full border rounded-md px-3 py-2 bg-white"
            >
              <option>Tons</option>
              <option>Kg</option>
              <option>m2</option>
              <option>Pieces</option>
            </select>
          </div>
          <Button type="submit">Add</Button>
        </form>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target Daily Usage</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sizes.map((s) => (
                <tr key={s.id}>
                  {editingSizeId === s.id ? (
                    <>
                      <td className="px-6 py-2"><input type="text" value={editSizeData.size} onChange={e => setEditSizeData({...editSizeData, size: e.target.value})} className="border rounded px-2 py-1 w-full" /></td>
                      <td className="px-6 py-2">
                        <select value={editSizeData.unit} onChange={e => setEditSizeData({...editSizeData, unit: e.target.value})} className="border rounded px-2 py-1 w-full bg-white">
                          <option>Tons</option>
                          <option>Kg</option>
                          <option>m2</option>
                          <option>Pieces</option>
                        </select>
                      </td>
                      <td className="px-6 py-2"><input type="number" step="0.01" value={editSizeData.target_daily_usage} onChange={e => setEditSizeData({...editSizeData, target_daily_usage: e.target.value})} className="border rounded px-2 py-1 w-24" placeholder="0.00" /></td>
                      <td className="px-6 py-2 flex gap-1">
                        <button onClick={() => saveSizeEdit(s)} className="text-green-600 hover:text-green-800 p-1"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingSizeId(null)} className="text-gray-500 hover:text-gray-700 p-1"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-3 font-medium">{s.size}</td>
                      <td className="px-6 py-3">{s.unit || 'Tons'}</td>
                      <td className="px-6 py-3 text-slate-600">{s.target_daily_usage > 0 ? `${Number(s.target_daily_usage).toFixed(2)} T/day` : <span className="text-gray-400 italic">Not set</span>}</td>
                      <td className="px-6 py-3 flex gap-1">
                        <button onClick={() => { setEditingSizeId(s.id); setEditSizeData({size: s.size, unit: s.unit || 'Tons', target_daily_usage: s.target_daily_usage || 0}) }} className="text-blue-600 hover:text-blue-800 p-1"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteSize(s)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
