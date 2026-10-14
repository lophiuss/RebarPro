'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsManager } from '../guard'

const RATINGS = ['plus', 'plus_minus', 'minus'] as const

export async function saveAssessment(input: {
  person_id: string
  core_values: Record<string, string>
  gwc: { gets_it: boolean | null; wants_it: boolean | null; capacity: boolean | null }
  notes: string
}) {
  const { supabase, user } = await requireMeetingsManager()

  // Only the current core values and known rating codes are stored.
  const { data: settings } = await supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle()
  const allowed = new Set<string>(Array.isArray(settings?.core_values) ? settings.core_values : [])
  const coreValues: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.core_values ?? {})) {
    if (allowed.has(k) && (RATINGS as readonly string[]).includes(v)) coreValues[k] = v
  }
  const flag = (v: unknown) => (v === true || v === false ? v : null)

  const { error } = await supabase.from('mtg_rprs').insert({
    person_id: input.person_id,
    assessor_id: user.id,
    core_values: coreValues,
    gwc: { gets_it: flag(input.gwc?.gets_it), wants_it: flag(input.gwc?.wants_it), capacity: flag(input.gwc?.capacity) },
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
