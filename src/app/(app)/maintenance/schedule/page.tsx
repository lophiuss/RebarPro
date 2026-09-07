'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listMaintenanceStaff, uploadMaintenanceFile, type StaffMember } from '../actions'
import { CalendarClock, ClipboardList, X, Plus, Trash2, ChevronLeft, ChevronRight, Bell, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import PhotoPicker from '@/components/PhotoPicker'

type Equipment = {
  id: number; name: string; equip_code: string | null; category: string | null; location: string | null
  condition: string | null; pm_checklist_template_id: number | null
}
type Template = { id: number; name: string; scope: 'single_equipment' | 'section_list'; frequency: string | null }
type Item = { id: number; template_id: number; section_label: string | null; item_no: number | null; description: string }
type PmRow = { id: number; equipment_id: number; week_number: number; planned: boolean; completed_at: string | null; assigned_to: string | null }
type Recurrence = {
  id: number; equipment_id: number; frequency_weeks: number; start_date: string
  assigned_to: string | null; notes: string | null; is_active: boolean
  maintenance_equipment: { name: string } | null
}
type Submission = {
  id: number; template_id: number; equipment_id: number | null; submission_date: string
  done_by: string | null; verified_by: string | null; status: string; approved_by: string | null
  maintenance_checklist_templates: { name: string } | null
  maintenance_equipment: { name: string } | null
}

async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const MAX = 900
  let { width, height } = img
  if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX } }
  else if (height > MAX) { width *= MAX / height; height = MAX }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  return new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.75))
}

// ISO week helpers. isoWeekInfo mirrors the previous isoWeek() but also
// returns the ISO week-YEAR (not always the same as the calendar year for
// dates in very late December / very early January) — needed so recurrence
// generation and the year navigator both land on the same (year, week) the
// database's maintenance_pm_schedule.year/week_number columns expect.
function isoWeekInfo(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { isoYear, week }
}
function mondayOfIsoWeek(isoYear: number, week: number) {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))
  const target = new Date(week1Monday)
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7)
  return target
}
function fmtShort(d: Date) {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
// Builds the maintenance_pm_schedule rows a recurrence rule implies, every
// frequencyWeeks weeks starting from startDate, for a ~2-year horizon —
// "keeps continuing for the coming date" without needing a background job;
// re-running (or extending) the rule later just upserts further ahead.
function buildRecurrenceRows(equipmentId: number, frequencyWeeks: number, startDateStr: string, assignedTo: string | null, horizonWeeks = 105) {
  const start = new Date(startDateStr + 'T00:00:00Z')
  const rows: { equipment_id: number; year: number; week_number: number; planned: boolean; assigned_to: string | null }[] = []
  for (let i = 0; i < horizonWeeks; i += frequencyWeeks) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i * 7)
    const { isoYear, week } = isoWeekInfo(d)
    rows.push({ equipment_id: equipmentId, year: isoYear, week_number: week, planned: true, assigned_to: assignedTo || null })
  }
  return rows
}

export default function SchedulePage() {
  const supabase = createClient()
  const today = new Date()
  const { isoYear: realYear, week: realWeek } = isoWeekInfo(today)

  const [viewYear, setViewYear] = useState(realYear)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [pmRows, setPmRows] = useState<PmRow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [recurrences, setRecurrences] = useState<Recurrence[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [myName, setMyName] = useState('')
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)

  const [weekSubmittedEquipIds, setWeekSubmittedEquipIds] = useState<Set<number>>(new Set())
  const [currentWeekPlannedIds, setCurrentWeekPlannedIds] = useState<Set<number>>(new Set())
  const [pendingSubmissions, setPendingSubmissions] = useState<Submission[]>([])
  const [approvingId, setApprovingId] = useState<number | null>(null)

  const [equipFilter, setEquipFilter] = useState({ q: '', category: '', location: '', condition: '' })

  const [showNewRecurrence, setShowNewRecurrence] = useState(false)
  const [newRec, setNewRec] = useState({ equipmentId: '', frequencyWeeks: '4', startDate: today.toISOString().split('T')[0], assignedTo: '', notes: '' })
  const [savingRec, setSavingRec] = useState(false)
  const [showRecurrenceList, setShowRecurrenceList] = useState(false)

  const [fillTemplate, setFillTemplate] = useState<Template | null>(null)
  const [fillEquipmentId, setFillEquipmentId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [results, setResults] = useState<Record<number, { result: string; qty: string; remark: string }>>({})
  const [verifiedBy, setVerifiedBy] = useState('')
  const [checklistPhoto, setChecklistPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [viewYear])

  async function load() {
    setLoading(true)
    const weekStart = mondayOfIsoWeek(realYear, realWeek)
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6)
    const weekStartStr = weekStart.toISOString().split('T')[0]
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    const [{ data: eq }, { data: pm }, { data: tmpl }, { data: rec }, { data: { user } }, { data: weekSubs }, { data: pendingSubs }] = await Promise.all([
      supabase.from('maintenance_equipment').select('id, name, equip_code, category, location, condition, pm_checklist_template_id').eq('is_active', true).order('name'),
      supabase.from('maintenance_pm_schedule').select('id, equipment_id, week_number, planned, completed_at, assigned_to').eq('year', viewYear),
      supabase.from('maintenance_checklist_templates').select('id, name, scope, frequency').order('name'),
      supabase.from('maintenance_pm_recurrence').select('*, maintenance_equipment(name)').order('created_at', { ascending: false }),
      supabase.auth.getUser(),
      supabase.from('maintenance_checklist_submissions').select('equipment_id').gte('submission_date', weekStartStr).lte('submission_date', weekEndStr),
      supabase.from('maintenance_checklist_submissions').select('*, maintenance_checklist_templates(name), maintenance_equipment(name)').eq('status', 'pending').order('submission_date', { ascending: false }),
    ])
    setEquipment(eq || [])
    setPmRows(pm || [])
    setTemplates(tmpl || [])
    setRecurrences((rec as any) || [])
    setWeekSubmittedEquipIds(new Set((weekSubs || []).map(s => s.equipment_id).filter((id): id is number => id != null)))
    setPendingSubmissions((pendingSubs as any) || [])

    // "Outstanding" needs THIS week's planned equipment regardless of which
    // year the grid above is currently browsing (viewYear), so it's fetched
    // separately rather than reused from the `pm` query above.
    if (viewYear === realYear) {
      setCurrentWeekPlannedIds(new Set((pm || []).filter(r => r.week_number === realWeek && r.planned).map(r => r.equipment_id)))
    } else {
      const { data: curPm } = await supabase.from('maintenance_pm_schedule').select('equipment_id, planned').eq('year', realYear).eq('week_number', realWeek)
      setCurrentWeekPlannedIds(new Set((curPm || []).filter(r => r.planned).map(r => r.equipment_id)))
    }
    let manages = false
    if (user) {
      const [{ data: profile }, { data: myAccess }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
        supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'maintenance').maybeSingle(),
      ])
      setMyName(profile?.full_name || user.email || '')
      manages = myAccess?.role === 'admin' || myAccess?.role === 'manager'
    }
    setCanManage(manages)
    setStaff(await listMaintenanceStaff().catch(() => []))
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

  async function addRecurrence(e: React.FormEvent) {
    e.preventDefault()
    if (!newRec.equipmentId || !newRec.frequencyWeeks || !newRec.startDate) { alert('Please fill in equipment, frequency, and start date'); return }
    setSavingRec(true)
    try {
      const { error: recErr } = await supabase.from('maintenance_pm_recurrence').insert([{
        equipment_id: Number(newRec.equipmentId), frequency_weeks: Number(newRec.frequencyWeeks),
        start_date: newRec.startDate, assigned_to: newRec.assignedTo || null, notes: newRec.notes || null,
      }])
      if (recErr) throw recErr
      const rows = buildRecurrenceRows(Number(newRec.equipmentId), Number(newRec.frequencyWeeks), newRec.startDate, newRec.assignedTo || null)
      const { error: upErr } = await supabase.from('maintenance_pm_schedule').upsert(rows, { onConflict: 'equipment_id,year,week_number' })
      if (upErr) throw upErr
      setShowNewRecurrence(false)
      setNewRec({ equipmentId: '', frequencyWeeks: '4', startDate: today.toISOString().split('T')[0], assignedTo: '', notes: '' })
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSavingRec(false)
    }
  }

  async function deleteRecurrence(id: number) {
    if (!confirm('Stop this recurring schedule? Weeks already generated stay on the calendar — this only stops it from extending further.')) return
    const { error } = await supabase.from('maintenance_pm_recurrence').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    await load()
  }

  async function openFill(template: Template, presetEquipmentId?: number) {
    setFillTemplate(template)
    setFillEquipmentId(presetEquipmentId ? String(presetEquipmentId) : '')
    setVerifiedBy('')
    setChecklistPhoto(null)
    const { data } = await supabase.from('maintenance_checklist_items').select('*').eq('template_id', template.id).order('item_no')
    setItems(data || [])
    setResults({})
  }

  // Jumps straight into a specific machine's checklist from the Outstanding
  // list — skips picking a template card + then an equipment dropdown.
  function openFillForEquipment(eq: Equipment) {
    const template = templates.find(t => t.id === eq.pm_checklist_template_id)
    if (!template) { alert('This equipment has no checklist template assigned — set one in Settings.'); return }
    openFill(template, eq.id)
  }

  async function submitChecklist() {
    if (!fillTemplate) return
    if (fillTemplate.scope === 'single_equipment' && !fillEquipmentId) { alert('Please select the equipment'); return }
    setSaving(true)
    try {
      let photo_drive_id: string | null = null
      if (checklistPhoto) {
        const blob = await compressImage(checklistPhoto)
        const fd = new FormData()
        fd.set('file', blob, 'photo.jpg')
        photo_drive_id = await uploadMaintenanceFile(fd)
      }
      const { data: sub, error } = await supabase.from('maintenance_checklist_submissions').insert([{
        template_id: fillTemplate.id,
        equipment_id: fillTemplate.scope === 'single_equipment' ? Number(fillEquipmentId) : null,
        submission_date: new Date().toISOString().split('T')[0],
        done_by: myName || null,
        verified_by: verifiedBy || null,
        photo_drive_id,
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
      alert('Checklist submitted — awaiting manager approval.')
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Approving is the "auto mark done": it stamps the submission and, for a
  // single-equipment checklist, also marks that equipment's matching
  // PM-schedule week complete — the manual grid toggle still exists as a
  // manager override, but this is the normal path now.
  async function approveSubmission(sub: Submission) {
    setApprovingId(sub.id)
    try {
      const approvedAt = new Date().toISOString()
      const { error } = await supabase.from('maintenance_checklist_submissions').update({
        status: 'approved', approved_by: myName || null, approved_at: approvedAt,
      }).eq('id', sub.id)
      if (error) throw error

      if (sub.equipment_id) {
        const { isoYear, week } = isoWeekInfo(new Date(sub.submission_date + 'T00:00:00Z'))
        const { data: pmRow } = await supabase.from('maintenance_pm_schedule').select('id').eq('equipment_id', sub.equipment_id).eq('year', isoYear).eq('week_number', week).maybeSingle()
        if (pmRow) {
          await supabase.from('maintenance_pm_schedule').update({ completed_at: approvedAt }).eq('id', pmRow.id)
        }
      }
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setApprovingId(null)
    }
  }

  async function rejectSubmission(sub: Submission) {
    const reason = window.prompt('Reason for rejecting this checklist (the technician will need to redo it):')
    if (reason === null) return
    setApprovingId(sub.id)
    try {
      const { error } = await supabase.from('maintenance_checklist_submissions').update({
        status: 'rejected', approved_by: myName || null, approved_at: new Date().toISOString(), rejection_reason: reason || null,
      }).eq('id', sub.id)
      if (error) throw error
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setApprovingId(null)
    }
  }

  const weeks = Array.from({ length: 52 }, (_, i) => i + 1)
  const grouped = items.reduce((acc: Record<string, Item[]>, it) => {
    const key = it.section_label || ''
    acc[key] = acc[key] || []
    acc[key].push(it)
    return acc
  }, {})

  const categories = [...new Set(equipment.map(e => e.category).filter(Boolean))].sort() as string[]
  const locations = [...new Set(equipment.map(e => e.location).filter(Boolean))].sort() as string[]
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
  const managersAndSupervisors = staff.filter(s => s.role === 'admin' || s.role === 'manager')

  // Outstanding = has a checklist template, planned for this week, and no
  // submission filed yet this week — the "auto light up" list. Grouped by
  // category so a technician can jump straight to "Crane" -> click the
  // model -> fill it, per the requested flow.
  const outstanding = equipment.filter(e =>
    e.pm_checklist_template_id && currentWeekPlannedIds.has(e.id) && !weekSubmittedEquipIds.has(e.id)
  )
  const outstandingByCategory = outstanding.reduce((acc: Record<string, Equipment[]>, e) => {
    const key = e.category || 'Uncategorized'
    acc[key] = acc[key] || []
    acc[key].push(e)
    return acc
  }, {})

  // "Auto remind": this week's cells assigned to me, not yet done — surfaced
  // as an in-app banner here (and on the Dashboard) rather than email, so it
  // doesn't need a new cron/notification pipeline.
  const myPendingThisWeek = viewYear === realYear
    ? pmRows.filter(r => r.week_number === realWeek && r.planned && !r.completed_at && r.assigned_to === myName)
    : []

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><CalendarClock className="w-7 h-7 text-orange-600" /> Schedule &amp; Checklists</h1>

      {myPendingThisWeek.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-6 text-sm font-semibold text-amber-800">
          <Bell className="w-4 h-4 flex-shrink-0" />
          You have {myPendingThisWeek.length} PM task{myPendingThisWeek.length === 1 ? '' : 's'} assigned to you this week ({fmtShort(mondayOfIsoWeek(realYear, realWeek))}):{' '}
          {myPendingThisWeek.map(r => equipment.find(e => e.id === r.equipment_id)?.name || '?').join(', ')}
        </div>
      )}

      {outstanding.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-bold text-red-800 flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4" /> Outstanding This Week ({outstanding.length}) — checklist not yet filed</h2>
          <div className="space-y-3">
            {Object.entries(outstandingByCategory).map(([cat, eqs]) => (
              <div key={cat}>
                <div className="text-xs font-semibold text-red-700 uppercase mb-1.5">{cat}</div>
                <div className="flex flex-wrap gap-2">
                  {eqs.map(e => (
                    <button key={e.id} onClick={() => openFillForEquipment(e)} className="bg-white border border-red-300 text-red-800 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-100">
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canManage && pendingSubmissions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-3"><ClipboardList className="w-4 h-4" /> Checklists Awaiting Your Approval ({pendingSubmissions.length})</h2>
          <div className="bg-white rounded-lg border border-blue-100 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-blue-50/60">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase">Template</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase">Equipment</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase">Done By</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingSubmissions.map(s => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{s.submission_date}</td>
                    <td className="px-3 py-2">{s.maintenance_checklist_templates?.name || '-'}</td>
                    <td className="px-3 py-2">{s.maintenance_equipment?.name || '-'}</td>
                    <td className="px-3 py-2">{s.done_by || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => approveSubmission(s)} disabled={approvingId === s.id} className="flex items-center gap-1 text-xs bg-green-600 disabled:opacity-50 text-white font-medium px-2.5 py-1.5 rounded-lg hover:bg-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
                        <button onClick={() => rejectSubmission(s)} disabled={approvingId === s.id} className="flex items-center gap-1 text-xs bg-gray-100 disabled:opacity-50 text-gray-600 font-medium px-2.5 py-1.5 rounded-lg hover:bg-gray-200"><XCircle className="w-3.5 h-3.5" /> Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">PM Schedule</h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setViewYear(y => y - 1)} className="p-1 rounded hover:bg-white"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-semibold px-1 w-12 text-center">{viewYear}</span>
            <button onClick={() => setViewYear(y => y + 1)} className="p-1 rounded hover:bg-white"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowRecurrenceList(true)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Recurring Schedules ({recurrences.filter(r => r.is_active).length})</button>
          <button onClick={() => setShowNewRecurrence(true)} className="flex items-center gap-1.5 bg-orange-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-orange-700">
            <Plus className="w-4 h-4" /> New Recurring Schedule
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-3">Yellow = planned this week. Click the current week's cell to mark it done. Column headers show that week's Monday date. Hover a cell to see who it's assigned to.</p>

      <div className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Search (code or name)</label>
          <input value={equipFilter.q} onChange={e => setEquipFilter({ ...equipFilter, q: e.target.value })} placeholder="e.g. E00092 or Crane" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <select value={equipFilter.category} onChange={e => setEquipFilter({ ...equipFilter, category: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-36">
            <option value="">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
          <select value={equipFilter.location} onChange={e => setEquipFilter({ ...equipFilter, location: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-36">
            <option value="">All</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
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
              {weeks.map(wk => {
                const isCurrent = viewYear === realYear && wk === realWeek
                return (
                  <th key={wk} className={`sticky top-0 z-10 px-1 py-1 font-normal border-r leading-tight ${isCurrent ? 'bg-blue-50 text-blue-700 font-bold' : 'bg-gray-50 text-gray-400'}`}>
                    <div>{fmtShort(mondayOfIsoWeek(viewYear, wk))}</div>
                    <div className="text-[9px]">Wk{wk}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredEquipment.map(eq => (
              <tr key={eq.id}>
                <td className="sticky left-0 bg-white px-3 py-1.5 font-medium border-r whitespace-nowrap">{eq.name}</td>
                {weeks.map(wk => {
                  const row = pmRows.find(r => r.equipment_id === eq.id && r.week_number === wk)
                  const planned = row?.planned
                  const done = !!row?.completed_at
                  const isCurrent = viewYear === realYear && wk === realWeek
                  const title = [planned ? `Week ${wk} — planned` : null, row?.assigned_to ? `Assigned: ${row.assigned_to}` : null, done ? 'Completed' : null].filter(Boolean).join(' · ')
                  return (
                    <td key={wk} className="border-r p-0.5">
                      <button
                        title={title || undefined}
                        onClick={() => isCurrent && planned && toggleCompleted(eq.id, wk)}
                        disabled={!planned || !isCurrent}
                        className={`w-5 h-5 rounded ${done ? 'bg-green-500' : planned ? 'bg-yellow-300' : 'bg-gray-100'} ${isCurrent && planned ? 'cursor-pointer ring-1 ring-blue-400' : ''}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
            {!loading && filteredEquipment.length === 0 && (
              <tr><td colSpan={53} className="px-3 py-6 text-center text-gray-400">{equipment.length === 0 ? 'No equipment yet.' : 'No equipment matches these filters.'}</td></tr>
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
                <input value={myName} disabled className="w-full border rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Verified By (Manager/Supervisor)</label>
                <select value={verifiedBy} onChange={e => setVerifiedBy(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">Select…</option>
                  {managersAndSupervisors.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <PhotoPicker label="Evidence Photo (optional)" file={checklistPhoto} onChange={setChecklistPhoto} />
            </div>
            <p className="text-xs text-gray-400 mb-4">Submitting sends this checklist for manager approval — the equipment's PM schedule week marks done once approved.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setFillTemplate(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={submitChecklist} disabled={saving} className="bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700">{saving ? 'Submitting...' : 'Submit Checklist'}</button>
            </div>
          </div>
        </div>
      )}

      {showNewRecurrence && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">New Recurring Schedule</h2>
              <button onClick={() => setShowNewRecurrence(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={addRecurrence} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Equipment</label>
                <select required value={newRec.equipmentId} onChange={e => setNewRec({ ...newRec, equipmentId: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">Select equipment…</option>
                  {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Frequency</label>
                  <select value={newRec.frequencyWeeks} onChange={e => setNewRec({ ...newRec, frequencyWeeks: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                    <option value="1">Every week</option>
                    <option value="2">Every 2 weeks</option>
                    <option value="4">Every month (4 weeks)</option>
                    <option value="13">Every 3 months</option>
                    <option value="26">Every 6 months</option>
                    <option value="52">Every year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                  <input required type="date" value={newRec.startDate} onChange={e => setNewRec({ ...newRec, startDate: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Assign To</label>
                <select value={newRec.assignedTo} onChange={e => setNewRec({ ...newRec, assignedTo: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">(Unassigned)</option>
                  {staff.map(s => <option key={s.name} value={s.name}>{s.name} ({s.role})</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">The assignee sees a reminder banner here and on the Dashboard during the week each occurrence falls in.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
                <input value={newRec.notes} onChange={e => setNewRec({ ...newRec, notes: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <p className="text-xs text-gray-400">This plans roughly 2 years of occurrences ahead — come back and add another if you need it to run further.</p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowNewRecurrence(false)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={savingRec} className="bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700">{savingRec ? 'Creating...' : 'Create Schedule'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRecurrenceList && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Recurring Schedules</h2>
              <button onClick={() => setShowRecurrenceList(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Frequency</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recurrences.map(r => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{r.maintenance_equipment?.name || '-'}</td>
                      <td className="px-3 py-2">Every {r.frequency_weeks === 1 ? 'week' : `${r.frequency_weeks} weeks`}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.start_date}</td>
                      <td className="px-3 py-2">{r.assigned_to || '-'}</td>
                      <td className="px-3 py-2"><button onClick={() => deleteRecurrence(r.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                  {recurrences.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No recurring schedules yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
