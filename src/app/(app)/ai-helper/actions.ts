'use server'

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
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

const BASE_INSTRUCTIONS = `You are AlphaVision's AI Helper, an internal assistant for a precast operation's management system:
1. Rebar inventory (transactions, sizes, stock takes, projects)
2. Cement batching & BPlant (silo balances, weight-in/out, deliveries, usage, transfers, alerts)
3. Equipment maintenance (equipment registry, inspections, job reports, work requests, checklists, spare parts, critical issues)
4. Site security (visitor/vehicle gate entries, guard shifts, GPS patrol checkpoints, keys registry, incidents)
5. Precast moulds (mould assets, jobs/work orders, steel weight, technician time allocation, month locks)
6. Workforce & HR (PlantPro: workers roster, attendance timesheets, supervisor OT planning, hostel facilities & stays, documents expiry like passports/permits, monthly targets & claims)
7. Team meetings & Strategy (weekly meetings, to-dos, personal to-dos, issues, headlines, KPIs, quarterly priorities, org chart seats, RPRS assessments)
8. QAQC Testing & Billing (concrete cube compressive tests, testing catalogue, test reports, batch PO/Invoice assignment, credit notes, testing targets)

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
- Simple reasoning ON TOP of real queried numbers (e.g. "at this rate, X days of stock remain", "Y tests are overdue for reports")
  is fine — the inputs just have to be real.
- Salary, wage, pay-rate and deduction data is confidential to HR and admin. Follow the access
  statement below about this user exactly; never work backwards to an individual's pay from other figures.
- In meetings data, an item's owner is owner_id (a login) or, for people without a login here, owner_name.
  A to-do is overdue when it is not completed (done_at null), not archived, and due_date is before today.
- In QAQC data, a test is pending its lab report when report_no is null. A test is pending billing/payment when payment_status is 'Pending' or po_no / invoice_no is null.
- Keep answers concise, clear, and operational — this is read by factory directors and managers deciding what to act on today.

SCHEMA REFERENCE (only these tables are queryable):
${schemaReferenceText()}`

async function requireAccess() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) throw new Error('Not signed in')
  const { data: allowed } = await supabase.rpc('can_use_ai_helper')
  if (!allowed) throw new Error('Not authorized to use AI Helper')
  return { supabase, user }
}

async function requireSuperAdmin() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) throw new Error('Not signed in')
  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin')
  if (!isSuperAdmin) throw new Error('Not authorized — restricted to the app super admin')
  return { supabase, user }
}

export async function amISuperAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
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
  const { error } = await supabase.from('ai_helper_chats').delete().eq('user_id', userId) // optional cleanup if needed
  const { error: accessErr } = await supabase.from('ai_helper_access').delete().eq('user_id', userId)
  if (accessErr) throw accessErr
}

export async function askAiHelper(messages: ChatMessage[]): Promise<string> {
  const { supabase, user } = await requireAccess()

  const [{ data: access }, settings] = await Promise.all([
    supabase.from('user_department_access').select('department').eq('user_id', user.id),
    getSettings(),
  ])
  const myDepartments = (access || []).map(a => a.department)
  const { data: canSeeWagesRaw } = await supabase.rpc('plantpro_can_see_wages')
  const canSeeWages = !!canSeeWagesRaw

  const todayMyt = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })

  const systemInstruction = [
    BASE_INSTRUCTIONS,
    `\nToday's date is ${todayMyt}.`,
    `This user has access to these departments: ${myDepartments.join(', ') || '(none)'}.`,
    canSeeWages
      ? `This user is HR/admin and MAY see salary/wage data. Still treat it as confidential: only state what was directly asked, and don't volunteer individual salaries.`
      : `This user may NOT see salary/wage data (only HR and admin can). Never state, estimate, rank or infer any individual's pay, salary, wage, rate or deductions — not from the wage table, and not by working backwards from other figures. If asked, say it is restricted to HR and admin.`,
    settings.system_instructions?.trim() ? `\nAdditional instructions from this organization's admin:\n${settings.system_instructions.trim()}` : '',
  ].join('\n')

  let result: Awaited<ReturnType<typeof askGeminiWithTools>>
  try {
    result = await askGeminiWithTools({
      model: settings.model,
      effort: settings.effort,
      systemInstruction,
      messages,
      tools: [queryDatabaseToolDeclaration()],
      executeTool: async (name, args) => {
        if (name === 'query_database') return executeQueryDatabase(supabase, args, { canSeeWages })
        return { error: `Unknown tool: ${name}` }
      },
    })
  } catch (err: any) {
    const msg: string = err?.message || 'Unknown error'
    console.error('AI Helper Gemini call failed:', msg)
    const hint = /invalid authentication|API key|UNAUTHENTICATED|permission/i.test(msg)
      ? ' — the Gemini API key looks invalid or revoked. An admin needs to replace GEMINI_API_KEY.'
      : /quota|rate|429|exhausted/i.test(msg) ? ' — the Gemini usage quota was hit; try again shortly.'
      : /not found|404|model/i.test(msg) ? ' — the selected model may not exist; pick another in AI Helper settings.'
      : ''
    return `⚠️ The AI service returned an error: ${msg}${hint}`
  }

  await supabase.from('ai_helper_usage_log').insert([{
    user_id: user.id, model: settings.model,
    prompt_tokens: result.usage.promptTokens, completion_tokens: result.usage.completionTokens, total_tokens: result.usage.totalTokens,
  }]).then(({ error }) => { if (error) console.error('ai_helper_usage_log insert failed:', error.message) })

  return result.text
}

export type ChatSummary = { id: string; title: string; updated_at: string }
export type SavedMessage = { role: 'user' | 'model'; text: string }

export async function listChats(): Promise<ChatSummary[]> {
  const { supabase } = await requireAccess()
  const { data, error } = await supabase.from('ai_helper_chats').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(60)
  if (error) throw error
  return data || []
}

export async function getChat(id: string): Promise<SavedMessage[]> {
  const { supabase } = await requireAccess()
  const { data, error } = await supabase.from('ai_helper_chats').select('messages').eq('id', id).single()
  if (error) throw error
  return (data?.messages as SavedMessage[]) || []
}

export async function saveChat(id: string | null, messages: SavedMessage[]): Promise<string> {
  const { supabase } = await requireAccess()
  const trimmed = messages.slice(-100).map(m => ({ role: m.role, text: String(m.text).slice(0, 20000) }))
  if (id) {
    const { error } = await supabase.from('ai_helper_chats').update({ messages: trimmed, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    return id
  }
  const firstQuestion = trimmed.find(m => m.role === 'user')?.text || 'New chat'
  const { data, error } = await supabase.from('ai_helper_chats').insert([{ title: firstQuestion.replace(/\s+/g, ' ').slice(0, 70), messages: trimmed }]).select('id').single()
  if (error) throw error
  return data.id
}

export async function deleteChat(id: string): Promise<void> {
  const { supabase } = await requireAccess()
  const { error } = await supabase.from('ai_helper_chats').delete().eq('id', id)
  if (error) throw error
}
