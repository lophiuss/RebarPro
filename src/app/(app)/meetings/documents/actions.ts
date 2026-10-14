'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsAccess, requireMeetingsManager } from '../guard'

// Only http(s) links are stored, so a document can never carry a javascript:
// or data: URL that would run when someone clicks it.
function cleanUrl(raw: string) {
  const v = raw.trim()
  if (!v) return null
  let u: URL
  try { u = new URL(v) } catch { throw new Error('Enter a full link starting with https://') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) links are allowed')
  return u.toString()
}

export async function addDocument(input: { title: string; description: string; url: string; category: string; meeting_id: string | null }) {
  const { supabase, user } = await requireMeetingsAccess()
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')
  const { error } = await supabase.from('mtg_documents').insert({
    title: title.slice(0, 200),
    description: input.description.trim().slice(0, 2000) || null,
    url: cleanUrl(input.url),
    category: input.category.trim().slice(0, 60) || null,
    meeting_id: input.meeting_id || null,
    created_by: user.id,
  })
  if (error) throw error
  revalidatePath('/meetings/documents')
}

export async function deleteDocument(id: string) {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: doc } = await supabase.from('mtg_documents').select('created_by').eq('id', id).maybeSingle()
  if (!doc) return
  if (doc.created_by !== user.id) await requireMeetingsManager()
  const { error } = await supabase.from('mtg_documents').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/meetings/documents')
}
