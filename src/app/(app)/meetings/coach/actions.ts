'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsAccess } from '../guard'

const MAX_BYTES = 3 * 1024 * 1024
const MAX_ITEMS = 6000

export async function createWhiteboard(input: { title: string; meeting_id: string | null }) {
  const { supabase, user } = await requireMeetingsAccess()
  const title = input.title.trim().slice(0, 120)
  if (!title) throw new Error('Give the whiteboard a name')
  const { data, error } = await supabase
    .from('mtg_whiteboards')
    .insert({ title, meeting_id: input.meeting_id || null, created_by: user.id, updated_by: user.id })
    .select('id')
    .single()
  if (error) throw error
  revalidatePath('/meetings/coach')
  return data.id as string
}

// Drawing data is plain JSON ({ items: [...] }). It is size-limited and each
// item is reduced to known fields, so only drawing primitives are ever stored.
export async function saveWhiteboard(id: string, data: { items: unknown[] }) {
  const { supabase, user } = await requireMeetingsAccess()
  const items = Array.isArray(data?.items) ? data.items.slice(0, MAX_ITEMS) : []
  const json = JSON.stringify({ items })
  if (json.length > MAX_BYTES) throw new Error('This whiteboard is too large to save. Remove some drawings.')
  const { error } = await supabase
    .from('mtg_whiteboards')
    .update({ data: JSON.parse(json), updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function renameWhiteboard(id: string, title: string) {
  const { supabase } = await requireMeetingsAccess()
  const t = title.trim().slice(0, 120)
  if (!t) throw new Error('Name cannot be empty')
  const { error } = await supabase.from('mtg_whiteboards').update({ title: t }).eq('id', id)
  if (error) throw error
  revalidatePath('/meetings/coach')
}

export async function deleteWhiteboard(id: string) {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: wb } = await supabase.from('mtg_whiteboards').select('created_by').eq('id', id).maybeSingle()
  if (!wb) return
  if (wb.created_by !== user.id) {
    const { data: access } = await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle()
    if (access?.role !== 'admin') throw new Error('Only the creator or a Meetings admin can delete this whiteboard')
  }
  const { error } = await supabase.from('mtg_whiteboards').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/meetings/coach')
}
