'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { askGemini, type ChatMessage, type Effort } from '@/lib/gemini'
import { buildGroundingSnapshot } from '@/lib/ai-helper-data'

export type Settings = { model: string; effort: Effort; system_instructions: string }
export type AllowedPerson = { id: string; email: string; full_name: string | null }

const BASE_INSTRUCTIONS = `You are AlphaVision's AI Helper, an internal assistant for a rebar inventory,
cement plant, and site security management system.

Hard rules — never break these:
- Only use facts found in the "DATA SNAPSHOT" JSON provided below. Never invent, estimate, or
  assume a number, name, or fact that isn't in that JSON.
- If something needed to answer isn't in the snapshot, say plainly that the data isn't available
  rather than guessing.
- If a section of the snapshot is marked as inaccessible (the user has no access to that
  department), say so instead of claiming there's no data for it.
- Simple forecasting/reasoning ON TOP of the given numbers (e.g. "at this usage rate, X days of
  stock remain") is fine, as long as the inputs are numbers actually present in the snapshot.
- Keep answers concise and operational — this is read by managers deciding what to act on today.`

async function requireAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: allowed } = await supabase.rpc('can_use_ai_helper')
  if (!allowed) throw new Error('Not authorized to use AI Helper')
  return { supabase, user }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: isAdmin } = await supabase.rpc('is_admin_anywhere')
  if (!isAdmin) throw new Error('Not authorized — admin only')
  return { supabase, user }
}

export async function amIAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.rpc('is_admin_anywhere')
  return !!data
}

export async function getSettings(): Promise<Settings> {
  const { supabase } = await requireAccess()
  const { data, error } = await supabase.from('ai_helper_settings').select('model, effort, system_instructions').eq('id', 1).single()
  if (error) throw error
  return data as Settings
}

export async function updateSettings(patch: Settings): Promise<void> {
  const { supabase, user } = await requireAdmin()
  const { error } = await supabase.from('ai_helper_settings').update({
    model: patch.model, effort: patch.effort, system_instructions: patch.system_instructions,
    updated_at: new Date().toISOString(), updated_by: user.email || null,
  }).eq('id', 1)
  if (error) throw error
}

export async function listAllowedPeople(): Promise<AllowedPerson[]> {
  const { supabase } = await requireAdmin()
  const [{ data: access }, admin] = await Promise.all([
    supabase.from('ai_helper_access').select('user_id, created_at'),
    Promise.resolve(createAdminClient()),
  ])
  const ids = (access || []).map(a => a.user_id)
  if (ids.length === 0) return []
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids)
  const nameById = new Map((profiles || []).map(p => [p.id, p.full_name]))
  return authList.users.filter(u => ids.includes(u.id)).map(u => ({ id: u.id, email: u.email ?? '(no email)', full_name: nameById.get(u.id) ?? null }))
}

export async function listAllPeople(): Promise<AllowedPerson[]> {
  const { supabase } = await requireAdmin()
  const admin = createAdminClient()
  const [{ data: authList }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from('profiles').select('id, full_name'),
  ])
  const nameById = new Map((profiles || []).map(p => [p.id, p.full_name]))
  return authList.users.map(u => ({ id: u.id, email: u.email ?? '(no email)', full_name: nameById.get(u.id) ?? null })).sort((a, b) => a.email.localeCompare(b.email))
}

export async function grantAccess(userId: string): Promise<void> {
  const { supabase, user } = await requireAdmin()
  const { error } = await supabase.from('ai_helper_access').upsert([{ user_id: userId, granted_by: user.email || null }])
  if (error) throw error
}

export async function revokeAccess(userId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('ai_helper_access').delete().eq('user_id', userId)
  if (error) throw error
}

export async function askAiHelper(messages: ChatMessage[]): Promise<string> {
  const { supabase, user } = await requireAccess()

  // The grounding snapshot is built with the CALLER's own session — RLS
  // means a department they don't have access to just comes back empty, so
  // we also record which departments they can actually see, and tell the
  // model explicitly, rather than letting it assume "empty" means "healthy".
  const { data: access } = await supabase.from('user_department_access').select('department').eq('user_id', user.id)
  const myDepartments = (access || []).map(a => a.department)

  const [snapshot, settings] = await Promise.all([
    buildGroundingSnapshot(supabase),
    getSettings(),
  ])

  const snapshotForModel = {
    ...snapshot,
    accessible_departments: myDepartments,
    rebar: myDepartments.includes('rebar') ? snapshot.rebar : { access: 'none — this user has no Rebar department access' },
    cement: myDepartments.includes('cement') ? snapshot.cement : { access: 'none — this user has no BPlant/Cement department access' },
    security: myDepartments.includes('security') ? snapshot.security : { access: 'none — this user has no Security department access' },
  }

  const systemInstruction = [
    BASE_INSTRUCTIONS,
    settings.system_instructions?.trim() ? `\nAdditional instructions from this organization's admin:\n${settings.system_instructions.trim()}` : '',
    `\n\nDATA SNAPSHOT (JSON):\n${JSON.stringify(snapshotForModel)}`,
  ].join('\n')

  return askGemini({ model: settings.model, effort: settings.effort, systemInstruction, messages })
}
