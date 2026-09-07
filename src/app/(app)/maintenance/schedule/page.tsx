'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CalendarClock, ClipboardList, X } from 'lucide-react'

type Equipment = { id: number; name: string }
type Template = { id: number; name: string; scope: 'single_equipment' | 'section_list'; frequency: string | null }
type Item = { id: number; template_id: number; section_label: string | null; item_no: number | null; description: string }

function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

export default function SchedulePage() {
  const supabase = createClient()
  const year = new Date().getFullYear()
  const currentWeek = isoWeek(new Date())

  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [pmRows, setPmRows] = useState<{ id: number; equipment_id: number; week_number: number; planned: boolean; completed_at: string | null }[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  const [fillTemplate, setFillTemplate] = useState<Template | null>(null)
  const [fillEquipmentId, setFillEquipmentId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [results, setResults] = useState<Record<number, { result: string; qty: string; remark: string }>>({})
  const [doneBy, setDoneBy] = useState('')
  const [verifiedBy, setVerifiedBy] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: eq }, { data: pm }, { data: tmpl }] = await Promise.all([
      supabase.from('maintenance_equipment').select('id, name').eq('is_active', true).order('name'),
      supabase.from('maintenance_pm_schedule').select('id, equipment_id, week_number, planned, completed_at').eq('year', year),
      supabase.from('maintenance_checklist_templates').select('id, name, scope, frequency').order('name'),
    ])
    setEquipment(eq || [])
    setPmRows(pm || [])
    setTemplates(tmpl || [])
    setLoading(false)
  }

  async function toggleCompleted(equipmentId: number, weekNumber: number) {
    const existing = pmRows.find(r => r.equipment_id === equipmentId && r.week_number === weekNumber)
    if (!existing) return
    const nowDone = !existing.completed_at
    const { error } = await supabase.from('maintenance_pm_schedule').update({ completed_at: nowDone ? new Date().toISOString() : null }).eq('id', existing.id)
    if (error) { alert('Error: ' + error.message); return }
    setPmRows(prev => prev.map(r => r.id === existing.id ? { ...r, completed_at: nowDone ? new Date().toISOString() : null } : r))
  }

  async function openFill(template: Template) {
    setFillTemplate(template)
    setFillEquipmentId('')
    setDoneBy('')
    setVerifiedBy('')
    const { data } = await supabase.from('maintenance_checklist_items').select('*').eq('template_id', template.id).order('item_no')
    setItems(data || [])
    setResults({})
  }

  async function submitChecklist() {
    if (!fillTemplate) return
    if (fillTemplate.scope === 'single_equipment' && !fillEquipmentId) { alert('Please select the equipment'); return }
    setSaving(true)
    try {
      const { data: sub, error } = await supabase.from('maintenance_checklist_submissions').insert([{
        template_id: fillTemplate.id,
        equipment_id: fillTemplate.scope === 'single_equipment' ? Number(fillEquipmentId) : null,
        submission_date: new Date().toISOString().split('T')[0],
        done_by: doneBy || null,
        verified_by: verifiedBy || null,
      }]).select('id').single()
      if (error) throw error

      const rows = items.filter(it => results[it.id]?.result).map(it => ({
        submission_id: sub.id,
        checklist_item_id: it.id,
        result: results[it.id].result,
        qty: results[it.id].qty ? Number(results[it.id].qty) : null,
        remark: results[it.id].remark || null,
      }))
      if (rows.length > 0) {
        const { error: itemErr } = await supabase.from('maintenance_checklist_submission_items').insert(rows)
        if (itemErr) throw itemErr
      }
      setFillTemplate(null)
      alert('Checklist submitted')
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const weeks = Array.from({ length: 52 }, (_, i) => i + 1)
  const grouped = items.reduce((acc: Record<string, Item[]>, it) => {
    const key = it.section_label || ''
    acc[key] = acc[key] || []
    acc[key].push(it)
    return acc
  }, {})

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><CalendarClock className="w-7 h-7 text-orange-600" /> Schedule &amp; Checklists</h1>

      <h2 className="text-lg font-bold mb-3">PM Schedule — {year}</h2>
      <p className="text-xs text-gray-500 mb-3">Yellow = planned this week. Click the current week's cell to mark it done. Manage which weeks are planned in Settings.</p>
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-10 max-h-[70vh] overflow-y-auto">
        <table className="min-w-max text-xs">
          <thead>
            {/* sticky top-0 on every header cell so the week/equipment header
                stays visible while scrolling down a long equipment list; the
                corner cell is also sticky left-0 (see below), so it needs a
                higher z-index to stay above the plain top-sticky cells that
                scroll underneath it horizontally. */}
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500 uppercase border-r">Equipment</th>
              {weeks.map(wk => <th key={wk} className={`sticky top-0 z-10 px-1 py-2 font-normal border-r ${wk === currentWeek ? 'bg-blue-50 text-blue-700 font-bold' : 'bg-gray-50 text-gray-400'}`}>{wk}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {equipment.map(eq => (
              <tr key={eq.id}>
                <td className="sticky left-0 bg-white px-3 py-1.5 font-medium border-r whitespace-nowrap">{eq.name}</td>
                {weeks.map(wk => {
                  const row = pmRows.find(r => r.equipment_id === eq.id && r.week_number === wk)
                  const planned = row?.planned
                  const done = !!row?.completed_at
                  return (
                    <td key={wk} className="border-r p-0.5">
                      <button
                        onClick={() => wk === currentWeek && planned && toggleCompleted(eq.id, wk)}
                        disabled={!planned || wk !== currentWeek}
                        className={`w-5 h-5 rounded ${done ? 'bg-green-500' : planned ? 'bg-yellow-300' : 'bg-gray-100'} ${wk === currentWeek && planned ? 'cursor-pointer ring-1 ring-blue-400' : ''}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
            {!loading && equipment.length === 0 && (
              <tr><td colSpan={53} className="px-3 py-6 text-center text-gray-400">No equipment yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Checklist Templates</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white border rounded-xl shadow-sm p-4">
            <div className="font-semibold text-sm">{t.name}</div>
            <div className="text-xs text-gray-400 mt-1">{t.scope === 'single_equipment' ? 'Per equipment' : 'Multi-section'} · {t.frequency || 'No frequency set'}</div>
            <button onClick={() => openFill(t)} className="mt-3 w-full bg-orange-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-orange-700">Fill In Today</button>
          </div>
        ))}
        {templates.length === 0 && <p className="text-sm text-gray-400 col-span-full">No checklist templates yet — add some in Settings.</p>}
      </div>

      {fillTemplate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{fillTemplate.name}</h2>
              <button onClick={() => setFillTemplate(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {fillTemplate.scope === 'single_equipment' && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Equipment</label>
                <select value={fillEquipmentId} onChange={e => setFillEquipmentId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">Select equipment…</option>
                  {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                </select>
              </div>
            )}

            <div className="max-h-96 overflow-y-auto space-y-4 mb-4">
              {Object.entries(grouped).map(([section, sectionItems]) => (
                <div key={section}>
                  {section && <h3 className="text-xs font-bold text-gray-500 uppercase mb-1.5">{section}</h3>}
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {sectionItems.map(it => (
                        <tr key={it.id}>
                          <td className="py-1.5 pr-2">{it.description}</td>
                          <td className="py-1.5">
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => setResults({ ...results, [it.id]: { ...results[it.id], result: 'ok', qty: results[it.id]?.qty || '', remark: results[it.id]?.remark || '' } })}
                                className={`text-xs px-2 py-1 rounded ${results[it.id]?.result === 'ok' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'}`}>OK</button>
                              <button type="button" onClick={() => setResults({ ...results, [it.id]: { ...results[it.id], result: 'fault', qty: results[it.id]?.qty || '', remark: results[it.id]?.remark || '' } })}
                                className={`text-xs px-2 py-1 rounded ${results[it.id]?.result === 'fault' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'}`}>Fault</button>
                            </div>
                          </td>
                          <td className="py-1.5 pl-2">
                            <input placeholder="Remark" value={results[it.id]?.remark || ''} onChange={e => setResults({ ...results, [it.id]: { ...results[it.id], result: results[it.id]?.result || '', qty: results[it.id]?.qty || '', remark: e.target.value } })} className="border rounded px-2 py-1 text-xs w-full" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-gray-400">This template has no items yet — add them in Settings.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Done By</label>
                <input value={doneBy} onChange={e => setDoneBy(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Verified By</label>
                <input value={verifiedBy} onChange={e => setVerifiedBy(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setFillTemplate(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={submitChecklist} disabled={saving} className="bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700">{saving ? 'Submitting...' : 'Submit Checklist'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
