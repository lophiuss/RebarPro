'use server'

import { revalidatePath } from 'next/cache'
import { PAGE_TYPES, type PageType, type IssueStatus, type Cadence } from '@/lib/meetings'
import { requireMeetingsAccess, requireMeetingsAdmin } from './guard'
import { insertMeeting } from './meetingFactory'

function refresh(meetingId?: string) {
  revalidatePath('/meetings')
  revalidatePath('/meetings/workspace')
  revalidatePath('/meetings/todos')
  if (meetingId) revalidatePath(`/meetings/${meetingId}`)
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export async function createMeeting(input: {
  name: string
  description?: string
  leader_id: string | null
  attendee_ids: string[]
}) {
  const { supabase, user } = await requireMeetingsAccess()
  const id = await insertMeeting(supabase, user.id, input)
  refresh()
  return id
}

export async function setMeetingAttendees(meetingId: string, userIds: string[]) {
  const { supabase } = await requireMeetingsAccess()
  const { data: current } = await supabase.from('mtg_attendees').select('user_id').eq('meeting_id', meetingId)
  const have = new Set((current ?? []).map(c => c.user_id as string))
  const want = new Set(userIds)
  const toAdd = [...want].filter(id => !have.has(id))
  const toRemove = [...have].filter(id => !want.has(id))
  if (toAdd.length) {
    const { error } = await supabase.from('mtg_attendees').insert(toAdd.map(user_id => ({ meeting_id: meetingId, user_id })))
    if (error) throw error
  }
  if (toRemove.length) {
    const { error } = await supabase.from('mtg_attendees').delete().eq('meeting_id', meetingId).in('user_id', toRemove)
    if (error) throw error
  }
  refresh(meetingId)
}

export async function toggleFavourite(meetingId: string) {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: row } = await supabase
    .from('mtg_attendees')
    .select('is_favourite')
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) throw new Error('You are not an attendee of this meeting')
  const { error } = await supabase
    .from('mtg_attendees')
    .update({ is_favourite: !row.is_favourite })
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
  if (error) throw error
  refresh()
}

// Per-meeting settings: name, description, leader and the agenda for this meeting.
export async function updateMeeting(meetingId: string, input: {
  name: string
  description: string
  leader_id: string | null
  agenda: { id: string; title: string; minutes: number }[]
}) {
  const { supabase } = await requireMeetingsAccess()
  const name = input.name.trim()
  if (!name) throw new Error('Meeting name is required')

  const { error } = await supabase
    .from('mtg_meetings')
    .update({ name: name.slice(0, 120), description: input.description.trim().slice(0, 500) || null, leader_id: input.leader_id })
    .eq('id', meetingId)
  if (error) throw error

  // The leader is always an attendee.
  if (input.leader_id) {
    await supabase.from('mtg_attendees').upsert({ meeting_id: meetingId, user_id: input.leader_id }, { onConflict: 'meeting_id,user_id', ignoreDuplicates: true })
  }

  // Agenda order follows the array order; only titles/minutes of existing items change.
  for (let i = 0; i < input.agenda.length; i++) {
    const a = input.agenda[i]
    const { error: agErr } = await supabase
      .from('mtg_agenda_items')
      .update({ title: a.title.trim().slice(0, 60) || 'Untitled', minutes: Math.max(0, Math.round(a.minutes || 0)), position: i })
      .eq('id', a.id)
      .eq('meeting_id', meetingId)
    if (agErr) throw agErr
  }
  refresh(meetingId)
}

export async function archiveMeeting(meetingId: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_meetings').update({ is_archived: true }).eq('id', meetingId)
  if (error) throw error
  refresh(meetingId)
}

// ---------------------------------------------------------------------------
// Live run
// ---------------------------------------------------------------------------

export async function startMeeting(meetingId: string) {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: existing } = await supabase
    .from('mtg_runs')
    .select('id')
    .eq('meeting_id', meetingId)
    .is('ended_at', null)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data: run, error } = await supabase
    .from('mtg_runs')
    .insert({ meeting_id: meetingId, leader_id: user.id, current_page: 'CHECK_IN' })
    .select('id')
    .single()
  if (error) throw error
  refresh(meetingId)
  return run.id as string
}

async function requireRunLeader(runId: string) {
  const ctx = await requireMeetingsAccess()
  const { data: run, error } = await ctx.supabase
    .from('mtg_runs')
    .select('id, meeting_id, leader_id, ended_at')
    .eq('id', runId)
    .single()
  if (error) throw error
  if (run.ended_at) throw new Error('This meeting has already been concluded')
  if (run.leader_id !== ctx.user.id) {
    const { data: access } = await ctx.supabase
      .from('user_department_access')
      .select('role')
      .eq('user_id', ctx.user.id)
      .eq('department', 'meetings')
      .maybeSingle()
    if (access?.role !== 'admin') throw new Error('Only the meeting leader can do this')
  }
  return { ...ctx, run }
}

// Leader moves the meeting to another agenda page; page_seconds carries the
// running time per page so late joiners see the same timers.
export async function setRunPage(runId: string, page: PageType, pageSeconds: Record<string, number>) {
  const { supabase } = await requireRunLeader(runId)
  if (!PAGE_TYPES.includes(page)) throw new Error('Unknown agenda page')
  const { error } = await supabase
    .from('mtg_runs')
    .update({ current_page: page, page_seconds: pageSeconds })
    .eq('id', runId)
  if (error) throw error
}

export async function saveRunNotes(runId: string, notes: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_runs').update({ notes }).eq('id', runId).is('ended_at', null)
  if (error) throw error
}

export async function saveRating(runId: string, rating: number | null, feedback: string) {
  const { supabase, user } = await requireMeetingsAccess()
  if (rating !== null && (rating < 1 || rating > 10)) throw new Error('Rating must be 1-10')
  const { error } = await supabase
    .from('mtg_ratings')
    .upsert({ run_id: runId, user_id: user.id, rating, feedback: feedback.trim() || null })
  if (error) throw error
}

export async function revealRatings(runId: string) {
  const { supabase, run } = await requireRunLeader(runId)
  const { error } = await supabase.from('mtg_runs').update({ ratings_revealed: true }).eq('id', runId)
  if (error) throw error
  refresh(run.meeting_id)
}

export async function concludeMeeting(runId: string, opts: { archiveTodos: boolean; archiveHeadlines: boolean; pageSeconds: Record<string, number> }) {
  const { supabase, run } = await requireRunLeader(runId)
  const meetingId = run.meeting_id as string
  const now = new Date().toISOString()

  const [{ data: ratings }, { data: headlines }, { data: todos }, { data: issues }, { data: goals }, { data: runRow }] = await Promise.all([
    supabase.from('mtg_ratings').select('user_id, rating, feedback').eq('run_id', runId),
    supabase.from('mtg_headlines').select('id, title, owner_id').eq('meeting_id', meetingId).is('archived_at', null),
    supabase.from('mtg_todos').select('id, title, owner_id, due_date, done_at, run_id').eq('meeting_id', meetingId).is('archived_at', null),
    supabase.from('mtg_issues').select('id, title, status, solved_run_id').eq('meeting_id', meetingId),
    supabase.from('mtg_goals').select('id, title, status, owner_id').eq('meeting_id', meetingId),
    supabase.from('mtg_runs').select('notes, started_at').eq('id', runId).single(),
  ])

  const rated = (ratings ?? []).filter(r => r.rating != null)
  const average = rated.length ? rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length : null

  const snapshot = {
    started_at: runRow?.started_at ?? null,
    ended_at: now,
    notes: runRow?.notes ?? '',
    page_seconds: opts.pageSeconds,
    ratings: ratings ?? [],
    headlines: headlines ?? [],
    todos_created: (todos ?? []).filter(t => t.run_id === runId),
    todos_completed: (todos ?? []).filter(t => t.done_at),
    todos_open: (todos ?? []).filter(t => !t.done_at),
    issues_solved: (issues ?? []).filter(i => i.solved_run_id === runId),
    goals: goals ?? [],
  }

  const { data: summary, error: sumErr } = await supabase
    .from('mtg_summaries')
    .insert({ run_id: runId, meeting_id: meetingId, average_rating: average, snapshot })
    .select('id')
    .single()
  if (sumErr) throw sumErr

  if (opts.archiveTodos) {
    await supabase.from('mtg_todos').update({ archived_at: now }).eq('meeting_id', meetingId).is('archived_at', null).not('done_at', 'is', null)
  }
  if (opts.archiveHeadlines) {
    await supabase.from('mtg_headlines').update({ archived_at: now }).eq('meeting_id', meetingId).is('archived_at', null)
  }

  const { error } = await supabase
    .from('mtg_runs')
    .update({ ended_at: now, page_seconds: opts.pageSeconds, ratings_revealed: true })
    .eq('id', runId)
  if (error) throw error
  refresh(meetingId)
  return summary.id as string
}

// ---------------------------------------------------------------------------
// Headlines
// ---------------------------------------------------------------------------

export async function addHeadline(meetingId: string, title: string, ownerId: string | null) {
  const { supabase, user } = await requireMeetingsAccess()
  if (!title.trim()) throw new Error('Headline cannot be empty')
  const { error } = await supabase
    .from('mtg_headlines')
    .insert({ meeting_id: meetingId, title: title.trim(), owner_id: ownerId || user.id })
  if (error) throw error
  refresh(meetingId)
}

export async function deleteHeadline(meetingId: string, id: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_headlines').delete().eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

export async function addTodo(meetingId: string, input: { title: string; owner_id: string | null; due_date: string | null; run_id?: string | null }) {
  const { supabase, user } = await requireMeetingsAccess()
  if (!input.title.trim()) throw new Error('To-do cannot be empty')
  // Default deadline: 7 days out (the "tip of the week" convention).
  const due = input.due_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const { error } = await supabase.from('mtg_todos').insert({
    meeting_id: meetingId,
    run_id: input.run_id ?? null,
    title: input.title.trim(),
    owner_id: input.owner_id || user.id,
    due_date: due,
    created_by: user.id,
  })
  if (error) throw error
  refresh(meetingId)
}

export async function setTodoDone(meetingId: string, id: string, done: boolean) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_todos').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

export async function deleteTodo(meetingId: string, id: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_todos').delete().eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export async function addIssue(meetingId: string, title: string, ownerId: string | null) {
  const { supabase, user } = await requireMeetingsAccess()
  if (!title.trim()) throw new Error('Issue cannot be empty')
  const { error } = await supabase
    .from('mtg_issues')
    .insert({ meeting_id: meetingId, title: title.trim(), owner_id: ownerId || user.id, created_by: user.id })
  if (error) throw error
  refresh(meetingId)
}

export async function setIssueStatus(meetingId: string, id: string, status: IssueStatus, runId?: string | null) {
  const { supabase } = await requireMeetingsAccess()
  const patch: Record<string, unknown> = { status }
  if (status === 'solved') {
    patch.solved_at = new Date().toISOString()
    patch.solved_run_id = runId ?? null
  } else {
    patch.solved_at = null
    patch.solved_run_id = null
  }
  const { error } = await supabase.from('mtg_issues').update(patch).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

export async function deleteIssue(meetingId: string, id: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_issues').delete().eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// ---------------------------------------------------------------------------
// Quarterly priorities
// ---------------------------------------------------------------------------

export async function addGoal(meetingId: string, input: { title: string; owner_id: string | null; due_date: string | null; milestones: string[] }) {
  const { supabase, user } = await requireMeetingsAccess()
  if (!input.title.trim()) throw new Error('Priority cannot be empty')
  const { error } = await supabase.from('mtg_goals').insert({
    meeting_id: meetingId,
    title: input.title.trim(),
    owner_id: input.owner_id || user.id,
    due_date: input.due_date || null,
    milestones: input.milestones.filter(m => m.trim()).map(m => ({ title: m.trim(), done: false })),
  })
  if (error) throw error
  refresh(meetingId)
}

export async function setGoalStatus(meetingId: string, id: string, status: 'on' | 'off' | 'done') {
  const { supabase } = await requireMeetingsAccess()
  // completed_at feeds the Direct reports progress charts.
  const { error } = await supabase
    .from('mtg_goals')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

export async function toggleGoalMilestone(meetingId: string, id: string, index: number) {
  const { supabase } = await requireMeetingsAccess()
  const { data: goal, error } = await supabase.from('mtg_goals').select('milestones').eq('id', id).single()
  if (error) throw error
  const milestones = Array.isArray(goal.milestones) ? [...goal.milestones] : []
  if (!milestones[index]) return
  const nowDone = !milestones[index].done
  milestones[index] = { ...milestones[index], done: nowDone, done_at: nowDone ? new Date().toISOString() : null }
  const { error: upErr } = await supabase.from('mtg_goals').update({ milestones }).eq('id', id)
  if (upErr) throw upErr
  refresh(meetingId)
}

export async function deleteGoal(meetingId: string, id: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_goals').delete().eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export async function addKpi(meetingId: string, input: { name: string; cadence: Cadence; target: number | null; unit: string; owner_id: string | null }) {
  const { supabase, user } = await requireMeetingsAccess()
  if (!input.name.trim()) throw new Error('KPI name is required')
  const { count } = await supabase.from('mtg_kpis').select('id', { count: 'exact', head: true }).eq('meeting_id', meetingId)
  const { error } = await supabase.from('mtg_kpis').insert({
    meeting_id: meetingId,
    name: input.name.trim(),
    cadence: input.cadence,
    target: input.target,
    unit: input.unit.trim() || null,
    owner_id: input.owner_id || user.id,
    position: count ?? 0,
  })
  if (error) throw error
  refresh(meetingId)
}

export async function setKpiValue(meetingId: string, kpiId: string, periodStart: string, value: number | null) {
  const { supabase } = await requireMeetingsAccess()
  if (value === null) {
    const { error } = await supabase.from('mtg_kpi_values').delete().eq('kpi_id', kpiId).eq('period_start', periodStart)
    if (error) throw error
  } else {
    const { error } = await supabase.from('mtg_kpi_values').upsert({ kpi_id: kpiId, period_start: periodStart, value })
    if (error) throw error
  }
  refresh(meetingId)
}

export async function deleteKpi(meetingId: string, id: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_kpis').delete().eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// ---------------------------------------------------------------------------
// Inline edits
// ---------------------------------------------------------------------------

const text = (v: string, max = 500) => {
  const t = v.trim().slice(0, max)
  if (!t) throw new Error('Text cannot be empty')
  return t
}

export async function updateTodo(meetingId: string, id: string, patch: { title?: string; due_date?: string | null; owner_id?: string | null }) {
  const { supabase } = await requireMeetingsAccess()
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = text(patch.title)
  if (patch.due_date !== undefined) update.due_date = patch.due_date || null
  if (patch.owner_id !== undefined) update.owner_id = patch.owner_id
  const { error } = await supabase.from('mtg_todos').update(update).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

export async function updateHeadline(meetingId: string, id: string, patch: { title?: string; owner_id?: string | null }) {
  const { supabase } = await requireMeetingsAccess()
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = text(patch.title)
  if (patch.owner_id !== undefined) update.owner_id = patch.owner_id
  const { error } = await supabase.from('mtg_headlines').update(update).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

export async function updateIssue(meetingId: string, id: string, patch: { title?: string; owner_id?: string | null }) {
  const { supabase } = await requireMeetingsAccess()
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = text(patch.title)
  if (patch.owner_id !== undefined) update.owner_id = patch.owner_id
  const { error } = await supabase.from('mtg_issues').update(update).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

export async function updateGoal(meetingId: string, id: string, patch: { title?: string; due_date?: string | null; owner_id?: string | null }) {
  const { supabase } = await requireMeetingsAccess()
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = text(patch.title)
  if (patch.due_date !== undefined) update.due_date = patch.due_date || null
  if (patch.owner_id !== undefined) update.owner_id = patch.owner_id
  const { error } = await supabase.from('mtg_goals').update(update).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// ---------------------------------------------------------------------------
// Private notes (row-private: RLS limits every query to the caller's own rows)
// ---------------------------------------------------------------------------

export async function addPrivateNote(body: string) {
  const { supabase, user } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_private_notes').insert({ user_id: user.id, body: body.trim() })
  if (error) throw error
  refresh()
}

export async function updatePrivateNote(id: string, body: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase
    .from('mtg_private_notes')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  refresh()
}

export async function deletePrivateNote(id: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_private_notes').delete().eq('id', id)
  if (error) throw error
  refresh()
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function saveCoreValues(values: string[]) {
  const { supabase } = await requireMeetingsAdmin()
  const clean = values.map(v => v.trim()).filter(Boolean)
  const { error } = await supabase
    .from('mtg_settings')
    .update({ core_values: clean, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
  refresh()
  revalidatePath('/meetings/settings')
}

export async function saveDefaultAgenda(agenda: { page_type: PageType; title: string; minutes: number }[]) {
  const { supabase } = await requireMeetingsAdmin()
  const clean = agenda
    .filter(a => PAGE_TYPES.includes(a.page_type))
    .map(a => ({ page_type: a.page_type, title: a.title.trim() || a.page_type, minutes: Math.max(0, Math.round(a.minutes || 0)) }))
  const { error } = await supabase
    .from('mtg_settings')
    .update({ default_agenda: clean, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
  revalidatePath('/meetings/settings')
}
