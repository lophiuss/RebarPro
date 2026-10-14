'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsAccess, requireMeetingsManager } from '../guard'
import { ONE_ON_ONE_QUESTIONS, type OneOnOneSide } from '@/lib/meetings'

const RATINGS = ['plus', 'plus_minus', 'minus']

export async function createOneOnOne(reportId: string, quarter: string) {
  const { supabase, user } = await requireMeetingsManager()
  if (reportId === user.id) throw new Error('Pick someone else')
  if (!/^\d{4}-Q[1-4]$/.test(quarter)) throw new Error('Invalid quarter')

  const { data: existing } = await supabase
    .from('mtg_one_on_ones')
    .select('id')
    .eq('manager_id', user.id)
    .eq('report_id', reportId)
    .eq('quarter', quarter)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data, error } = await supabase
    .from('mtg_one_on_ones')
    .insert({ manager_id: user.id, report_id: reportId, quarter })
    .select('id')
    .single()
  if (error) throw error
  revalidatePath('/meetings/one-on-one')
  return data.id as string
}

// Each participant can only write their own side of the conversation.
export async function saveOneOnOneAnswers(id: string, side: OneOnOneSide) {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: row, error } = await supabase
    .from('mtg_one_on_ones')
    .select('manager_id, report_id, answers, status')
    .eq('id', id)
    .single()
  if (error) throw error
  const who = row.manager_id === user.id ? 'manager' : row.report_id === user.id ? 'report' : null
  if (!who) throw new Error('Only the two participants can edit this conversation')
  if (row.status === 'complete') throw new Error('This conversation is marked complete. Ask the manager to reopen it.')

  const { data: settings } = await supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle()
  const allowedValues = new Set<string>(Array.isArray(settings?.core_values) ? settings.core_values : [])

  const clean: OneOnOneSide = {}
  for (const q of ONE_ON_ONE_QUESTIONS) {
    const v = side[q.id]
    if (q.type === 'text' && typeof v === 'string') clean[q.id] = v.slice(0, 4000)
    if (q.type === 'rating' && typeof v === 'number' && v >= 1 && v <= 10) clean[q.id] = Math.round(v)
  }
  const cv: Record<string, string> = {}
  for (const [k, v] of Object.entries(side.core_values ?? {})) if (allowedValues.has(k) && RATINGS.includes(v)) cv[k] = v
  clean.core_values = cv
  const flag = (x: unknown) => (x === true || x === false ? x : null)
  clean.gwc = { gets_it: flag(side.gwc?.gets_it), wants_it: flag(side.gwc?.wants_it), capacity: flag(side.gwc?.capacity) }

  const answers = { ...(row.answers as object), [who]: clean }
  const { error: upErr } = await supabase
    .from('mtg_one_on_ones')
    .update({ answers, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (upErr) throw upErr
  revalidatePath(`/meetings/one-on-one/${id}`)
  revalidatePath('/meetings/one-on-one')
}

export async function setOneOnOneStatus(id: string, status: 'draft' | 'complete') {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: row } = await supabase.from('mtg_one_on_ones').select('manager_id').eq('id', id).maybeSingle()
  if (!row || row.manager_id !== user.id) throw new Error('Only the manager can complete or reopen this conversation')
  const { error } = await supabase.from('mtg_one_on_ones').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  revalidatePath(`/meetings/one-on-one/${id}`)
  revalidatePath('/meetings/one-on-one')
}

export async function deleteOneOnOne(id: string) {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: row } = await supabase.from('mtg_one_on_ones').select('manager_id').eq('id', id).maybeSingle()
  if (!row || row.manager_id !== user.id) throw new Error('Only the manager can delete this conversation')
  const { error } = await supabase.from('mtg_one_on_ones').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/meetings/one-on-one')
}
