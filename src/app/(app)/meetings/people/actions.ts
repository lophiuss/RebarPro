'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsAdmin } from '../guard'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function saveContactEmail(contactId: string, email: string) {
  const { supabase } = await requireMeetingsAdmin()
  const clean = email.trim().toLowerCase()
  if (clean && !EMAIL.test(clean)) throw new Error('That does not look like an e-mail address')
  const { error } = await supabase.from('mtg_contacts').update({ email: clean || null }).eq('id', contactId).is('user_id', null)
  if (error) throw error
  revalidatePath('/meetings/people')
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

// Pasted list, one person per line: "Name, email" or "Name <email>" or "Name<TAB>email".
// Matches each line to a contact by name and saves the e-mail. Returns what it did.
export async function importEmails(text: string) {
  const { supabase } = await requireMeetingsAdmin()
  const { data: contacts } = await supabase.from('mtg_contacts').select('id, full_name, user_id')
  const byName = new Map((contacts ?? []).map(c => [norm(c.full_name as string), c]))
  const saved: string[] = [], unmatched: string[] = [], already: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(.*?)[\s,;\t<(]+([^\s,;<>()]+@[^\s,;<>()]+)[>)]?\s*$/)
    if (!m) { unmatched.push(line); continue }
    const name = m[1].trim(), email = m[2].trim().toLowerCase()
    const c = byName.get(norm(name))
    if (!c || !EMAIL.test(email)) { unmatched.push(line); continue }
    if (c.user_id) { already.push(name); continue }
    const { error } = await supabase.from('mtg_contacts').update({ email }).eq('id', c.id)
    if (error) throw error
    saved.push(name)
  }
  revalidatePath('/meetings/people')
  return { saved, unmatched, already }
}
