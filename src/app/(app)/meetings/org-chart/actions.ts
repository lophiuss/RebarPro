'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsManager } from '../guard'

export async function saveSeat(input: {
  id?: string
  parent_id: string | null
  title: string
  subtitle: string
  roles: string[]
  people_ids: string[]
}) {
  const { supabase } = await requireMeetingsManager()
  const title = input.title.trim()
  if (!title) throw new Error('Seat title is required')
  const roles = input.roles.map(r => r.trim()).filter(Boolean).slice(0, 30)
  const parentId = input.parent_id || null

  let seatId = input.id
  if (seatId) {
    // Refuse to re-parent a seat under itself or one of its own descendants.
    if (parentId) {
      let cursor: string | null = parentId
      for (let hops = 0; cursor && hops < 100; hops++) {
        if (cursor === seatId) throw new Error('A seat cannot sit under itself or one of its own sub-seats')
        const res = await supabase.from('mtg_seats').select('parent_id').eq('id', cursor).maybeSingle()
        const row = res.data as { parent_id: string | null } | null
        cursor = row?.parent_id ?? null
      }
    }
    const { error } = await supabase
      .from('mtg_seats')
      .update({ title, subtitle: input.subtitle.trim() || null, roles, parent_id: parentId })
      .eq('id', seatId)
    if (error) throw error
  } else {
    let siblings = supabase.from('mtg_seats').select('id', { count: 'exact', head: true })
    siblings = parentId ? siblings.eq('parent_id', parentId) : siblings.is('parent_id', null)
    const { count } = await siblings
    const { data, error } = await supabase
      .from('mtg_seats')
      .insert({ title, subtitle: input.subtitle.trim() || null, roles, parent_id: parentId, position: count ?? 0 })
      .select('id')
      .single()
    if (error) throw error
    seatId = data.id as string
  }

  // Replace the seat's people.
  const { error: delErr } = await supabase.from('mtg_seat_people').delete().eq('seat_id', seatId)
  if (delErr) throw delErr
  const people = Array.from(new Set(input.people_ids))
  if (people.length) {
    const { error: insErr } = await supabase.from('mtg_seat_people').insert(people.map(user_id => ({ seat_id: seatId, user_id })))
    if (insErr) throw insErr
  }
  revalidatePath('/meetings/org-chart')
  revalidatePath('/meetings/direct-reports')
  return seatId as string
}

// Deleting a seat also deletes every seat beneath it (FK cascade).
export async function deleteSeat(id: string) {
  const { supabase } = await requireMeetingsManager()
  const { error } = await supabase.from('mtg_seats').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/meetings/org-chart')
  revalidatePath('/meetings/direct-reports')
}

// ---------------------------------------------------------------------------
// Moving seats around the chart
// ---------------------------------------------------------------------------

type Supa = Awaited<ReturnType<typeof requireMeetingsManager>>['supabase']

async function childrenOf(supabase: Supa, parentId: string | null) {
  let q = supabase.from('mtg_seats').select('id').order('position').order('id')
  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(r => r.id as string)
}

// Rewrites positions 0..n-1 in the given order (also tidies any duplicates).
async function renumber(supabase: Supa, ids: string[]) {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from('mtg_seats').update({ position: i }).eq('id', ids[i])
    if (error) throw error
  }
}

// left / right: swap with the neighbouring seat on the same row.
// up: move out to the parent's level, right after the parent.
// down: tuck under the seat beside it (the one before, else the one after).
export async function moveSeat(id: string, dir: 'left' | 'right' | 'up' | 'down') {
  const { supabase } = await requireMeetingsManager()
  const { data: seat } = await supabase.from('mtg_seats').select('id, parent_id').eq('id', id).maybeSingle()
  if (!seat) throw new Error('Seat not found')
  const parentId = (seat.parent_id as string | null) ?? null
  const siblings = await childrenOf(supabase, parentId)
  const idx = siblings.indexOf(id)

  if (dir === 'left' || dir === 'right') {
    const to = dir === 'left' ? idx - 1 : idx + 1
    if (to < 0 || to >= siblings.length) throw new Error(dir === 'left' ? 'Already the first seat in this row' : 'Already the last seat in this row')
    ;[siblings[idx], siblings[to]] = [siblings[to], siblings[idx]]
    await renumber(supabase, siblings)
  } else if (dir === 'up') {
    if (!parentId) throw new Error('This seat is already at the top level')
    const { data: parent } = await supabase.from('mtg_seats').select('id, parent_id').eq('id', parentId).maybeSingle()
    const grand = (parent?.parent_id as string | null) ?? null
    const { error } = await supabase.from('mtg_seats').update({ parent_id: grand }).eq('id', id)
    if (error) throw error
    const row = (await childrenOf(supabase, grand)).filter(x => x !== id)
    row.splice(row.indexOf(parentId) + 1, 0, id)
    await renumber(supabase, row)
    await renumber(supabase, siblings.filter(x => x !== id))
  } else {
    const target = siblings[idx - 1] ?? siblings[idx + 1]
    if (!target) throw new Error('There is no seat beside this one to move it under')
    const { error } = await supabase.from('mtg_seats').update({ parent_id: target }).eq('id', id)
    if (error) throw error
    await renumber(supabase, [...(await childrenOf(supabase, target)).filter(x => x !== id), id])
    await renumber(supabase, siblings.filter(x => x !== id))
  }
  revalidatePath('/meetings/org-chart')
  revalidatePath('/meetings/direct-reports')
}
