'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settings as SettingsIcon, Plus, Trash2, Pencil, Check, X, Download, Upload, Copy } from 'lucide-react'
import PublicJobRequestLink from '../PublicJobRequestLink'

type Equipment = {
  id: number; equip_code: string | null; name: string; category: string | null; brand: string | null
  location: string | null; condition: string | null; manager: string | null; supervisor: string | null
  pic_day: string | null; pic_night: string | null; target_repair_hours: number | null
  pm_checklist_template_id: number | null
}
type Template = { id: number; name: string; scope: string; frequency: string | null; form_code: string | null }
type Item = { id: number; template_id: number; section_label: string | null; item_no: number | null; description: string; item_type: string }

const ITEM_TYPE_LABELS: Record<string, string> = {
  ok_fault: 'OK / Fault', yes_no: 'Yes / No', numeric: 'Numeric reading', text: 'Text / remark only',
}

export default function MaintenanceSettingsPage() {
  const supabase = createClient()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [expandedTemplate, setExpandedTemplate] = useState<number | null>(null)

  const [newEquip, setNewEquip] = useState({
    name: '', category: '', location: '', brand: '', condition: '', manager: '', supervisor: '',
    pic_day: '', pic_night: '', target_repair_hours: '', pm_checklist_template_id: '',
  })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<any>({})
  const [equipFilter, setEquipFilter] = useState({ q: '', category: '', location: '', condition: '' })

  const [managerEmail, setManagerEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  const [newTemplate, setNewTemplate] = useState({ name: '', scope: 'single_equipment', frequency: '', form_code: '' })
  const [newItem, setNewItem] = useState<Record<number, { section_label: string; description: string; item_type: string }>>({})
  const [duplicating, setDuplicating] = useState<number | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null)
  const [templateEditName, setTemplateEditName] = useState('')
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [itemEditData, setItemEditData] = useState({ section_label: '', description: '', item_type: 'ok_fault' })

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: eq }, { data: tmpl }, { data: it }, { data: settings }] = await Promise.all([
      supabase.from('maintenance_equipment').select('*').order('name'),
      supabase.from('maintenance_checklist_templates').select('*').order('name'),
      supabase.from('maintenance_checklist_items').select('*').order('item_no'),
      supabase.from('maintenance_settings').select('manager_email').eq('id', 1).maybeSingle(),
    ])
    setEquipment(eq || [])
    setTemplates(tmpl || [])
    setItems(it || [])
    setManagerEmail(settings?.manager_email || '')
  }

  async function saveManagerEmail() {
    setSavingEmail(true)
    try {
      const { error } = await supabase.from('maintenance_settings').update({ manager_email: managerEmail.trim() || null, updated_at: new Date().toISOString() }).eq('id', 1)
      if (error) throw error
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSavingEmail(false)
    }
  }

  // Auto-generates the next "E00001"-style code from the highest numeric
  // suffix currently in use (matches the format INVENTORY.xlsx's historical
  // migration used) — no more hand-typing a code that might collide.
  function nextEquipCode() {
    let max = 0
    for (const eq of equipment) {
      const m = /^E(\d+)$/.exec(eq.equip_code || '')
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `E${String(max + 1).padStart(5, '0')}`
  }

  async function addEquipment(e: React.FormEvent) {
    e.preventDefault()
    if (!newEquip.name.trim()) return
    const { error } = await supabase.from('maintenance_equipment').insert([{
      name: newEquip.name.trim(), equip_code: nextEquipCode(),
      category: newEquip.category || null, location: newEquip.location || null, brand: newEquip.brand || null,
      condition: newEquip.condition || null, manager: newEquip.manager || null, supervisor: newEquip.supervisor || null,
      pic_day: newEquip.pic_day || null, pic_night: newEquip.pic_night || null,
      target_repair_hours: newEquip.target_repair_hours ? Number(newEquip.target_repair_hours) : null,
      pm_checklist_template_id: newEquip.pm_checklist_template_id ? Number(newEquip.pm_checklist_template_id) : null,
    }])
    if (error) { alert('Error: ' + error.message); return }
    setNewEquip({ name: '', category: '', location: '', brand: '', condition: '', manager: '', supervisor: '', pic_day: '', pic_night: '', target_repair_hours: '', pm_checklist_template_id: '' })
    load()
  }

  function startEdit(eq: Equipment) {
    setEditingId(eq.id)
    setEditData({ ...eq })
  }

  async function saveEdit() {
    const { id, ...patch } = editData
    const { error } = await supabase.from('maintenance_equipment').update(patch).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    setEditingId(null)
    load()
  }

  async function deactivate(id: number) {
    if (!confirm('Deactivate this equipment? It will be hidden from active lists but not deleted.')) return
    const { error } = await supabase.from('maintenance_equipment').update({ is_active: false }).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  async function addTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTemplate.name.trim()) return
    const { error } = await supabase.from('maintenance_checklist_templates').insert([newTemplate])
    if (error) { alert('Error: ' + error.message); return }
    setNewTemplate({ name: '', scope: 'single_equipment', frequency: '', form_code: '' })
    load()
  }

  async function deleteTemplate(id: number) {
    if (!confirm('Delete this checklist template and all its items?')) return
    const { error } = await supabase.from('maintenance_checklist_templates').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  // Export/import a template + its items as one JSON file — lets a template
  // built here be handed to another AlphaVision install, or kept as a
  // backup before editing it heavily.
  function exportTemplate(t: Template) {
    const tItems = items.filter(i => i.template_id === t.id).sort((a, b) => (a.item_no ?? 0) - (b.item_no ?? 0))
    const payload = {
      name: t.name, scope: t.scope, frequency: t.frequency, form_code: t.form_code,
      items: tItems.map(i => ({ section_label: i.section_label, item_no: i.item_no, description: i.description, item_type: i.item_type })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${t.name.replace(/[^A-Za-z0-9]+/g, '-')}.json`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const [importingTemplate, setImportingTemplate] = useState(false)

  async function importTemplateFile(file: File) {
    setImportingTemplate(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!parsed?.name || !Array.isArray(parsed.items)) throw new Error('Not a valid checklist template file')
      let name = String(parsed.name)
      if (templates.some(t => t.name === name)) name = `${name} (imported)`
      const scope = parsed.scope === 'section_list' ? 'section_list' : 'single_equipment'

      const { data: tmpl, error: tErr } = await supabase.from('maintenance_checklist_templates').insert([{
        name, scope, frequency: parsed.frequency || null, form_code: parsed.form_code || null,
      }]).select('id').single()
      if (tErr) throw tErr

      const rows = parsed.items.map((it: any, idx: number) => ({
        template_id: tmpl.id, section_label: it.section_label || null,
        item_no: Number.isFinite(it.item_no) ? it.item_no : idx + 1,
        description: String(it.description || ''),
        item_type: ['ok_fault', 'yes_no', 'numeric', 'text'].includes(it.item_type) ? it.item_type : 'ok_fault',
      })).filter((r: any) => r.description.trim())
      if (rows.length > 0) {
        const { error: iErr } = await supabase.from('maintenance_checklist_items').insert(rows)
        if (iErr) throw iErr
      }
      await load()
      alert(`Imported "${name}" with ${rows.length} items.`)
    } catch (err: any) {
      alert('Import failed: ' + err.message)
    } finally {
      setImportingTemplate(false)
    }
  }

  // "May refer existing checklist" — clone a template (and all its items)
  // as a starting point for a new one, rather than authoring from scratch
  // or having to export/re-import JSON just to reuse a similar checklist.
  async function duplicateTemplate(t: Template) {
    setDuplicating(t.id)
    try {
      let name = `${t.name} (Copy)`
      let n = 2
      while (templates.some(existing => existing.name === name)) { name = `${t.name} (Copy ${n})`; n++ }
      const { data: tmpl, error: tErr } = await supabase.from('maintenance_checklist_templates').insert([{
        name, scope: t.scope, frequency: t.frequency, form_code: t.form_code,
      }]).select('id').single()
      if (tErr) throw tErr
      const tItems = items.filter(i => i.template_id === t.id)
      if (tItems.length > 0) {
        const rows = tItems.map(i => ({
          template_id: tmpl.id, section_label: i.section_label, item_no: i.item_no, description: i.description, item_type: i.item_type,
        }))
        const { error: iErr } = await supabase.from('maintenance_checklist_items').insert(rows)
        if (iErr) throw iErr
      }
      await load()
      setExpandedTemplate(tmpl.id)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setDuplicating(null)
    }
  }

  async function addItem(templateId: number) {
    const draft = newItem[templateId]
    if (!draft?.description.trim()) return
    const existingCount = items.filter(i => i.template_id === templateId).length
    const { error } = await supabase.from('maintenance_checklist_items').insert([{
      template_id: templateId, section_label: draft.section_label.trim() || null, item_no: existingCount + 1,
      description: draft.description.trim(), item_type: draft.item_type || 'ok_fault',
    }])
    if (error) { alert('Error: ' + error.message); return }
    setNewItem({ ...newItem, [templateId]: { section_label: '', description: '', item_type: 'ok_fault' } })
    load()
  }

  async function deleteItem(id: number) {
    const { error } = await supabase.from('maintenance_checklist_items').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  function startEditTemplate(t: Template) {
    setEditingTemplateId(t.id)
    setTemplateEditName(t.name)
  }

  async function saveTemplateName(t: Template) {
    const name = templateEditName.trim()
    if (!name) return
    const { error } = await supabase.from('maintenance_checklist_templates').update({ name }).eq('id', t.id)
    if (error) { alert('Error: ' + error.message); return }
    setEditingTemplateId(null)
    load()
  }

  function startEditItem(it: Item) {
    setEditingItemId(it.id)
    setItemEditData({ section_label: it.section_label || '', description: it.description, item_type: it.item_type })
  }

  async function saveItemEdit(id: number) {
    if (!itemEditData.description.trim()) return
    const { error } = await supabase.from('maintenance_checklist_items').update({
      section_label: itemEditData.section_label.trim() || null, description: itemEditData.description.trim(), item_type: itemEditData.item_type,
    }).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    setEditingItemId(null)
    load()
  }

  const equipCategories = [...new Set(equipment.map(e => e.category).filter(Boolean))].sort() as string[]
  const equipLocations = [...new Set(equipment.map(e => e.location).filter(Boolean))].sort() as string[]
  const filteredEquipment = equipment.filter(e => {
    if (equipFilter.category && e.category !== equipFilter.category) return false
    if (equipFilter.location && e.location !== equipFilter.location) return false
    if (equipFilter.condition && e.condition !== equipFilter.condition) return false
    if (equipFilter.q) {
      const term = equipFilter.q.trim().toLowerCase()
      const hay = `${e.equip_code || ''} ${e.name}`.toLowerCase()
      if (term && !hay.includes(term)) return false
    }
    return true
  })

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-10">
      <h1 className="text-3xl font-bold flex items-center gap-2"><SettingsIcon className="w-7 h-7 text-orange-600" /> Maintenance Settings</h1>

      <PublicJobRequestLink />

      <div>
        <h2 className="text-lg font-bold mb-3">Work Request Notifications</h2>
        <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Manager/Supervisor Email (comma-separate for multiple)</label>
            <input type="email" multiple value={managerEmail} onChange={e => setManagerEmail(e.target.value)} placeholder="manager@example.com" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <button onClick={saveManagerEmail} disabled={savingEmail} className="bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-700">{savingEmail ? 'Saving...' : 'Save'}</button>
        </div>
        <p className="text-xs text-gray-500 mt-2">An email is sent here immediately every time a new Work Request is filed (in addition to the pending-count badge on the Dashboard).</p>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">Equipment</h2>
        <form onSubmit={addEquipment} className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Name</label><input required value={newEquip.name} onChange={e => setNewEquip({ ...newEquip, name: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-44" /></div>
          <div className="text-xs text-gray-400 self-center pb-2.5">Code: auto-generated ({nextEquipCode()})</div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Category</label><input value={newEquip.category} onChange={e => setNewEquip({ ...newEquip, category: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-36" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Brand</label><input value={newEquip.brand} onChange={e => setNewEquip({ ...newEquip, brand: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-32" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Location</label><input value={newEquip.location} onChange={e => setNewEquip({ ...newEquip, location: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-36" /></div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Condition</label>
            <select value={newEquip.condition} onChange={e => setNewEquip({ ...newEquip, condition: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white">
              <option value="">-</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="spoil">Spoil</option>
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Ownership Manager</label><input value={newEquip.manager} onChange={e => setNewEquip({ ...newEquip, manager: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-32" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Ownership Supervisor</label><input value={newEquip.supervisor} onChange={e => setNewEquip({ ...newEquip, supervisor: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-32" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">PIC Day</label><input value={newEquip.pic_day} onChange={e => setNewEquip({ ...newEquip, pic_day: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-28" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">PIC Night</label><input value={newEquip.pic_night} onChange={e => setNewEquip({ ...newEquip, pic_night: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-28" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Target Repair (h)</label><input type="number" step="0.1" value={newEquip.target_repair_hours} onChange={e => setNewEquip({ ...newEquip, target_repair_hours: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-24" /></div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Checklist</label>
            <select value={newEquip.pm_checklist_template_id} onChange={e => setNewEquip({ ...newEquip, pm_checklist_template_id: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-36">
              <option value="">None</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button type="submit" className="flex items-center gap-1.5 bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-700"><Plus className="w-4 h-4" /> Add</button>
        </form>
        <div className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search (code or name)</label>
            <input value={equipFilter.q} onChange={e => setEquipFilter({ ...equipFilter, q: e.target.value })} placeholder="e.g. E00092 or Crane" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select value={equipFilter.category} onChange={e => setEquipFilter({ ...equipFilter, category: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-36">
              <option value="">All</option>
              {equipCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
            <select value={equipFilter.location} onChange={e => setEquipFilter({ ...equipFilter, location: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-36">
              <option value="">All</option>
              {equipLocations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Condition</label>
            <select value={equipFilter.condition} onChange={e => setEquipFilter({ ...equipFilter, condition: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-32">
              <option value="">All</option>
              <option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="spoil">Spoil</option>
            </select>
          </div>
          {(equipFilter.q || equipFilter.category || equipFilter.location || equipFilter.condition) && (
            <button onClick={() => setEquipFilter({ q: '', category: '', location: '', condition: '' })} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2">Clear</button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filteredEquipment.length} of {equipment.length}</span>
        </div>
        <div className="bg-white border rounded-xl shadow-sm overflow-auto max-h-[70vh]">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Category</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Brand</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Location</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Condition</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Ownership Manager</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Ownership Supervisor</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">PIC Day</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">PIC Night</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Target Repair (h)</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Checklist</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEquipment.map(eq => (
                <tr key={eq.id}>
                  {editingId === eq.id ? (
                    <>
                      <td className="px-4 py-2"><input value={editData.equip_code || ''} onChange={e => setEditData({ ...editData, equip_code: e.target.value || null })} className="border rounded px-2 py-1 w-20" /></td>
                      <td className="px-4 py-2"><input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} className="border rounded px-2 py-1 w-full" /></td>
                      <td className="px-4 py-2"><input value={editData.category || ''} onChange={e => setEditData({ ...editData, category: e.target.value || null })} className="border rounded px-2 py-1 w-28" /></td>
                      <td className="px-4 py-2"><input value={editData.brand || ''} onChange={e => setEditData({ ...editData, brand: e.target.value || null })} className="border rounded px-2 py-1 w-28" /></td>
                      <td className="px-4 py-2"><input value={editData.location || ''} onChange={e => setEditData({ ...editData, location: e.target.value || null })} className="border rounded px-2 py-1 w-32" /></td>
                      <td className="px-4 py-2">
                        <select value={editData.condition || ''} onChange={e => setEditData({ ...editData, condition: e.target.value || null })} className="border rounded px-2 py-1 bg-white">
                          <option value="">-</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="spoil">Spoil</option>
                        </select>
                      </td>
                      <td className="px-4 py-2"><input value={editData.manager || ''} onChange={e => setEditData({ ...editData, manager: e.target.value })} className="border rounded px-2 py-1 w-full" /></td>
                      <td className="px-4 py-2"><input value={editData.supervisor || ''} onChange={e => setEditData({ ...editData, supervisor: e.target.value })} className="border rounded px-2 py-1 w-full" /></td>
                      <td className="px-4 py-2"><input value={editData.pic_day || ''} onChange={e => setEditData({ ...editData, pic_day: e.target.value })} className="border rounded px-2 py-1 w-full" /></td>
                      <td className="px-4 py-2"><input value={editData.pic_night || ''} onChange={e => setEditData({ ...editData, pic_night: e.target.value })} className="border rounded px-2 py-1 w-full" /></td>
                      <td className="px-4 py-2"><input type="number" value={editData.target_repair_hours || ''} onChange={e => setEditData({ ...editData, target_repair_hours: e.target.value ? Number(e.target.value) : null })} className="border rounded px-2 py-1 w-20" /></td>
                      <td className="px-4 py-2">
                        <select value={editData.pm_checklist_template_id || ''} onChange={e => setEditData({ ...editData, pm_checklist_template_id: e.target.value ? Number(e.target.value) : null })} className="border rounded px-2 py-1 bg-white w-36">
                          <option value="">None</option>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 flex gap-1">
                        <button onClick={saveEdit} className="text-green-600 hover:text-green-800 p-1"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-700 p-1"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-gray-500">{eq.equip_code || '-'}</td>
                      <td className="px-4 py-2.5 font-medium">{eq.name}</td>
                      <td className="px-4 py-2.5">{eq.category || '-'}</td>
                      <td className="px-4 py-2.5">{eq.brand || '-'}</td>
                      <td className="px-4 py-2.5">{eq.location || '-'}</td>
                      <td className="px-4 py-2.5">{eq.condition || '-'}</td>
                      <td className="px-4 py-2.5">{eq.manager || '-'}</td>
                      <td className="px-4 py-2.5">{eq.supervisor || '-'}</td>
                      <td className="px-4 py-2.5">{eq.pic_day || '-'}</td>
                      <td className="px-4 py-2.5">{eq.pic_night || '-'}</td>
                      <td className="px-4 py-2.5">{eq.target_repair_hours ?? '-'}</td>
                      <td className="px-4 py-2.5">{templates.find(t => t.id === eq.pm_checklist_template_id)?.name || <span className="text-gray-400">-</span>}</td>
                      <td className="px-4 py-2.5 flex gap-1">
                        <button onClick={() => startEdit(eq)} className="text-blue-600 hover:text-blue-800 p-1"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deactivate(eq.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filteredEquipment.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-6 text-center text-gray-400">{equipment.length === 0 ? 'No equipment yet.' : 'No equipment matches these filters.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Checklist Templates</h2>
          <label className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg cursor-pointer ${importingTemplate ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            <Upload className="w-4 h-4" /> {importingTemplate ? 'Importing...' : 'Import Template'}
            <input type="file" accept="application/json" className="hidden" disabled={importingTemplate}
              onChange={e => { const f = e.target.files?.[0]; if (f) importTemplateFile(f); e.target.value = '' }} />
          </label>
        </div>
        <form onSubmit={addTemplate} className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Name</label><input required value={newTemplate.name} onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })} className="border rounded-md px-3 py-2 text-sm w-56" /></div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Scope</label>
            <select value={newTemplate.scope} onChange={e => setNewTemplate({ ...newTemplate, scope: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white">
              <option value="single_equipment">Single Equipment</option>
              <option value="section_list">Multi-Section (Daily)</option>
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Frequency</label><input value={newTemplate.frequency} onChange={e => setNewTemplate({ ...newTemplate, frequency: e.target.value })} placeholder="e.g. Monthly, Daily" className="border rounded-md px-3 py-2 text-sm w-36" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Form Code</label><input value={newTemplate.form_code} onChange={e => setNewTemplate({ ...newTemplate, form_code: e.target.value })} placeholder="e.g. EM-F07" className="border rounded-md px-3 py-2 text-sm w-32" /></div>
          <button type="submit" className="flex items-center gap-1.5 bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-700"><Plus className="w-4 h-4" /> Add</button>
        </form>

        <div className="space-y-3">
          {templates.map(t => {
            const tItems = items.filter(i => i.template_id === t.id)
            const isOpen = expandedTemplate === t.id
            return (
              <div key={t.id} className="bg-white border rounded-xl shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => editingTemplateId !== t.id && setExpandedTemplate(isOpen ? null : t.id)}>
                  <div className="flex items-center gap-2 min-w-0">
                    {editingTemplateId === t.id ? (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <input autoFocus value={templateEditName} onChange={e => setTemplateEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveTemplateName(t); if (e.key === 'Escape') setEditingTemplateId(null) }}
                          className="border rounded px-2 py-1 text-sm font-semibold w-56" />
                        <button onClick={() => saveTemplateName(t)} className="text-green-600 hover:text-green-800 p-1"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingTemplateId(null)} className="text-gray-500 hover:text-gray-700 p-1"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="font-semibold text-sm truncate">{t.name}</span>
                        <button onClick={e => { e.stopPropagation(); startEditTemplate(t) }} className="text-gray-300 hover:text-blue-600 p-0.5 flex-shrink-0" title="Rename"><Pencil className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                    <span className="text-xs text-gray-400 ml-1 flex-shrink-0">{t.scope === 'single_equipment' ? 'Per equipment' : 'Multi-section'} · {tItems.length} items</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); duplicateTemplate(t) }} disabled={duplicating === t.id} className="text-gray-400 hover:text-orange-600 p-1 disabled:opacity-40" title="Duplicate — use this as a starting point for a new template"><Copy className="w-4 h-4" /></button>
                    <button onClick={e => { e.stopPropagation(); exportTemplate(t) }} className="text-gray-400 hover:text-blue-600 p-1" title="Export as JSON"><Download className="w-4 h-4" /></button>
                    <button onClick={e => { e.stopPropagation(); deleteTemplate(t.id) }} className="text-red-500 hover:text-red-700 p-1" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t px-4 py-3">
                    <table className="min-w-full text-sm mb-3">
                      <tbody className="divide-y divide-gray-100">
                        {tItems.map(it => (
                          <tr key={it.id}>
                            {editingItemId === it.id ? (
                              <>
                                <td className="py-1.5 pr-1 w-32"><input value={itemEditData.section_label} onChange={e => setItemEditData({ ...itemEditData, section_label: e.target.value })} placeholder="Section" className="border rounded px-2 py-1 text-xs w-full" /></td>
                                <td className="py-1.5 pr-1"><input value={itemEditData.description} onChange={e => setItemEditData({ ...itemEditData, description: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveItemEdit(it.id)} className="border rounded px-2 py-1 text-sm w-full" /></td>
                                <td className="py-1.5 pr-1 w-36">
                                  <select value={itemEditData.item_type} onChange={e => setItemEditData({ ...itemEditData, item_type: e.target.value })} className="border rounded px-2 py-1 text-xs bg-white w-full">
                                    {Object.entries(ITEM_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                  </select>
                                </td>
                                <td className="py-1.5 w-16 flex gap-1">
                                  <button onClick={() => saveItemEdit(it.id)} className="text-green-600 hover:text-green-800 p-1"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setEditingItemId(null)} className="text-gray-500 hover:text-gray-700 p-1"><X className="w-3.5 h-3.5" /></button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="py-1.5 text-xs text-gray-400 w-32">{it.section_label || '-'}</td>
                                <td className="py-1.5">{it.description}</td>
                                <td className="py-1.5 text-xs text-gray-400 w-36">{ITEM_TYPE_LABELS[it.item_type] || it.item_type}</td>
                                <td className="py-1.5 w-16 flex gap-1">
                                  <button onClick={() => startEditItem(it)} className="text-gray-400 hover:text-blue-600 p-1"><Pencil className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => deleteItem(it.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex gap-2">
                      <input placeholder="Section (optional)" value={newItem[t.id]?.section_label || ''} onChange={e => setNewItem({ ...newItem, [t.id]: { section_label: e.target.value, description: newItem[t.id]?.description || '', item_type: newItem[t.id]?.item_type || 'ok_fault' } })} className="border rounded px-2 py-1.5 text-sm w-36" />
                      <input placeholder="Item description" value={newItem[t.id]?.description || ''} onChange={e => setNewItem({ ...newItem, [t.id]: { section_label: newItem[t.id]?.section_label || '', description: e.target.value, item_type: newItem[t.id]?.item_type || 'ok_fault' } })} className="border rounded px-2 py-1.5 text-sm flex-1" />
                      <select value={newItem[t.id]?.item_type || 'ok_fault'} onChange={e => setNewItem({ ...newItem, [t.id]: { section_label: newItem[t.id]?.section_label || '', description: newItem[t.id]?.description || '', item_type: e.target.value } })} className="border rounded px-2 py-1.5 text-sm bg-white w-40">
                        {Object.entries(ITEM_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <button onClick={() => addItem(t.id)} className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200">Add Item</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {templates.length === 0 && <p className="text-sm text-gray-400">No checklist templates yet.</p>}
        </div>
      </div>
    </div>
  )
}
