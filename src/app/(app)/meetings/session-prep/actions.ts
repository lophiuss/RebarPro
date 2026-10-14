'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsAccess, requireMeetingsManager } from '../guard'

type Question = { id: string; label: string; type: 'text' | 'rating' }

function cleanQuestions(input: { label: string; type: string }[]): Question[] {
  const out: Question[] = []
  input.forEach((q, i) => {
    const label = (q.label ?? '').trim().slice(0, 300)
    if (!label) return
    out.push({ id: `q${i + 1}`, label, type: q.type === 'rating' ? 'rating' : 'text' })
  })
  return out.slice(0, 25)
}

export async function savePrepDoc(input: { id?: string; name: string; questions: { label: string; type: string }[] }) {
  const { supabase, user } = await requireMeetingsManager()
  const name = input.name.trim()
  if (!name) throw new Error('Name is required')
  const questions = cleanQuestions(input.questions)
  if (questions.length === 0) throw new Error('Add at least one question')

  if (input.id) {
    const { error } = await supabase.from('mtg_prep_docs').update({ name, questions }).eq('id', input.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('mtg_prep_docs').insert({ name, questions, created_by: user.id })
    if (error) throw error
  }
  revalidatePath('/meetings/session-prep')
}

export async function deletePrepDoc(id: string) {
  const { supabase } = await requireMeetingsManager()
  const { error } = await supabase.from('mtg_prep_docs').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') throw new Error('This prep doc is attached to a meeting session and can no longer be deleted. Edit it instead.')
    throw error
  }
  revalidatePath('/meetings/session-prep')
}

export async function createPrepSession(input: { meeting_id: string; doc_id: string; due_date: string; add_todos: boolean }) {
  const { supabase, user } = await requireMeetingsAccess()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due_date)) throw new Error('Pick a due date')

  const [{ data: meeting }, { data: doc }, { data: attendees }] = await Promise.all([
    supabase.from('mtg_meetings').select('id, name, leader_id').eq('id', input.meeting_id).maybeSingle(),
    supabase.from('mtg_prep_docs').select('id, name').eq('id', input.doc_id).maybeSingle(),
    supabase.from('mtg_attendees').select('user_id').eq('meeting_id', input.meeting_id),
  ])
  if (!meeting) throw new Error('Meeting not found')
  if (!doc) throw new Error('Prep doc not found')
  const attendeeIds = (attendees ?? []).map(a => a.user_id as string)
  if (!attendeeIds.includes(user.id) && meeting.leader_id !== user.id) throw new Error('Only people in the meeting can assign a prep doc to it')

  const { data: session, error } = await supabase
    .from('mtg_prep_sessions')
    .insert({ meeting_id: input.meeting_id, doc_id: input.doc_id, due_date: input.due_date, created_by: user.id })
    .select('id')
    .single()
  if (error) throw error

  if (input.add_todos && attendeeIds.length) {
    const { error: todoErr } = await supabase.from('mtg_todos').insert(
      attendeeIds.map(owner_id => ({
        meeting_id: input.meeting_id,
        owner_id,
        title: `Complete session prep: ${doc.name}`,
        due_date: input.due_date,
        created_by: user.id,
      })),
    )
    if (todoErr) throw todoErr
  }
  revalidatePath('/meetings/session-prep')
  revalidatePath('/meetings/todos')
  revalidatePath('/meetings/workspace')
  return session.id as string
}

export async function deletePrepSession(id: string) {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: s } = await supabase.from('mtg_prep_sessions').select('created_by').eq('id', id).maybeSingle()
  if (!s) return
  if (s.created_by !== user.id) await requireMeetingsManager()
  const { error } = await supabase.from('mtg_prep_sessions').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/meetings/session-prep')
}

// Each person writes only their own response row.
export async function savePrepResponse(sessionId: string, answers: Record<string, unknown>, submit: boolean) {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: session } = await supabase
    .from('mtg_prep_sessions')
    .select('id, meeting_id, doc:mtg_prep_docs(questions)')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) throw new Error('Session not found')

  const { data: attendee } = await supabase
    .from('mtg_attendees')
    .select('user_id')
    .eq('meeting_id', session.meeting_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!attendee) throw new Error('Only attendees of this meeting can respond')

  const questions = ((session as any).doc?.questions ?? []) as Question[]
  const clean: Record<string, string | number> = {}
  for (const q of questions) {
    const v = answers[q.id]
    if (q.type === 'text' && typeof v === 'string' && v.trim()) clean[q.id] = v.trim().slice(0, 4000)
    if (q.type === 'rating' && typeof v === 'number' && v >= 1 && v <= 10) clean[q.id] = Math.round(v)
  }

  const { error } = await supabase.from('mtg_prep_responses').upsert({
    session_id: sessionId,
    user_id: user.id,
    answers: clean,
    submitted_at: submit ? new Date().toISOString() : null,
  })
  if (error) throw error
  revalidatePath(`/meetings/session-prep/${sessionId}`)
  revalidatePath('/meetings/session-prep')
}
