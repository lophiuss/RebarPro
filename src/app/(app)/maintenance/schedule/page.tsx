'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listMaintenanceStaff, uploadMaintenanceFile, type StaffMember } from '../actions'
import { CalendarClock, ClipboardList, X, Plus, Trash2, ChevronLeft, ChevronRight, Bell, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import PhotoPicker from '@/components/PhotoPicker'

type Equipment = {
  id: number; name: string; equip_code: string | null; category: string | null; location: string | null
  condition: string | null; pm_checklist_template_id: number | null
  pm_frequency: string | null; pm_pic: string | null
}
const PM_FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly']
// The PM grid is week-granularity (one cell per ISO week) — "Daily" can't
// literally mean a per-day cell here, so it maps to "planned every week",
// the closest representable meaning within this grid.
const PM_FREQUENCY_WEEKS: Record<string, number> = { Daily: 1, Weekly: 1, Monthly: 4, Quarterly: 13, 'Half-Yearly': 26, Yearly: 52 }
type Template = { id: number; name: string; scope: 'single_equipment' | 'section_list'; frequency: string | null }
type Item = { id: number; template_id: number; section_label: string | null; item_no: number | null; description: string; item_type: string }
type PmRow = { id: number; equipment_id: number; week_number: number; planned: boolean; completed_at: string | null; assigned_to: string | null }
type Recurrence = {
  id: number; equipment_id: number; frequency_weeks: number; start_date: string
  assigned_to: string | null; notes: string | null; is_active: boolean
  maintenance_equipment: { name: string } | null
}
type Submission = {
  id: number; template_id: number; equipment_id: number | null; submission_date: string
  done_by: string | null; verified_by: string | null; status: string; approved_by: string | null
  rejection_reason?: string | null; photo_drive_id?: string | null
  maintenance_checklist_templates: { name: string } | null
  maintenance_equipment: { name: string } | null
}
type SubmissionItemDetail = {
  result: string; qty: number | null; remark: string | null
  maintenance_checklist_items: { description: string; section_label: string | null } | null
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
function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  const [viewDay, setViewDay] = useState(today)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [pmRows, setPmRows] = useState<PmRow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [recurrences, setRecurrences] = useState<Recurrence[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [myName, setMyName] = useState('')
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)

  const [weekSubmittedEquipIds, setWeekSubmittedEquipIds] = useState<Set<number>>(new Set())
  // "equipmentId-weekNumber" -> latest submission for that cell, within the
  // currently-viewed year — drives the small "C" badge on grid cells.
  const [yearSubmissionsMap, setYearSubmissionsMap] = useState<Record<string, { id: number; status: string }>>({})
  const [currentWeekPlannedIds, setCurrentWeekPlannedIds] = useState<Set<number>>(new Set())
  const [currentWeekDoneIds, setCurrentWeekDoneIds] = useState<Set<number>>(new Set())
  const [pendingSubmissions, setPendingSubmissions] = useState<Submission[]>([])
  const [approvingId, setApprovingId] = useState<number | null>(null)

  // Checklist History — every submission ever filed (pending/approved/
  // rejected), in one place, so a "done" checklist has somewhere permanent
  // to be reviewed rather than only existing transiently in the pending-
  // approval queue until it's actioned.
  const [showChecklistHistory, setShowChecklistHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySubmissions, setHistorySubmissions] = useState<Submission[]>([])
  const [historyFilter, setHistoryFilter] = useState({ status: '', equipmentId: '' })
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null)
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<SubmissionItemDetail[]>([])

  const [equipFilter, setEquipFilter] = useState({ q: '', location: '', condition: '' })
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)

  const [showNewRecurrence, setShowNewRecurrence] = useState(false)
  const [newRec, setNewRec] = useState({ equipmentId: '', frequencyWeeks: '4', startDate: today.toISOString().split('T')[0], assignedTo: '', notes: '' })
  const [savingRec, setSavingRec] = useState(false)
  const [showRecurrenceList, setShowRecurrenceList] = useState(false)

  // Quick per-equipment "set the PM plan" flow off the Frequency/PIC
  // columns — picking a frequency (or clicking an existing PIC to change
  // it) opens this instead of requiring the full New Recurring Schedule
  // form. Confirming creates the same maintenance_pm_recurrence rule +
  // generated weeks that form does.
  const [planEquipment, setPlanEquipment] = useState<Equipment | null>(null)
  const [planForm, setPlanForm] = useState({ frequency: '', startDate: today.toISOString().split('T')[0], pic: '' })
  const [savingPlan, setSavingPlan] = useState(false)

  const [fillTemplate, setFillTemplate] = useState<Template | null>(null)
  const [fillEquipmentId, setFillEquipmentId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [results, setResults] = useState<Record<number, { result: string; qty: string; remark: string }>>({})
  const [verifiedBy, setVerifiedBy] = useState('')
  const [checklistPhoto, setChecklistPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [viewYear])

  // Day view is anchored to a specific calendar date rather than viewYear —
  // if the picked date's ISO week-year differs from what's loaded, sync
  // viewYear so the day's row data actually gets fetched.
  const { isoYear: dayYear, week: dayWeek } = isoWeekInfo(viewDay)
  useEffect(() => {
    if (viewMode === 'day' && dayYear !== viewYear) setViewYear(dayYear)
  }, [viewDay, viewMode])

  async function load() {
    setLoading(true)
    const weekStart = mondayOfIsoWeek(realYear, realWeek)
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6)
    const weekStartStr = weekStart.toISOString().split('T')[0]
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    // Widened calendar range (±1 week either side of the ISO year) so ISO
    // weeks that spill across the Dec/Jan boundary aren't missed, then
    // filtered client-side by actual ISO week-year below.
    const yearRangeStart = `${viewYear - 1}-12-25`
    const yearRangeEnd = `${viewYear + 1}-01-07`

    const [{ data: eq }, { data: pm }, { data: tmpl }, { data: rec }, { data: { user } }, { data: weekSubs }, { data: pendingSubs }, { data: yearSubs }] = await Promise.all([
      supabase.from('maintenance_equipment').select('id, name, equip_code, category, location, condition, pm_checklist_template_id, pm_frequency, pm_pic').eq('is_active', true).order('name'),
      supabase.from('maintenance_pm_schedule').select('id, equipment_id, week_number, planned, completed_at, assigned_to').eq('year', viewYear),
      supabase.from('maintenance_checklist_templates').select('id, name, scope, frequency').order('name'),
      supabase.from('maintenance_pm_recurrence').select('*, maintenance_equipment(name)').order('created_at', { ascending: false }),
      supabase.auth.getUser(),
      supabase.from('maintenance_checklist_submissions').select('equipment_id').gte('submission_date', weekStartStr).lte('submission_date', weekEndStr),
      supabase.from('maintenance_checklist_submissions').select('*, maintenance_checklist_templates(name), maintenance_equipment(name)').eq('status', 'pending').order('submission_date', { ascending: false }),
      supabase.from('maintenance_checklist_submissions').select('id, equipment_id, submission_date, status').not('equipment_id', 'is', null).gte('submission_date', yearRangeStart).lte('submission_date', yearRangeEnd).order('submission_date', { ascending: true }),
    ])
    setEquipment(eq || [])
    setPmRows(pm || [])
    setTemplates(tmpl || [])
    setRecurrences((rec as any) || [])
    setWeekSubmittedEquipIds(new Set((weekSubs || []).map(s => s.equipment_id).filter((id): id is number => id != null)))

    // Ascending order above means a later submission for the same cell
    // (e.g. redone after rejection) overwrites the earlier one here, so the
    // badge always reflects the most recent submission for that week.
    const cellMap: Record<string, { id: number; status: string }> = {}
    for (const s of yearSubs || []) {
      if (s.equipment_id == null) continue
      const { isoYear, week } = isoWeekInfo(new Date(s.submission_date + 'T00:00:00'))
      if (isoYear !== viewYear) continue
      cellMap[`${s.equipment_id}-${week}`] = { id: s.id, status: s.status }
    }
    setYearSubmissionsMap(cellMap)
    setPendingSubmissions((pendingSubs as any) || [])

    // "Outstanding" needs THIS week's planned equipment regardless of which
    // year the grid above is currently browsing (viewYear), so it's fetched
    // separately rather than reused from the `pm` query above.
    if (viewYear === realYear) {
      setCurrentWeekPlannedIds(new Set((pm || []).filter(r => r.week_number === realWeek && r.planned).map(r => r.equipment_id)))
      setCurrentWeekDoneIds(new Set((pm || []).filter(r => r.week_number === realWeek && r.planned && r.completed_at).map(r => r.equipment_id)))
    } else {
      const { data: curPm } = await supabase.from('maintenance_pm_schedule').select('equipment_id, planned, completed_at').eq('year', realYear).eq('week_number', realWeek)
      setCurrentWeekPlannedIds(new Set((curPm || []).filter(r => r.planned).map(r => r.equipment_id)))
      setCurrentWeekDoneIds(new Set((curPm || []).filter(r => r.planned && r.completed_at).map(r => r.equipment_id)))
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

  // Ad-hoc single-week scheduling for a manager — creates or flips the
  // planned flag on one (equipment, week) cell directly, without setting up
  // a whole recurrence rule. Complements "New Recurring Schedule" for a
  // one-off PM the recurrence generator wouldn't otherwise produce.
  async function setPlanned(equipmentId: number, weekNumber: number, planned: boolean) {
    const existing = pmRows.find(r => r.equipment_id === equipmentId && r.week_number === weekNumber)
    if (existing) {
      const { error } = await supabase.from('maintenance_pm_schedule').update({ planned }).eq('id', existing.id)
      if (error) { alert('Error: ' + error.message); return }
      setPmRows(prev => prev.map(r => r.id === existing.id ? { ...r, planned } : r))
      return
    }
    // Upsert, not a plain insert — local pmRows can be stale relative to the
    // DB (e.g. a recurrence rule already created this exact
    // equipment/year/week row after the last load()), and a plain insert
    // then hits maintenance_pm_schedule's (equipment_id, year, week_number)
    // unique constraint instead of just updating it.
    const { data, error } = await supabase.from('maintenance_pm_schedule')
      .upsert([{ equipment_id: equipmentId, year: viewYear, week_number: weekNumber, planned }], { onConflict: 'equipment_id,year,week_number' })
      .select('id, equipment_id, week_number, planned, completed_at, assigned_to')
      .single()
    if (error) { alert('Error: ' + error.message); return }
    setPmRows(prev => [...prev.filter(r => r.id !== data.id), data])
  }

  function openPlan(eq: Equipment, presetFrequency?: string) {
    setPlanEquipment(eq)
    setPlanForm({ frequency: presetFrequency || eq.pm_frequency || 'Weekly', startDate: today.toISOString().split('T')[0], pic: eq.pm_pic || '' })
  }

  // Confirming the plan creates a real recurrence rule (same mechanism as
  // "New Recurring Schedule") and generates its weeks going forward, then
  // stamps the equipment's Frequency/PIC columns to match — this is what
  // makes picking a frequency actually auto-plan from the chosen date,
  // instead of just being a label.
  async function savePlan() {
    if (!planEquipment || !planForm.frequency || !planForm.startDate) return
    setSavingPlan(true)
    try {
      const freqWeeks = PM_FREQUENCY_WEEKS[planForm.frequency] || 4
      const { error: recErr } = await supabase.from('maintenance_pm_recurrence').insert([{
        equipment_id: planEquipment.id, frequency_weeks: freqWeeks, start_date: planForm.startDate, assigned_to: planForm.pic || null,
      }])
      if (recErr) throw recErr
      const rows = buildRecurrenceRows(planEquipment.id, freqWeeks, planForm.startDate, planForm.pic || null)
      const { error: upErr } = await supabase.from('maintenance_pm_schedule').upsert(rows, { onConflict: 'equipment_id,year,week_number' })
      if (upErr) throw upErr
      const { error: eqErr } = await supabase.from('maintenance_equipment').update({
        pm_frequency: planForm.frequency, pm_pic: planForm.pic || null,
      }).eq('id', planEquipment.id)
      if (eqErr) throw eqErr
      setPlanEquipment(null)
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSavingPlan(false)
    }
  }

  // "Undo" — stops the recurrence(s) generating further weeks for this
  // equipment and clears its Frequency/PIC columns. Past and already-
  // completed weeks stay on the calendar as history, but savePlan()
  // pre-generates up to ~2 years of FUTURE weeks up front (buildRecurrenceRows'
  // horizon) — leaving those un-cleared made "unplan" look like it silently
  // did nothing, since the grid kept showing nearly two years of yellow
  // "planned" cells. So this also un-plans every not-yet-completed week
  // from the current ISO week onward.
  async function undoPlan(eq: Equipment) {
    if (!confirm(`Stop ${eq.name}'s PM plan? This clears Frequency/PIC and un-plans any upcoming week that isn't completed yet. Past/completed weeks stay on the calendar as history.`)) return
    try {
      const toStop = recurrences.filter(r => r.equipment_id === eq.id)
      for (const r of toStop) {
        const { error } = await supabase.from('maintenance_pm_recurrence').delete().eq('id', r.id)
        if (error) throw error
      }
      const { error: eqErr } = await supabase.from('maintenance_equipment').update({ pm_frequency: null, pm_pic: null }).eq('id', eq.id)
      if (eqErr) throw eqErr
      const { error: futErr1 } = await supabase.from('maintenance_pm_schedule')
        .update({ planned: false }).eq('equipment_id', eq.id).is('completed_at', null).gt('year', realYear)
      if (futErr1) throw futErr1
      const { error: futErr2 } = await supabase.from('maintenance_pm_schedule')
        .update({ planned: false }).eq('equipment_id', eq.id).is('completed_at', null).eq('year', realYear).gte('week_number', realWeek)
      if (futErr2) throw futErr2
      await load()
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  function handleCellClick(equipmentId: number, weekNumber: number) {
    const row = pmRows.find(r => r.equipment_id === equipmentId && r.week_number === weekNumber)
    const isCurrent = viewYear === realYear && weekNumber === realWeek
    if (!canManage) {
      if (isCurrent && row?.planned) toggleCompleted(equipmentId, weekNumber)
      return
    }
    if (!row?.planned) { setPlanned(equipmentId, weekNumber, true); return }
    if (row.completed_at) { toggleCompleted(equipmentId, weekNumber); return }
    if (isCurrent) { toggleCompleted(equipmentId, weekNumber); return }
    setPlanned(equipmentId, weekNumber, false)
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

  // Merges a partial result patch for one checklist item, defaulting the
  // other fields to whatever's already there — used by all four item-type
  // input variants (ok_fault, yes_no, numeric, text) in the Fill In form.
  function setResultField(itemId: number, patch: Partial<{ result: string; qty: string; remark: string }>) {
    setResults(prev => ({ ...prev, [itemId]: { result: prev[itemId]?.result || '', qty: prev[itemId]?.qty || '', remark: prev[itemId]?.remark || '', ...patch } }))
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

  // One-click "mark done" for equipment due this week that has no
  // checklist template (nothing to fill in) — writes directly by
  // equipment/year/week rather than relying on local pmRows, since the
  // Outstanding list can be showing regardless of which year the grid is
  // currently browsing.
  async function markDueDone(eq: Equipment) {
    const { data, error } = await supabase.from('maintenance_pm_schedule')
      .update({ completed_at: new Date().toISOString() })
      .eq('equipment_id', eq.id).eq('year', realYear).eq('week_number', realWeek)
      .select('id, equipment_id, week_number, planned, completed_at, assigned_to').maybeSingle()
    if (error) { alert('Error: ' + error.message); return }
    setCurrentWeekDoneIds(prev => new Set(prev).add(eq.id))
    if (data && viewYear === realYear) setPmRows(prev => prev.map(r => r.id === data.id ? data : r))
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

      // "Result" only means something for ok_fault/yes_no items — numeric
      // and text items are included once they have a qty/remark to save,
      // with result stored as 'n/a' since there's no pass/fail concept.
      const rows = items.filter(it => {
        const r = results[it.id]
        if (!r) return false
        if (it.item_type === 'numeric') return !!r.qty
        if (it.item_type === 'text') return !!r.remark
        return !!r.result
      }).map(it => ({
        submission_id: sub.id,
        checklist_item_id: it.id,
        result: (it.item_type === 'numeric' || it.item_type === 'text') ? 'n/a' : results[it.id].result,
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

  // overrideFilter/autoExpandId let the PM grid's "C" badge (checklist
  // submitted for this equipment/week) jump straight into that submission's
  // detail, reusing this same modal instead of building a second one.
  async function openChecklistHistory(overrideFilter?: { status?: string; equipmentId?: string }, autoExpandId?: number) {
    const filter = { ...historyFilter, ...overrideFilter }
    setHistoryFilter(filter)
    setShowChecklistHistory(true)
    setExpandedHistoryId(null)
    setHistoryLoading(true)
    let q = supabase.from('maintenance_checklist_submissions')
      .select('*, maintenance_checklist_templates(name), maintenance_equipment(name)')
      .order('submission_date', { ascending: false }).order('id', { ascending: false }).limit(300)
    if (filter.status) q = q.eq('status', filter.status)
    if (filter.equipmentId) q = q.eq('equipment_id', Number(filter.equipmentId))
    const { data, error } = await q
    if (error) alert('Error: ' + error.message)
    const rows = (data as any) || []
    setHistorySubmissions(rows)
    setHistoryLoading(false)
    if (autoExpandId) {
      const sub = rows.find((s: Submission) => s.id === autoExpandId)
      if (sub) toggleHistoryExpand(sub)
    }
  }

  async function toggleHistoryExpand(sub: Submission) {
    if (expandedHistoryId === sub.id) { setExpandedHistoryId(null); return }
    setExpandedHistoryId(sub.id)
    setExpandedHistoryItems([])
    const { data, error } = await supabase.from('maintenance_checklist_submission_items')
      .select('result, qty, remark, maintenance_checklist_items(description, section_label)')
      .eq('submission_id', sub.id)
    if (error) { alert('Error: ' + error.message); return }
    setExpandedHistoryItems((data as any) || [])
  }

  const weeks = Array.from({ length: 52 }, (_, i) => i + 1)
  // Groups consecutive weeks under the month their Monday falls in, for the
  // header's month row (colSpan per group).
  const monthGroups: { month: string; span: number }[] = []
  for (const wk of weeks) {
    const label = mondayOfIsoWeek(viewYear, wk).toLocaleString('default', { month: 'short', timeZone: 'UTC' })
    const last = monthGroups[monthGroups.length - 1]
    if (last && last.month === label) last.span++
    else monthGroups.push({ month: label, span: 1 })
  }
  const grouped = items.reduce((acc: Record<string, Item[]>, it) => {
    const key = it.section_label || ''
    acc[key] = acc[key] || []
    acc[key].push(it)
    return acc
  }, {})

  const categories = [...new Set(equipment.map(e => e.category).filter(Boolean))].sort() as string[]
  const locations = [...new Set(equipment.map(e => e.location).filter(Boolean))].sort() as string[]
  const filteredEquipment = equipment.filter(e => {
    if (selectedCategories.size > 0 && !selectedCategories.has(e.category || '')) return false
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

  // Outstanding = planned for this week and not yet marked complete — the
  // "auto light up" list. Applies whether or not the equipment has a
  // checklist template: equipment with one is missing a filed submission
  // (or its schedule row just isn't completed yet); equipment without one
  // is only ever completed via the direct "Mark Done" action. Previously
  // this required a checklist template, so planned equipment without one
  // never prompted at all. Grouped by category so a technician can jump
  // straight to "Crane" -> click the model -> fill it, per the requested flow.
  const outstanding = equipment.filter(e =>
    currentWeekPlannedIds.has(e.id) && !currentWeekDoneIds.has(e.id)
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

  function cellLabel(equipmentId: number, wk: number) {
    const row = pmRows.find(r => r.equipment_id === equipmentId && r.week_number === wk)
    if (!row?.planned) return ''
    return row.completed_at ? 'Done' : 'Planned'
  }

  function exportCsv() {
    const header = ['Code', 'Equipment', 'Category', 'Location', ...weeks.map(wk => fmtShort(mondayOfIsoWeek(viewYear, wk)))]
    const lines = [header.map(h => `"${h}"`).join(',')]
    for (const eq of filteredEquipment) {
      const row = [eq.equip_code || '', eq.name, eq.category || '', eq.location || '', ...weeks.map(wk => cellLabel(eq.id, wk))]
      lines.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `PM_Schedule_${viewYear}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  // No PDF library — opens the current table in a new tab with print-
  // friendly styling and triggers the browser's print dialog, where "Save
  // as PDF" is a built-in destination on every major browser.
  function exportPdf() {
    const el = document.getElementById('pm-schedule-print-area')
    if (!el) return
    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) { alert('Please allow pop-ups for this site to export a PDF.'); return }
    w.document.write(`<!doctype html><html><head><title>PM Schedule - ${viewYear}</title><style>
      body{font-family:Arial,sans-serif;padding:16px;color:#111;}
      h1{font-size:16px;margin:0 0 12px;}
      table{border-collapse:collapse;width:100%;font-size:9px;}
      th,td{border:1px solid #ddd;padding:2px 4px;text-align:left;white-space:nowrap;}
      th{background:#f3f4f6;}
    </style></head><body><h1>PM Schedule — ${viewYear}</h1>${el.innerHTML}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }

  // Shared Frequency/PIC controls — used identically by Day, Week, and
  // Month views so all three stay in sync rather than duplicating the
  // open/save/cancel-plan logic per view.
  function FrequencyControl({ eq }: { eq: Equipment }) {
    if (!canManage) return <>{eq.pm_frequency || '-'}</>
    return (
      <select
        value={eq.pm_frequency || ''}
        onChange={e => e.target.value ? openPlan(eq, e.target.value) : undoPlan(eq)}
        className="border rounded px-1 py-0.5 text-[11px] bg-white w-24"
      >
        <option value="">-</option>
        {PM_FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
    )
  }
  function PicControl({ eq }: { eq: Equipment }) {
    if (!canManage) return <>{eq.pm_pic || '-'}</>
    return (
      <button onClick={() => openPlan(eq)} className="border rounded px-1.5 py-0.5 text-[11px] bg-white hover:bg-gray-50 w-20 text-left truncate" title="Click to set/change PIC">
        {eq.pm_pic || <span className="text-gray-400">Set PIC</span>}
      </button>
    )
  }

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
          <h2 className="text-sm font-bold text-red-800 flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4" /> PM Due This Week ({outstanding.length}) — not yet marked done</h2>
          <div className="space-y-3">
            {Object.entries(outstandingByCategory).map(([cat, eqs]) => (
              <div key={cat}>
                <div className="text-xs font-semibold text-red-700 uppercase mb-1.5">{cat}</div>
                <div className="flex flex-wrap gap-2">
                  {eqs.map(e => (
                    <button key={e.id} onClick={() => e.pm_checklist_template_id ? openFillForEquipment(e) : markDueDone(e)}
                      title={e.pm_checklist_template_id ? 'Click to fill in the checklist' : 'No checklist assigned — click to mark done'}
                      className="bg-white border border-red-300 text-red-800 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-100">
                      {e.name}
                      {!e.pm_checklist_template_id && <span className="ml-1.5 text-[10px] font-normal text-red-500">(mark done)</span>}
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
          {viewMode === 'day' ? (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setViewDay(d => new Date(d.getTime() - 86400000))} className="p-1 rounded hover:bg-white"><ChevronLeft className="w-4 h-4" /></button>
              <input type="date" value={toStr(viewDay)} onChange={e => e.target.value && setViewDay(new Date(e.target.value + 'T00:00:00'))} className="text-sm font-semibold px-1 bg-transparent border-0 focus:ring-0" />
              <button onClick={() => setViewDay(d => new Date(d.getTime() + 86400000))} className="p-1 rounded hover:bg-white"><ChevronRight className="w-4 h-4" /></button>
              <button onClick={() => setViewDay(new Date())} className="text-xs text-orange-600 font-medium px-2 hover:text-orange-700">Today</button>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setViewYear(y => y - 1)} className="p-1 rounded hover:bg-white"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-semibold px-1 w-12 text-center">{viewYear}</span>
              <button onClick={() => setViewYear(y => y + 1)} className="p-1 rounded hover:bg-white"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['day', 'week', 'month'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition ${viewMode === m ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>{m}</button>
            ))}
          </div>
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
        <div className="relative">
          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <button type="button" onClick={() => setShowCategoryPicker(v => !v)} className="border rounded-md px-3 py-2 text-sm bg-white w-36 text-left truncate">
            {selectedCategories.size === 0 ? 'All' : `${selectedCategories.size} selected`}
          </button>
          {showCategoryPicker && (
            <div className="absolute z-30 mt-1 bg-white border rounded-lg shadow-lg p-2 w-56 max-h-64 overflow-y-auto">
              {categories.map(c => (
                <label key={c} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 rounded cursor-pointer">
                  <input type="checkbox" checked={selectedCategories.has(c)} onChange={e => {
                    const next = new Set(selectedCategories)
                    if (e.target.checked) next.add(c); else next.delete(c)
                    setSelectedCategories(next)
                  }} className="w-4 h-4 accent-orange-600" />
                  {c}
                </label>
              ))}
              {categories.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">No categories yet.</p>}
              <div className="border-t mt-1 pt-1 flex justify-between px-2">
                <button onClick={() => setSelectedCategories(new Set())} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
                <button onClick={() => setShowCategoryPicker(false)} className="text-xs text-orange-600 font-medium hover:text-orange-700">Done</button>
              </div>
            </div>
          )}
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
        {(equipFilter.q || selectedCategories.size > 0 || equipFilter.location || equipFilter.condition) && (
          <button onClick={() => { setEquipFilter({ q: '', location: '', condition: '' }); setSelectedCategories(new Set()) }} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2">Clear</button>
        )}
        <span className="text-xs text-gray-400 ml-auto mr-2">{filteredEquipment.length} of {equipment.length}</span>
        <button onClick={exportCsv} className="text-sm bg-gray-100 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-200">Export to Excel</button>
        <button onClick={exportPdf} className="text-sm bg-gray-100 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-200">Export to PDF</button>
      </div>

      {viewMode === 'day' && (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-10">
          <p className="text-xs text-gray-500 px-3 pt-3">
            {viewDay.toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' '}&middot; ISO Week {dayWeek}, {dayYear}
            {toStr(viewDay) === toStr(today) ? <span className="ml-2 text-blue-600 font-semibold">Today</span> : null}
          </p>
          <table className="min-w-full text-xs mt-2">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase border-r">Equipment</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase border-r">Frequency</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase border-r">PIC</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase border-r">This Week's Status</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEquipment.map(eq => {
                const row = pmRows.find(r => r.equipment_id === eq.id && r.week_number === dayWeek)
                const planned = row?.planned
                const done = !!row?.completed_at
                const isCurrentWeek = dayYear === realYear && dayWeek === realWeek
                const clickable = canManage || (isCurrentWeek && planned)
                return (
                  <tr key={eq.id}>
                    <td className="px-3 py-1.5 font-medium border-r whitespace-nowrap">{eq.name}</td>
                    <td className="px-2 py-1 border-r whitespace-nowrap"><FrequencyControl eq={eq} /></td>
                    <td className="px-2 py-1 border-r whitespace-nowrap"><PicControl eq={eq} /></td>
                    <td className="px-2 py-1 border-r whitespace-nowrap">
                      {!planned ? <span className="text-gray-300">Not scheduled</span> :
                        done ? <span className="text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Done</span> :
                        <span className="text-yellow-600 font-semibold">Planned{row?.assigned_to ? ` — ${row.assigned_to}` : ''}</span>}
                      {yearSubmissionsMap[`${eq.id}-${dayWeek}`] && (
                        <button onClick={() => openChecklistHistory({ equipmentId: String(eq.id) }, yearSubmissionsMap[`${eq.id}-${dayWeek}`].id)}
                          title="Checklist submitted — click for detail"
                          className="ml-1.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-600 text-white text-[8px] font-bold hover:bg-blue-700 align-middle">C</button>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {clickable && (
                        <button onClick={() => handleCellClick(eq.id, dayWeek)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-2.5 py-1 rounded-lg">
                          {!planned ? 'Schedule' : done ? 'Undo Done' : 'Mark Done'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!loading && filteredEquipment.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">{equipment.length === 0 ? 'No equipment yet.' : 'No equipment matches these filters.'}</td></tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 px-3 py-2 border-t">Status reflects the whole ISO week ({fmtShort(mondayOfIsoWeek(dayYear, dayWeek))} onward) this date falls in — the schedule is planned at week granularity. Switch to Week view for the full-year grid.</p>
        </div>
      )}

      {viewMode === 'week' && (
      <div id="pm-schedule-print-area" className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-10 max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
        <table className="min-w-max text-xs">
          <thead>
            {/* sticky top-0 on every header cell so the week/equipment header
                stays visible while scrolling down a long equipment list; the
                corner cell is also sticky left-0 (see below), so it needs a
                higher z-index to stay above the plain top-sticky cells that
                scroll underneath it horizontally. Two stacked sticky rows
                (month, then date/week) — the second row's `top` has to equal
                the first row's rendered height or it scrolls out from under it. */}
            <tr>
              <th colSpan={3} className="sticky left-0 top-0 z-20 bg-gray-100 border-r"></th>
              {monthGroups.map((g, i) => (
                <th key={i} colSpan={g.span} className="sticky top-0 z-10 bg-gray-100 text-gray-500 text-[10px] font-semibold uppercase border-r py-1">{g.month}</th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 top-[22px] z-20 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500 uppercase border-r">Equipment</th>
              <th className="sticky top-[22px] z-10 bg-gray-50 px-2 py-2 text-left font-medium text-gray-500 uppercase border-r">Frequency</th>
              <th className="sticky top-[22px] z-10 bg-gray-50 px-2 py-2 text-left font-medium text-gray-500 uppercase border-r">PIC</th>
              {weeks.map(wk => {
                const isCurrent = viewYear === realYear && wk === realWeek
                return (
                  <th key={wk} className={`sticky top-[22px] z-10 px-1 py-1 font-normal border-r leading-tight ${isCurrent ? 'bg-blue-50 text-blue-700 font-bold' : 'bg-gray-50 text-gray-400'}`}>
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
                <td className="bg-white px-1.5 py-1 border-r whitespace-nowrap"><FrequencyControl eq={eq} /></td>
                <td className="bg-white px-1.5 py-1 border-r whitespace-nowrap"><PicControl eq={eq} /></td>
                {weeks.map(wk => {
                  const row = pmRows.find(r => r.equipment_id === eq.id && r.week_number === wk)
                  const planned = row?.planned
                  const done = !!row?.completed_at
                  const isCurrent = viewYear === realYear && wk === realWeek
                  const clickable = canManage || (isCurrent && planned)
                  const sub = yearSubmissionsMap[`${eq.id}-${wk}`]
                  const title = [planned ? `Week ${wk} — planned` : (canManage ? 'Click to schedule this week' : null), row?.assigned_to ? `Assigned: ${row.assigned_to}` : null, done ? 'Completed' : null, sub ? `Checklist ${sub.status}` : null].filter(Boolean).join(' · ')
                  return (
                    <td key={wk} className="border-r p-0.5">
                      <div className="relative w-5 h-5">
                        <button
                          title={title || undefined}
                          onClick={() => clickable && handleCellClick(eq.id, wk)}
                          disabled={!clickable}
                          className={`w-5 h-5 rounded ${done ? 'bg-green-500' : planned ? 'bg-yellow-300' : 'bg-gray-100'} ${clickable ? 'cursor-pointer hover:ring-1 hover:ring-blue-400' : ''} ${isCurrent && planned ? 'ring-1 ring-blue-400' : ''}`}
                        />
                        {sub && (
                          <button
                            onClick={e => { e.stopPropagation(); openChecklistHistory({ equipmentId: String(eq.id) }, sub.id) }}
                            title={`Checklist submitted (${sub.status}) — click for detail`}
                            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-blue-600 text-white text-[8px] font-bold flex items-center justify-center leading-none hover:bg-blue-700 shadow"
                          >C</button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
            {!loading && filteredEquipment.length === 0 && (
              <tr><td colSpan={55} className="px-3 py-6 text-center text-gray-400">{equipment.length === 0 ? 'No equipment yet.' : 'No equipment matches these filters.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {viewMode === 'month' && (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-10">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase border-r sticky left-0 bg-gray-50">Equipment</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase border-r">Frequency</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase border-r">PIC</th>
                {monthGroups.map((g, i) => (
                  <th key={i} className={`px-2 py-2 text-center font-medium uppercase border-r ${g.month === today.toLocaleString('default', { month: 'short', timeZone: 'UTC' }) && viewYear === realYear ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}>{g.month}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEquipment.map(eq => {
                let wkCursor = 1
                return (
                  <tr key={eq.id}>
                    <td className="px-3 py-1.5 font-medium border-r whitespace-nowrap sticky left-0 bg-white">{eq.name}</td>
                    <td className="px-2 py-1 border-r whitespace-nowrap"><FrequencyControl eq={eq} /></td>
                    <td className="px-2 py-1 border-r whitespace-nowrap"><PicControl eq={eq} /></td>
                    {monthGroups.map((g, i) => {
                      const monthWeeks = weeks.slice(wkCursor - 1, wkCursor - 1 + g.span)
                      wkCursor += g.span
                      const rows = monthWeeks.map(wk => pmRows.find(r => r.equipment_id === eq.id && r.week_number === wk)).filter(Boolean) as PmRow[]
                      const planned = rows.filter(r => r.planned)
                      const done = planned.filter(r => r.completed_at)
                      const label = planned.length === 0 ? '-' : `${done.length}/${planned.length}`
                      const color = planned.length === 0 ? 'text-gray-300' : done.length === planned.length ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'
                      return <td key={i} className={`px-2 py-1.5 text-center border-r ${color}`}>{label}</td>
                    })}
                  </tr>
                )
              })}
              {!loading && filteredEquipment.length === 0 && (
                <tr><td colSpan={15} className="px-3 py-6 text-center text-gray-400">{equipment.length === 0 ? 'No equipment yet.' : 'No equipment matches these filters.'}</td></tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 px-3 py-2 border-t">Done / Planned weeks per month. Switch to Week view to tick off an individual week.</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Checklist Templates</h2>
        <button onClick={() => openChecklistHistory()} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Checklist History</button>
      </div>
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
                            {(it.item_type === 'ok_fault' || it.item_type === 'yes_no') && (
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => setResultField(it.id, { result: it.item_type === 'yes_no' ? 'yes' : 'ok' })}
                                  className={`text-xs px-2 py-1 rounded ${['ok', 'yes'].includes(results[it.id]?.result || '') ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{it.item_type === 'yes_no' ? 'Yes' : 'OK'}</button>
                                <button type="button" onClick={() => setResultField(it.id, { result: it.item_type === 'yes_no' ? 'no' : 'fault' })}
                                  className={`text-xs px-2 py-1 rounded ${['fault', 'no'].includes(results[it.id]?.result || '') ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{it.item_type === 'yes_no' ? 'No' : 'Fault'}</button>
                              </div>
                            )}
                            {it.item_type === 'numeric' && (
                              <input type="number" step="any" placeholder="Reading" value={results[it.id]?.qty || ''} onChange={e => setResultField(it.id, { qty: e.target.value })} className="border rounded px-2 py-1 text-xs w-24" />
                            )}
                          </td>
                          <td className="py-1.5 pl-2">
                            <input placeholder={it.item_type === 'text' ? 'Notes' : 'Remark'} value={results[it.id]?.remark || ''} onChange={e => setResultField(it.id, { remark: e.target.value })} className="border rounded px-2 py-1 text-xs w-full" />
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

      {planEquipment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">PM Plan — {planEquipment.name}</h2>
              <button onClick={() => setPlanEquipment(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Frequency</label>
                <select value={planForm.frequency} onChange={e => setPlanForm({ ...planForm, frequency: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  {PM_FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                {planForm.frequency === 'Daily' && <p className="text-[11px] text-gray-400 mt-1">This grid plans by week, so Daily plans every week — the closest fit.</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Start From</label>
                <input required type="date" value={planForm.startDate} onChange={e => setPlanForm({ ...planForm, startDate: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">PIC</label>
                <select value={planForm.pic} onChange={e => setPlanForm({ ...planForm, pic: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">(Unassigned)</option>
                  {staff.map(s => <option key={s.name} value={s.name}>{s.name} ({s.role})</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">They'll see a reminder here and on the Dashboard during the week each occurrence falls in.</p>
              </div>
            </div>
            <div className="flex justify-between items-center gap-3 mt-5">
              {planEquipment.pm_frequency && (
                <button onClick={() => { const eq = planEquipment; setPlanEquipment(null); undoPlan(eq) }} className="text-red-600 text-sm font-medium hover:text-red-800 px-2 py-2">Cancel Plan</button>
              )}
              <div className="flex justify-end gap-3 ml-auto">
                <button onClick={() => setPlanEquipment(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Close</button>
                <button onClick={savePlan} disabled={savingPlan} className="bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700">{savingPlan ? 'Saving...' : 'Save Plan'}</button>
              </div>
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

      {showChecklistHistory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Checklist History</h2>
              <button onClick={() => setShowChecklistHistory(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select value={historyFilter.status} onChange={e => setHistoryFilter({ ...historyFilter, status: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-32">
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Equipment</label>
                <select value={historyFilter.equipmentId} onChange={e => setHistoryFilter({ ...historyFilter, equipmentId: e.target.value })} className="border rounded-md px-3 py-2 text-sm bg-white w-40">
                  <option value="">All</option>
                  {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                </select>
              </div>
              <button onClick={() => openChecklistHistory()} className="bg-orange-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-orange-700">Apply</button>
            </div>
            <div className="max-h-[28rem] overflow-y-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Done By</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historySubmissions.map(s => (
                    <>
                      <tr key={s.id} className="cursor-pointer hover:bg-gray-50" onClick={() => toggleHistoryExpand(s)}>
                        <td className="px-3 py-2 whitespace-nowrap">{s.submission_date}</td>
                        <td className="px-3 py-2">{s.maintenance_checklist_templates?.name || '-'}</td>
                        <td className="px-3 py-2">{s.maintenance_equipment?.name || '-'}</td>
                        <td className="px-3 py-2">{s.done_by || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${s.status === 'approved' ? 'bg-green-100 text-green-700' : s.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{s.status}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-400">{expandedHistoryId === s.id ? 'Hide ▲' : 'Details ▼'}</td>
                      </tr>
                      {expandedHistoryId === s.id && (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 bg-gray-50">
                            <div className="text-xs text-gray-500 mb-2 flex flex-wrap gap-x-4 gap-y-1">
                              <span>Verified by: {s.verified_by || '-'}</span>
                              <span>Approved/Actioned by: {s.approved_by || '-'}</span>
                              {s.status === 'rejected' && s.rejection_reason && <span className="text-red-600">Rejection reason: {s.rejection_reason}</span>}
                              {s.photo_drive_id && <a href={`/api/maintenance/file/${s.photo_drive_id}`} target="_blank" className="text-blue-600 hover:underline">View evidence photo</a>}
                            </div>
                            {expandedHistoryItems.length === 0 ? (
                              <p className="text-xs text-gray-400">No item-level results recorded for this submission.</p>
                            ) : (
                              <table className="min-w-full text-xs">
                                <tbody className="divide-y divide-gray-200">
                                  {expandedHistoryItems.map((it, i) => (
                                    <tr key={i}>
                                      <td className="py-1 pr-2 text-gray-400 w-28">{it.maintenance_checklist_items?.section_label || '-'}</td>
                                      <td className="py-1 pr-2">{it.maintenance_checklist_items?.description || '-'}</td>
                                      <td className="py-1 pr-2 w-16">
                                        <span className={`font-bold uppercase ${['ok', 'yes'].includes(it.result) ? 'text-green-600' : it.result === 'n/a' ? 'text-gray-400' : 'text-red-600'}`}>{it.result}</span>
                                      </td>
                                      <td className="py-1 pr-2 w-16">{it.qty ?? ''}</td>
                                      <td className="py-1 text-gray-500">{it.remark || ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {!historyLoading && historySubmissions.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No checklist submissions yet.</td></tr>
                  )}
                  {historyLoading && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">Shows the most recent 300 submissions matching the filters above — this is the permanent record of every checklist filed, whatever its approval status.</p>
          </div>
        </div>
      )}
    </div>
  )
}
