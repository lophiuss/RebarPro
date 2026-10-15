'use server'

import { revalidatePath } from 'next/cache'
import { PAGE_TYPES, UNIT_TYPES, GOAL_RULES, type PageType, type IssueStatus, type Cadence, type GoalRule, type UnitType, type TodoStatus } from '@/lib/meetings'
import { sanitizeRich } from '@/lib/richtext'
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
  schedule?: { days: number[]; time: string; every: number; anchor?: string } | null
}) {
  const { supabase } = await requireMeetingsAccess()
  const name = input.name.trim()
  if (!name) throw new Error('Meeting name is required')

  // Weekly days + time; `anchor` fixes which weeks count for "every 2 weeks".
  const days = Array.from(new Set((input.schedule?.days ?? []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6)))
  const every = Math.min(4, Math.max(1, Math.round(input.schedule?.every ?? 1)))
  const time = /^\d{2}:\d{2}$/.test(input.schedule?.time ?? '') ? (input.schedule?.time as string) : ''
  const schedule = days.length ? { days, time, every, anchor: /^\d{4}-\d{2}-\d{2}$/.test(input.schedule?.anchor ?? '') ? (input.schedule?.anchor as string) : new Date().toISOString().slice(0, 10) } : null
  const { error } = await supabase
    .from('mtg_meetings')
    .update({ name: name.slice(0, 120), description: input.description.trim().slice(0, 500) || null, leader_id: input.leader_id, schedule })
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

// The meeting's own icebreaker ideas, one per line (the Check-in page draws from them).
export async function saveIcebreakerNotes(meetingId: string, notes: string) {
  const { supabase } = await requireMeetingsAccess()
  const clean = notes.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 500).map(l => l.slice(0, 300)).join('\n')
  const { error } = await supabase.from('mtg_meetings').update({ icebreaker_notes: clean || null }).eq('id', meetingId)
  if (error) throw error
  revalidatePath(`/meetings/${meetingId}`)
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

// Everyone rates for themselves. The meeting leader (or a Meetings admin) can
// also enter a rating on behalf of any attendee, e.g. someone without a phone.
export async function saveRating(runId: string, rating: number | null, feedback: string, forUserId?: string) {
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) throw new Error('Rating must be 1-10')
  const note = feedback.trim().slice(0, 1000) || null

  if (forUserId) {
    const { supabase, user, run } = await requireRunLeader(runId)
    if (forUserId !== user.id) {
      const { data: attendee } = await supabase
        .from('mtg_attendees')
        .select('user_id')
        .eq('meeting_id', run.meeting_id)
        .eq('user_id', forUserId)
        .maybeSingle()
      if (!attendee) throw new Error('That person is not an attendee of this meeting')
    }
    const { error } = await supabase.from('mtg_ratings').upsert({ run_id: runId, user_id: forUserId, rating, feedback: note })
    if (error) throw error
    return
  }

  const { supabase, user } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_ratings').upsert({ run_id: runId, user_id: user.id, rating, feedback: note })
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

  const [{ data: ratings }, { data: headlines }, { data: todos }, { data: issues }, { data: goals }, { data: runRow }, { data: attendees }, { data: kpiLinks }] = await Promise.all([
    supabase.from('mtg_ratings').select('user_id, rating, feedback').eq('run_id', runId),
    supabase.from('mtg_headlines').select('id, title, details, owner_id').eq('meeting_id', meetingId).is('archived_at', null),
    supabase.from('mtg_todos').select('id, title, details, owner_id, due_date, done_at, run_id, status').eq('meeting_id', meetingId).is('archived_at', null),
    supabase.from('mtg_issues').select('id, title, details, owner_id, status, solved_run_id').eq('meeting_id', meetingId),
    supabase.from('mtg_goals').select('id, title, details, status, owner_id, due_date, milestones').eq('meeting_id', meetingId),
    supabase.from('mtg_runs').select('notes, started_at, attendance').eq('id', runId).single(),
    supabase.from('mtg_attendees').select('user_id, profile:profiles(full_name)').eq('meeting_id', meetingId),
    supabase.from('mtg_kpi_meetings').select('kpi:mtg_kpis(id, name, owner_id, cadence, unit_type, goal_rule, goal_value, goal_value_max)').eq('meeting_id', meetingId),
  ])

  const rated = (ratings ?? []).filter(r => r.rating != null)
  const average = rated.length ? rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length : null

  // Who was there, as ticked on the Check-in page.
  const attendanceMap = (runRow?.attendance ?? {}) as Record<string, boolean>
  const attendance = (attendees ?? []).map((a: any) => ({
    user_id: a.user_id as string,
    name: (a.profile?.full_name as string | null) ?? null,
    present: !!attendanceMap[a.user_id],
  }))

  // KPI scorecard: each KPI with its most recent values, so the report is
  // self-contained even if the KPI is later edited.
  const kpis = (kpiLinks ?? []).map((l: any) => l.kpi).filter(Boolean) as any[]
  let kpiSnapshot: any[] = []
  if (kpis.length) {
    const { data: vals } = await supabase
      .from('mtg_kpi_values')
      .select('kpi_id, period_start, value')
      .in('kpi_id', kpis.map(k => k.id))
      .order('period_start', { ascending: false })
      .limit(500)
    kpiSnapshot = kpis.map(k => ({
      ...k,
      values: (vals ?? []).filter(v => v.kpi_id === k.id).slice(0, 6).map(v => ({ period_start: v.period_start, value: v.value })),
    }))
  }

  const snapshot = {
    started_at: runRow?.started_at ?? null,
    ended_at: now,
    notes: runRow?.notes ?? '',
    page_seconds: opts.pageSeconds,
    ratings: ratings ?? [],
    attendance,
    headlines: headlines ?? [],
    todos_created: (todos ?? []).filter(t => t.run_id === runId),
    todos_completed: (todos ?? []).filter(t => t.done_at),
    todos_open: (todos ?? []).filter(t => !t.done_at),
    issues_solved: (issues ?? []).filter(i => i.solved_run_id === runId),
    issues_open: (issues ?? []).filter(i => i.status === 'short_term' || i.status === 'parking_lot'),
    goals: goals ?? [],
    kpis: kpiSnapshot,
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

export async function addTodo(meetingId: string, input: { title: string; owner_id: string | null; due_date: string | null; run_id?: string | null; status?: TodoStatus }) {
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
    // Added straight into a board column (To do, In progress, Blocked or Done).
    ...(input.status && ['todo', 'in_progress', 'blocked', 'done'].includes(input.status)
      ? { status: input.status, done_at: input.status === 'done' ? new Date().toISOString() : null }
      : {}),
  })
  if (error) throw error
  refresh(meetingId)
}

export async function setTodoDone(meetingId: string, id: string, done: boolean) {
  const { supabase } = await requireMeetingsAccess()
  // `status` is the board column; ticking the box and the Done column are one thing.
  const { error } = await supabase
    .from('mtg_todos')
    .update({ done_at: done ? new Date().toISOString() : null, status: done ? 'done' : 'todo' })
    .eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// Kanban: moving a card between columns. Done also stamps done_at (and any
// other column clears it), so list view and board view always agree.
export async function setTodoStatus(meetingId: string, id: string, status: TodoStatus) {
  const { supabase } = await requireMeetingsAccess()
  if (!['todo', 'in_progress', 'blocked', 'done'].includes(status)) throw new Error('Unknown status')
  const { error } = await supabase
    .from('mtg_todos')
    .update({ status, done_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id)
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

// Moves an issue to another meeting's short-term list. The original stays in
// this meeting as "Sent" so there is a record of where it went.
export async function sendIssue(meetingId: string, id: string, targetMeetingId: string) {
  const { supabase, user } = await requireMeetingsAccess()
  if (targetMeetingId === meetingId) throw new Error('Pick a different meeting')

  const [{ data: issue }, { data: target }] = await Promise.all([
    supabase.from('mtg_issues').select('title, details, owner_id, status').eq('id', id).eq('meeting_id', meetingId).maybeSingle(),
    supabase.from('mtg_meetings').select('id').eq('id', targetMeetingId).eq('is_archived', false).maybeSingle(),
  ])
  if (!issue) throw new Error('Issue not found')
  if (!target) throw new Error('Target meeting not found')
  if (issue.status === 'sent') throw new Error('This issue was already sent')

  const { error: insErr } = await supabase.from('mtg_issues').insert({
    meeting_id: targetMeetingId,
    title: issue.title,
    details: issue.details,
    owner_id: issue.owner_id,
    status: 'short_term',
    created_by: user.id,
  })
  if (insErr) throw insErr
  const { error } = await supabase.from('mtg_issues').update({ status: 'sent', solved_at: null, solved_run_id: null }).eq('id', id)
  if (error) throw error
  refresh(meetingId)
  refresh(targetMeetingId)
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

type KpiGoalInput = { goal_rule: GoalRule; goal_value: number | null; goal_value_max: number | null }

function cleanGoal(g: KpiGoalInput): KpiGoalInput {
  if (!GOAL_RULES.some(r => r.key === g.goal_rule)) throw new Error('Unknown goal rule')
  const num = (v: number | null) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))
  const value = num(g.goal_value)
  const max = g.goal_rule === 'between' ? num(g.goal_value_max) : null
  if (g.goal_rule === 'between' && (value === null || max === null)) throw new Error('"Between" needs a low and a high value')
  return { goal_rule: g.goal_rule, goal_value: value, goal_value_max: max }
}

export async function addKpi(meetingId: string, input: {
  name: string; cadence: Cadence; unit_type: UnitType; owner_id: string | null
} & KpiGoalInput) {
  const { supabase, user } = await requireMeetingsAccess()
  if (!input.name.trim()) throw new Error('KPI name is required')
  if (!UNIT_TYPES.some(u => u.key === input.unit_type)) throw new Error('Unknown unit')
  const goal = cleanGoal(input)
  const { count } = await supabase.from('mtg_kpis').select('id', { count: 'exact', head: true }).eq('meeting_id', meetingId)
  const { data: kpi, error } = await supabase
    .from('mtg_kpis')
    .insert({
      meeting_id: meetingId,
      name: input.name.trim().slice(0, 150),
      cadence: input.cadence,
      unit_type: input.unit_type,
      ...goal,
      owner_id: input.owner_id || user.id,
      position: count ?? 0,
    })
    .select('id')
    .single()
  if (error) throw error
  const { error: linkErr } = await supabase.from('mtg_kpi_meetings').insert({ kpi_id: kpi.id, meeting_id: meetingId })
  if (linkErr) throw linkErr
  refresh(meetingId)
}

export async function updateKpi(meetingId: string, id: string, patch: {
  name?: string; details?: string | null; cadence?: Cadence; unit_type?: UnitType; owner_id?: string | null
} & Partial<KpiGoalInput>) {
  const { supabase } = await requireMeetingsAccess()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = text(patch.name, 150)
  if (patch.details !== undefined) update.details = sanitizeRich(patch.details) || null
  if (patch.cadence !== undefined) update.cadence = patch.cadence
  if (patch.owner_id !== undefined) update.owner_id = patch.owner_id || null
  if (patch.unit_type !== undefined) {
    if (!UNIT_TYPES.some(u => u.key === patch.unit_type)) throw new Error('Unknown unit')
    update.unit_type = patch.unit_type
  }
  if (patch.goal_rule !== undefined) {
    Object.assign(update, cleanGoal({
      goal_rule: patch.goal_rule,
      goal_value: patch.goal_value ?? null,
      goal_value_max: patch.goal_value_max ?? null,
    }))
  }
  const { error } = await supabase.from('mtg_kpis').update(update).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// "Attach to meeting(s)": the full list of meetings this KPI appears in.
export async function setKpiMeetings(meetingId: string, kpiId: string, meetingIds: string[]) {
  const { supabase } = await requireMeetingsAccess()
  const want = Array.from(new Set(meetingIds))
  if (want.length === 0) throw new Error('A KPI must stay attached to at least one meeting')
  const { data: current } = await supabase.from('mtg_kpi_meetings').select('meeting_id').eq('kpi_id', kpiId)
  const have = new Set((current ?? []).map(c => c.meeting_id as string))
  const toAdd = want.filter(id => !have.has(id))
  const toRemove = [...have].filter(id => !want.includes(id))
  if (toAdd.length) {
    const { error } = await supabase.from('mtg_kpi_meetings').insert(toAdd.map(meeting_id => ({ kpi_id: kpiId, meeting_id })))
    if (error) throw error
  }
  if (toRemove.length) {
    const { error } = await supabase.from('mtg_kpi_meetings').delete().eq('kpi_id', kpiId).in('meeting_id', toRemove)
    if (error) throw error
  }
  // Keep the primary meeting pointing at one the KPI is still attached to.
  await supabase.from('mtg_kpis').update({ meeting_id: want.includes(meetingId) ? meetingId : want[0] }).eq('id', kpiId)
  refresh(meetingId)
  toAdd.concat(toRemove).forEach(id => refresh(id))
}

// A custom goal replaces the KPI's normal goal for one period.
export async function setKpiCustomGoal(meetingId: string, kpiId: string, periodStart: string, goal: KpiGoalInput) {
  const { supabase } = await requireMeetingsAccess()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) throw new Error('Pick a period')
  const { error } = await supabase.from('mtg_kpi_goals').upsert({ kpi_id: kpiId, period_start: periodStart, ...cleanGoal(goal) })
  if (error) throw error
  refresh(meetingId)
}

export async function deleteKpiCustomGoal(meetingId: string, kpiId: string, periodStart: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_kpi_goals').delete().eq('kpi_id', kpiId).eq('period_start', periodStart)
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

type ItemPatch = { title?: string; details?: string | null; owner_id?: string | null; due_date?: string | null }

// Shared by every item type. Only the fields present in `patch` change.
function buildUpdate(patch: ItemPatch, allowed: { due: boolean }) {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = text(patch.title)
  // Details are rich text: cleaned here so only safe formatting is ever stored.
  if (patch.details !== undefined) update.details = sanitizeRich(patch.details) || null
  if (patch.owner_id !== undefined) update.owner_id = patch.owner_id || null
  if (allowed.due && patch.due_date !== undefined) update.due_date = patch.due_date || null
  return update
}

export async function updateTodo(meetingId: string, id: string, patch: ItemPatch) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_todos').update(buildUpdate(patch, { due: true })).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

export async function updateHeadline(meetingId: string, id: string, patch: ItemPatch) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_headlines').update(buildUpdate(patch, { due: false })).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

export async function updateIssue(meetingId: string, id: string, patch: ItemPatch) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_issues').update(buildUpdate(patch, { due: true })).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

export async function updateGoal(meetingId: string, id: string, patch: ItemPatch) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from('mtg_goals').update(buildUpdate(patch, { due: true })).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// ---------------------------------------------------------------------------
// Moving, escalating and archiving items (the item drawer)
// ---------------------------------------------------------------------------

type ItemKind = 'todo' | 'headline' | 'issue' | 'goal'
const TABLE: Record<ItemKind, 'mtg_todos' | 'mtg_headlines' | 'mtg_issues' | 'mtg_goals'> = {
  todo: 'mtg_todos', headline: 'mtg_headlines', issue: 'mtg_issues', goal: 'mtg_goals',
}
const KIND_LABEL: Record<ItemKind, string> = { todo: 'to-do', headline: 'headline', issue: 'issue', goal: 'priority' }

async function requireOpenMeeting(supabase: Awaited<ReturnType<typeof requireMeetingsAccess>>['supabase'], meetingId: string) {
  const { data } = await supabase.from('mtg_meetings').select('id, name').eq('id', meetingId).eq('is_archived', false).maybeSingle()
  if (!data) throw new Error('That meeting was not found')
  return data as { id: string; name: string }
}

// "Attach to meeting": moves the item itself to another meeting.
export async function moveItem(kind: ItemKind, id: string, fromMeetingId: string, toMeetingId: string) {
  const { supabase } = await requireMeetingsAccess()
  if (fromMeetingId === toMeetingId) return
  await requireOpenMeeting(supabase, toMeetingId)
  const patch: Record<string, unknown> = { meeting_id: toMeetingId }
  // A moved item no longer belongs to a live run of the old meeting.
  if (kind === 'todo') patch.run_id = null
  if (kind === 'issue') patch.solved_run_id = null
  const { error } = await supabase.from(TABLE[kind]).update(patch).eq('id', id).eq('meeting_id', fromMeetingId)
  if (error) throw error
  refresh(fromMeetingId)
  refresh(toMeetingId)
}

// Escalate: raises the item as a new short-term issue in another meeting. The
// original stays where it is (an issue is marked Sent instead), and the new
// issue says where it came from.
export async function escalateItem(kind: ItemKind, id: string, fromMeetingId: string, toMeetingId: string) {
  if (kind === 'issue') return sendIssue(fromMeetingId, id, toMeetingId)
  const { supabase, user } = await requireMeetingsAccess()
  if (fromMeetingId === toMeetingId) throw new Error('Pick a different meeting')
  const [{ data: item }, source] = await Promise.all([
    supabase.from(TABLE[kind]).select('title, details, owner_id').eq('id', id).eq('meeting_id', fromMeetingId).maybeSingle(),
    requireOpenMeeting(supabase, fromMeetingId).catch(() => ({ id: fromMeetingId, name: 'another meeting' })),
    requireOpenMeeting(supabase, toMeetingId),
  ])
  if (!item) throw new Error('Item not found')
  const origin = `Escalated from ${source.name} (${KIND_LABEL[kind]})`
  const { error } = await supabase.from('mtg_issues').insert({
    meeting_id: toMeetingId,
    title: item.title,
    details: sanitizeRich(`<p>${origin}</p>${item.details ?? ''}`) || null,
    owner_id: item.owner_id,
    status: 'short_term',
    created_by: user.id,
  })
  if (error) throw error
  refresh(fromMeetingId)
  refresh(toMeetingId)
}

// Copy to meeting: the same kind of item, duplicated into another meeting. The
// original is untouched.
export async function copyItem(kind: ItemKind, id: string, fromMeetingId: string, toMeetingId: string) {
  const { supabase, user } = await requireMeetingsAccess()
  if (fromMeetingId === toMeetingId) throw new Error('Pick a different meeting')
  await requireOpenMeeting(supabase, toMeetingId)

  const { data: item } = await supabase
    .from(TABLE[kind])
    .select(kind === 'todo' || kind === 'goal' ? '*' : 'title, details, owner_id')
    .eq('id', id)
    .eq('meeting_id', fromMeetingId)
    .maybeSingle()
  if (!item) throw new Error('Item not found')
  const src = item as unknown as { title: string; details: string | null; owner_id: string | null; due_date?: string | null; milestones?: { title: string }[] }

  const row: Record<string, unknown> = {
    meeting_id: toMeetingId,
    title: src.title,
    details: src.details,
    owner_id: src.owner_id,
    created_by: user.id,
  }
  if (kind === 'todo') row.due_date = src.due_date ?? null
  if (kind === 'issue') row.status = 'short_term'
  if (kind === 'goal') {
    // A copied priority starts fresh: on track, no milestones ticked.
    delete row.created_by
    row.due_date = src.due_date ?? null
    row.status = 'on'
    row.milestones = (src.milestones ?? []).map(m => ({ title: m.title, done: false }))
  }
  const { error } = await supabase.from(TABLE[kind]).insert(row)
  if (error) throw error
  refresh(toMeetingId)
}

// Headline -> to-do / issue, in the same meeting (like Bloom's "convert"). The
// headline is archived once it has been turned into something actionable.
export async function convertHeadline(meetingId: string, headlineId: string, to: 'todo' | 'issue') {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: h } = await supabase
    .from('mtg_headlines')
    .select('title, details, owner_id')
    .eq('id', headlineId)
    .eq('meeting_id', meetingId)
    .maybeSingle()
  if (!h) throw new Error('Headline not found')

  if (to === 'todo') {
    const due = new Date()
    due.setDate(due.getDate() + 7)
    const { data: run } = await supabase.from('mtg_runs').select('id').eq('meeting_id', meetingId).is('ended_at', null).maybeSingle()
    const { error } = await supabase.from('mtg_todos').insert({
      meeting_id: meetingId,
      run_id: run?.id ?? null,
      title: h.title,
      details: h.details,
      owner_id: h.owner_id ?? user.id,
      due_date: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`,
      created_by: user.id,
    })
    if (error) throw error
  } else {
    const { error } = await supabase.from('mtg_issues').insert({
      meeting_id: meetingId,
      title: h.title,
      details: h.details,
      owner_id: h.owner_id ?? user.id,
      status: 'short_term',
      created_by: user.id,
    })
    if (error) throw error
  }
  const { error: archErr } = await supabase.from('mtg_headlines').update({ archived_at: new Date().toISOString() }).eq('id', headlineId)
  if (archErr) throw archErr
  refresh(meetingId)
}

// Creates a to-do or issue from a draft the person has just reviewed and edited
// (from a headline, or from a KPI number). The source stays untouched: a
// headline remains as the record of what was said. `source.headlineId` links the
// new item back to it.
export async function createLinkedItem(
  meetingId: string,
  to: 'todo' | 'issue',
  input: { title: string; details: string | null; owner_id: string | null; due_date: string | null },
  source?: { headlineId?: string },
) {
  const { supabase, user } = await requireMeetingsAccess()
  const title = text(input.title, 300)
  const details = sanitizeRich(input.details) || null
  const link = source?.headlineId ? { source_headline_id: source.headlineId } : {}
  if (source?.headlineId) {
    const { data: h } = await supabase.from('mtg_headlines').select('id').eq('id', source.headlineId).eq('meeting_id', meetingId).maybeSingle()
    if (!h) throw new Error('Headline not found')
  }

  if (to === 'todo') {
    const due = input.due_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const { data: run } = await supabase.from('mtg_runs').select('id').eq('meeting_id', meetingId).is('ended_at', null).maybeSingle()
    const { error } = await supabase.from('mtg_todos').insert({
      meeting_id: meetingId, run_id: run?.id ?? null, title, details,
      owner_id: input.owner_id || user.id, due_date: due, created_by: user.id, ...link,
    })
    if (error) throw error
  } else {
    const { error } = await supabase.from('mtg_issues').insert({
      meeting_id: meetingId, title, details, status: 'short_term',
      owner_id: input.owner_id || user.id, due_date: input.due_date || null, created_by: user.id, ...link,
    })
    if (error) throw error
  }
  refresh(meetingId)
}

// Replaces a priority's milestone list (add / rename / reorder / remove / tick).
export async function setGoalMilestones(meetingId: string, id: string, milestones: { title: string; done: boolean; done_at?: string | null }[]) {
  const { supabase } = await requireMeetingsAccess()
  const { data: current } = await supabase.from('mtg_goals').select('milestones').eq('id', id).maybeSingle()
  const before = new Map<string, string | null>(
    (Array.isArray(current?.milestones) ? current.milestones : []).map((m: any) => [String(m.title), (m.done_at as string | null) ?? null]),
  )
  const now = new Date().toISOString()
  const clean = milestones
    .map(m => ({ title: String(m.title ?? '').trim().slice(0, 200), done: !!m.done }))
    .filter(m => m.title)
    .slice(0, 50)
    // done_at feeds the Direct reports chart: keep the original time, stamp new completions.
    .map(m => ({ ...m, done_at: m.done ? before.get(m.title) ?? now : null }))
  const { error } = await supabase.from('mtg_goals').update({ milestones: clean }).eq('id', id)
  if (error) throw error
  refresh(meetingId)
}

// Check-in attendance for a live meeting.
export async function setAttendance(runId: string, userId: string, present: boolean) {
  const { supabase } = await requireMeetingsAccess()
  const { data: run } = await supabase.from('mtg_runs').select('meeting_id, attendance, ended_at').eq('id', runId).maybeSingle()
  if (!run || run.ended_at) throw new Error('This meeting is not running')
  const attendance = { ...((run.attendance ?? {}) as Record<string, boolean>), [userId]: present }
  const { error } = await supabase.from('mtg_runs').update({ attendance }).eq('id', runId)
  if (error) throw error
  refresh(run.meeting_id as string)
}

// Personal settings (own rows only, enforced by RLS): workspace layout etc.
export async function savePref(key: string, value: unknown) {
  const { supabase, user } = await requireMeetingsAccess()
  if (!/^[a-z0-9_.-]{1,60}$/i.test(key)) throw new Error('Invalid setting name')
  const json = JSON.stringify(value ?? {})
  if (json.length > 20000) throw new Error('Setting is too large')
  const { error } = await supabase
    .from('mtg_user_prefs')
    .upsert({ user_id: user.id, key, value: JSON.parse(json), updated_at: new Date().toISOString() })
  if (error) throw error
}

// Archive = take it off the live list but keep it (shows in the Archive tab).
export async function archiveItem(kind: 'todo' | 'headline', id: string, meetingId: string) {
  const { supabase } = await requireMeetingsAccess()
  const { error } = await supabase.from(TABLE[kind]).update({ archived_at: new Date().toISOString() }).eq('id', id)
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
