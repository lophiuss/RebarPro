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
