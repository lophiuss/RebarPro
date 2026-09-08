'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { askGeminiWithTools, type ChatMessage, type Effort } from '@/lib/gemini'
import { schemaReferenceText, queryDatabaseToolDeclaration, executeQueryDatabase } from '@/lib/ai-helper-tools'

export type Settings = {
  model: string; effort: Effort; system_instructions: string
  price_per_1m_input_tokens: number; price_per_1m_output_tokens: number
}
export type AllowedPerson = { id: string; email: string; full_name: string | null }
export type UsageSummary = {
  promptTokens: number; completionTokens: number; totalTokens: number; callCount: number; estimatedCost: number
}

const BASE_INSTRUCTIONS = `You are AlphaVision's AI Helper, an internal assistant for a rebar inventory,
cement plant, and site security management system.

You have a "query_database" tool that runs a real, live read-only query against one table and
returns the actual matching rows — there is no pre-built summary handed to you. Use it as many
times as you need before answering.

Hard rules — never break these:
- Never state a number, name, count, or fact you did not just get back from query_database.
  If you haven't queried for something, query for it before claiming it.
- If a query comes back with zero rows, that could mean there's genuinely no matching data, OR
  that this user's account doesn't have access to that department (has_dept_access RLS silently
  returns empty rather than an error). Say which is more likely rather than assuming "all clear".
- If something needed to answer truly isn't queryable with the tables you have, say so plainly
  rather than guessing.
- Simple reasoning ON TOP of real queried numbers (e.g. "at this rate, X days of stock remain")
  is fine — the inputs just have to be real.
- Keep answers concise and operational — this is read by managers deciding what to act on today.

SCHEMA REFERENCE (only these tables are queryable):
${schemaReferenceText()}`

async function requireAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: allowed } = await supabase.rpc('can_use_ai_helper')
  if (!allowed) throw new Error('Not authorized to use AI Helper')
  return { supabase, user }
}

// Managing AI Helper (settings + who-can-use-it) is deliberately narrower
// than "admin anywhere" — every department has its own separate admin
// account(s), and letting any one of them reconfigure a shared, cross-
// department AI assistant or grant/revoke everyone else's access to it was
// exactly the over-broad behavior reported and fixed here.
async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin')
  if (!isSuperAdmin) throw new Error('Not authorized — restricted to the app super admin')
  return { supabase, user }
}

export async function amISuperAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.rpc('is_super_admin')
  return !!data
}

export async function getSettings(): Promise<Settings> {
  const { supabase } = await requireAccess()
  const { data, error } = await supabase.from('ai_helper_settings')
    .select('model, effort, system_instructions, price_per_1m_input_tokens, price_per_1m_output_tokens').eq('id', 1).single()
  if (error) throw error
  return data as Settings
}

export async function updateSettings(patch: Settings): Promise<void> {
  const { supabase, user } = await requireSuperAdmin()
  const { error } = await supabase.from('ai_helper_settings').update({
    model: patch.model, effort: patch.effort, system_instructions: patch.system_instructions,
    price_per_1m_input_tokens: patch.price_per_1m_input_tokens, price_per_1m_output_tokens: patch.price_per_1m_output_tokens,
    updated_at: new Date().toISOString(), updated_by: user.email || null,
  }).eq('id', 1)
  if (error) throw error
}

// All-time totals — the superadmin-only "token/cost track" view. Cost is
// an estimate (tracked tokens × the configured $/1M rate above), not a
// real-time bill from Google.
export async function getUsageSummary(): Promise<UsageSummary> {
  const { supabase } = await requireSuperAdmin()
  const [{ data: rows, error }, settings] = await Promise.all([
    supabase.from('ai_helper_usage_log').select('prompt_tokens, completion_tokens, total_tokens'),
    getSettings(),
  ])
  if (error) throw error
  const promptTokens = (rows || []).reduce((s, r) => s + (r.prompt_tokens || 0), 0)
  const completionTokens = (rows || []).reduce((s, r) => s + (r.completion_tokens || 0), 0)
  const totalTokens = (rows || []).reduce((s, r) => s + (r.total_tokens || 0), 0)
  const estimatedCost = (promptTokens / 1_000_000) * settings.price_per_1m_input_tokens
    + (completionTokens / 1_000_000) * settings.price_per_1m_output_tokens
  return { promptTokens, completionTokens, totalTokens, callCount: (rows || []).length, estimatedCost }
}

export async function listAllowedPeople(): Promise<AllowedPerson[]> {
  const { supabase } = await requireSuperAdmin()
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
  const { supabase } = await requireSuperAdmin()
  const admin = createAdminClient()
  const [{ data: authList }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from('profiles').select('id, full_name'),
  ])
  const nameById = new Map((profiles || []).map(p => [p.id, p.full_name]))
  return authList.users.map(u => ({ id: u.id, email: u.email ?? '(no email)', full_name: nameById.get(u.id) ?? null })).sort((a, b) => a.email.localeCompare(b.email))
}

export async function grantAccess(userId: string): Promise<void> {
  const { supabase, user } = await requireSuperAdmin()
  const { error } = await supabase.from('ai_helper_access').upsert([{ user_id: userId, granted_by: user.email || null }])
  if (error) throw error
}

export async function revokeAccess(userId: string): Promise<void> {
  const { supabase } = await requireSuperAdmin()
  const { error } = await supabase.from('ai_helper_access').delete().eq('user_id', userId)
  if (error) throw error
}

export async function askAiHelper(messages: ChatMessage[]): Promise<string> {
  const { supabase, user } = await requireAccess()

  const [{ data: access }, settings] = await Promise.all([
    supabase.from('user_department_access').select('department').eq('user_id', user.id),
    getSettings(),
  ])
  const myDepartments = (access || []).map(a => a.department)

  const systemInstruction = [
    BASE_INSTRUCTIONS,
    `\nToday's date is ${new Date().toISOString().split('T')[0]}.`,
    `This user has access to these departments: ${myDepartments.join(', ') || '(none)'}.`,
    settings.system_instructions?.trim() ? `\nAdditional instructions from this organization's admin:\n${settings.system_instructions.trim()}` : '',
  ].join('\n')

  const result = await askGeminiWithTools({
    model: settings.model,
    effort: settings.effort,
    systemInstruction,
    messages,
    tools: [queryDatabaseToolDeclaration()],
    executeTool: async (name, args) => {
      if (name === 'query_database') return executeQueryDatabase(supabase, args)
      return { error: `Unknown tool: ${name}` }
    },
  })

  // Best-effort — a logging failure shouldn't take down an answer the user
  // already has.
  await supabase.from('ai_helper_usage_log').insert([{
    user_id: user.id, model: settings.model,
    prompt_tokens: result.usage.promptTokens, completion_tokens: result.usage.completionTokens, total_tokens: result.usage.totalTokens,
  }]).then(({ error }) => { if (error) console.error('ai_helper_usage_log insert failed:', error.message) })

  return result.text
}
