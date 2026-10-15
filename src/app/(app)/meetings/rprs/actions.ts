'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsManager } from '../guard'
import { downline, seatsBelow } from './scope'

const RATINGS = ['plus', 'plus_minus', 'minus'] as const
const DIMENSIONS = ['gets_it', 'wants_it', 'capacity'] as const
type Dimension = typeof DIMENSIONS[number]

async function loadOrg(supabase: Awaited<ReturnType<typeof requireMeetingsManager>>['supabase']) {
  const [{ data: seats }, { data: seatPeople }] = await Promise.all([
    supabase.from('mtg_seats').select('id, parent_id, title'),
    supabase.from('mtg_seat_people').select('seat_id, user_id'),
  ])
  return { seats: (seats ?? []) as any[], seatPeople: (seatPeople ?? []) as any[] }
}

// ---------------------------------------------------------------------------
// The criteria for a seat: what "Gets it / Wants it / Capacity" mean here, and
// the total score a person needs to pass. Written by the person's superior.
// ---------------------------------------------------------------------------
export async function saveSeatCriteria(input: {
  seat_id: string
  pass_score: number | null
  criteria: { id?: string; dimension: string; label: string }[]
}) {
  const { supabase, user, role } = await requireMeetingsManager()
  if (role !== 'admin') {
    const org = await loadOrg(supabase)
    if (!seatsBelow(org.seats, org.seatPeople, user.id).has(input.seat_id)) {
      throw new Error('You can only set the criteria for seats below yours on the org chart')
    }
  }

  const clean = input.criteria
    .map(c => ({ id: c.id, dimension: c.dimension as Dimension, label: String(c.label ?? '').trim().slice(0, 300) }))
    .filter(c => c.label && (DIMENSIONS as readonly string[]).includes(c.dimension))
    .slice(0, 60)
  if (clean.length === 0) throw new Error('Add at least one criterion')
  const max = clean.length * 2
  const pass = input.pass_score === null ? null : Math.round(Number(input.pass_score))
  if (pass !== null && (!Number.isFinite(pass) || pass < 0 || pass > max)) throw new Error(`The expected score must be between 0 and ${max}`)

  const { data: existing } = await supabase.from('mtg_gwc_criteria').select('id').eq('seat_id', input.seat_id)
  const keep = new Set(clean.map(c => c.id).filter(Boolean) as string[])
  const drop = (existing ?? []).map(e => e.id as string).filter(id => !keep.has(id))
  if (drop.length) {
    const { error } = await supabase.from('mtg_gwc_criteria').delete().in('id', drop)
    if (error) throw error
  }
  const known = new Set((existing ?? []).map(e => e.id as string))
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (c.id && known.has(c.id)) {
      const { error } = await supabase.from('mtg_gwc_criteria').update({ dimension: c.dimension, label: c.label, position: i }).eq('id', c.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('mtg_gwc_criteria').insert({ seat_id: input.seat_id, dimension: c.dimension, label: c.label, position: i, created_by: user.id })
      if (error) throw error
    }
  }
  const { error: seatErr } = await supabase.from('mtg_seats').update({ gwc_pass_score: pass }).eq('id', input.seat_id)
  if (seatErr) throw seatErr
  revalidatePath('/meetings/rprs')
}

// ---------------------------------------------------------------------------
// An assessment: every criterion scored good (2), so-so (1) or no (0). The
// scores are added up and compared with the seat's expected score.
// ---------------------------------------------------------------------------
export async function saveAssessment(input: {
  person_id: string
  seat_id: string
  scores: Record<string, number>
  core_values: Record<string, string>
  notes: string
}) {
  const { supabase, user, role } = await requireMeetingsManager()

  // A manager assesses the people in seats below their own; a Meetings admin (the boss) anyone.
  if (role !== 'admin') {
    const org = await loadOrg(supabase)
    const scope = downline(org.seats, org.seatPeople, user.id)
    if (!scope.has(input.person_id)) throw new Error('You can only assess people in seats below yours on the org chart')
  }
  const { data: holds } = await supabase.from('mtg_seat_people').select('seat_id').eq('seat_id', input.seat_id).eq('user_id', input.person_id).maybeSingle()
  if (!holds) throw new Error('That person does not hold this seat')

  const [{ data: criteria }, { data: seat }, { data: settings }] = await Promise.all([
    supabase.from('mtg_gwc_criteria').select('id, dimension, label, position').eq('seat_id', input.seat_id).order('position'),
    supabase.from('mtg_seats').select('title, gwc_pass_score').eq('id', input.seat_id).maybeSingle(),
    supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle(),
  ])
  if (!criteria || criteria.length === 0) throw new Error('Set the criteria for this seat first')

  const items = criteria.map(c => {
    const raw = input.scores?.[c.id as string]
    if (raw !== 0 && raw !== 1 && raw !== 2) throw new Error(`Score every criterion (missing: “${c.label}”)`)
    return { id: c.id as string, dimension: c.dimension as Dimension, label: c.label as string, score: raw as 0 | 1 | 2 }
  })
  const totals: Record<string, number> = { gets_it: 0, wants_it: 0, capacity: 0 }
  const maxes: Record<string, number> = { gets_it: 0, wants_it: 0, capacity: 0 }
  for (const i of items) { totals[i.dimension] += i.score; maxes[i.dimension] += 2 }
  const total = items.reduce((s, i) => s + i.score, 0)
  const max = items.length * 2
  // Without an expected score, 75% of the maximum is the pass mark.
  const pass = (seat?.gwc_pass_score as number | null) ?? Math.ceil(max * 0.75)

  const allowed = new Set<string>(Array.isArray(settings?.core_values) ? settings.core_values : [])
  const coreValues: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.core_values ?? {})) {
    if (allowed.has(k) && (RATINGS as readonly string[]).includes(v)) coreValues[k] = v
  }

  const { error } = await supabase.from('mtg_rprs').insert({
    person_id: input.person_id,
    assessor_id: user.id,
    core_values: coreValues,
    gwc: {
      scored: true, seat_id: input.seat_id, seat_title: seat?.title ?? null,
      items, totals: { ...totals, total, max, by_max: maxes }, pass_score: pass, passed: total >= pass,
      gets_it: null, wants_it: null, capacity: null,
    },
    notes: input.notes.trim().slice(0, 4000) || null,
  })
  if (error) throw error
  revalidatePath('/meetings/rprs')
}

export async function deleteAssessment(id: string) {
  const { supabase } = await requireMeetingsManager()
  const { error } = await supabase.from('mtg_rprs').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/meetings/rprs')
}
