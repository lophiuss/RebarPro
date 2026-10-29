'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { sendSecurityAlert } from '@/lib/security-alerts'
import { requireMeetingsManager } from '../../meetings/guard'

export type Person = { id: string; email: string; full_name: string | null; avatar_url: string | null; is_active: boolean; last_sign_in_at?: string | null }

// Every server action here manages other people's accounts with the
// service-role client, so every one of them must independently re-check this
// — never assume the page's own client-side gating was honored.
async function requireDeptAdmin() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) throw new Error('Not signed in')

  const { data: adminRows } = await supabase
    .from('user_department_access')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
  if (!adminRows || adminRows.length === 0) throw new Error('Not authorized')

  return { supabase, user }
}

type AdminClient = ReturnType<typeof createAdminClient>

// Taking over, locking out or deleting an account is more powerful than granting access, so being
// "an admin of some department" is not enough. You can manage someone's account only if
//   * it is your own, or you are a super admin, or
//   * every department they have access to is one you are an admin of (people with no access yet
//     are fine, so a new person can be set up).
// A super admin's account is only ever managed by another super admin.
async function requireCanManage(targetId: string) {
  const ctx = await requireDeptAdmin()
  const admin = createAdminClient()
  if (targetId === ctx.user.id) return { ...ctx, admin }
  const isSuper = async (id: string) => !!(await admin.from('app_super_admins').select('user_id').eq('user_id', id).maybeSingle()).data
  if (await isSuper(ctx.user.id)) return { ...ctx, admin }
  if (await isSuper(targetId)) throw new Error('Only a super admin can change a super admin account.')
  const [{ data: mine }, { data: theirs }] = await Promise.all([
    admin.from('user_department_access').select('department').eq('user_id', ctx.user.id).eq('role', 'admin'),
    admin.from('user_department_access').select('department').eq('user_id', targetId),
  ])
  const myDepts = new Set((mine ?? []).map(r => r.department as string))
  const outside = [...new Set((theirs ?? []).map(r => r.department as string).filter(d => !myDepts.has(d)))]
  if (outside.length) throw new Error(`You can't manage this account: it also has access to ${outside.join(', ')}, where you are not an admin. Ask an admin of that department, or a super admin.`)
  return { ...ctx, admin }
}

// Every account-level action leaves a trace: who did what to whom. audit_log only accepts insert,
// update or delete as its action, so the specific event is named in the data.
async function logAccountAction(admin: AdminClient, actorId: string, targetId: string, event: string, detail: Record<string, unknown> = {}) {
  const action = event === 'account.create' ? 'insert' : event === 'account.delete' ? 'delete' : 'update'
  const { error } = await admin.from('audit_log').insert({ table_name: 'account', record_id: targetId, action, new_data: { event, ...detail }, changed_by: actorId })
  if (error) console.error('audit log failed:', error.message)

  // Dispatch real-time security alert for critical account operations
  if (
    event.includes('admin') ||
    event === 'super_admin.add' ||
    event === 'super_admin.remove' ||
    event === 'account.delete' ||
    event === 'account.deactivate' ||
    event === 'account.password_reset' ||
    event === 'account.email_change'
  ) {
    sendSecurityAlert({
      event_type: 'admin_role_change',
      severity: 'HIGH',
      path: '/admin/access',
      details: { event, target_user_id: targetId, actor_id: actorId, ...detail },
    }).catch(() => {})
  }
}

// Combines the Auth user list (for email — this project's `profiles` table has
// no email column) with `profiles` (for full_name/avatar_url). Requires
// SUPABASE_SECRET_KEY; never called from the browser.
export async function listPeople(): Promise<Person[]> {
  const { supabase } = await requireDeptAdmin()

  // This lists every auth user in the project (including other apps that share
  // this Supabase project) — that's why requireDeptAdmin() above matters.
  const admin = createAdminClient()
  const [{ data: authList, error: authErr }, { data: profiles, error: profErr }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from('profiles').select('id, full_name, avatar_url, is_active'),
  ])
  if (authErr) throw authErr
  if (profErr) throw profErr

  const profileById = new Map((profiles ?? []).map(p => [p.id, p]))

  return authList.users
    .map(u => ({
      id: u.id,
      email: u.email ?? '(no email)',
      full_name: profileById.get(u.id)?.full_name ?? null,
      avatar_url: profileById.get(u.id)?.avatar_url ?? null,
      is_active: profileById.get(u.id)?.is_active ?? true,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

// Deactivating blocks sign-in two ways: a Supabase Auth ban (rejects the
// login attempt itself with a clear error) and profiles.is_active, which
// proxy.ts also checks on every request so an already-open session is cut
// immediately rather than only at their next token refresh.
export async function setPersonActive(userId: string, active: boolean): Promise<void> {
  const { user, admin } = await requireCanManage(userId)
  if (userId === user.id && !active) throw new Error("You can't deactivate your own account")

  const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? 'none' : '876000h', // ~100 years — GoTrue has no "forever", this is the standard idiom
  })
  if (banErr) throw banErr

  const { error } = await admin.from('profiles').update({ is_active: active }).eq('id', userId)
  if (error) throw error
  await logAccountAction(admin, user.id, userId, active ? 'account.activate' : 'account.deactivate')
}

// Creates a brand-new account directly, as an alternative to self-signup —
// e.g. for someone who won't use the login page themselves. Department
// access is granted separately via the existing Grant Access form.
export async function createPerson(email: string, password: string, fullName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await requireDeptAdmin()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) return { ok: false, error: 'Email and password are required' }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return { ok: false, error: 'Invalid email address format' }
    if (password.length < 10) return { ok: false, error: 'Password must be at least 10 characters long' }

    const admin = createAdminClient()
    const { data: created, error } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim() || undefined },
    })
    if (error) return { ok: false, error: error.message }
    if (created?.user) await logAccountAction(admin, user.id, created.user.id, 'account.create', { email: cleanEmail })
    return { ok: true }
  } catch (err: any) {
    console.error('createPerson error:', err)
    return { ok: false, error: err.message || 'Failed to create user' }
  }
}

// Access Control for a Meetings MANAGER: creates a login and gives it the Meetings "member" role, nothing else.
// A manager cannot touch other departments, other roles or existing accounts (those need requireDeptAdmin above).
export async function createMeetingsPerson(email: string, password: string, fullName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await requireMeetingsManager()
    const mail = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return { ok: false, error: 'That does not look like an e-mail address' }
    if (password.length < 10) return { ok: false, error: 'Password must be at least 10 characters' }

    const admin = createAdminClient()
    const { data: created, error } = await admin.auth.admin.createUser({
      email: mail, password, email_confirm: true, user_metadata: { full_name: fullName.trim() || undefined },
    })
    if (error) return { ok: false, error: error.message }
    const id = created.user.id
    const { error: grantErr } = await admin.from('user_department_access').upsert({ user_id: id, department: 'meetings', role: 'member', granted_by: user.id }, { onConflict: 'user_id,department', ignoreDuplicates: true })
    if (grantErr) {
      await admin.auth.admin.deleteUser(id) // never leave a login without the access it was created for
      return { ok: false, error: grantErr.message }
    }
    await logAccountAction(admin, user.id, id, 'account.create', { email: mail, via: 'meetings manager', department: 'meetings', role: 'member' })
    return { ok: true }
  } catch (err: any) {
    console.error('createMeetingsPerson error:', err)
    return { ok: false, error: err.message || 'Failed to create user' }
  }
}

// Updates someone else's name/picture. profiles' own RLS only lets people
// edit their own row, so this goes through the service-role client instead
// of a plain client update.
export async function updatePersonProfile(userId: string, fullName: string, avatarUrl?: string | null): Promise<void> {
  await requireCanManage(userId)
  const admin = createAdminClient()
  const patch: { full_name: string | null; avatar_url?: string | null } = { full_name: fullName.trim() || null }
  if (avatarUrl !== undefined) patch.avatar_url = avatarUrl
  const { error } = await admin.from('profiles').update(patch).eq('id', userId)
  if (error) throw error
}

export async function resetPersonPassword(userId: string, newPassword: string): Promise<void> {
  const { user, admin } = await requireCanManage(userId)
  if (newPassword.length < 10) throw new Error('Password must be at least 10 characters')
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) throw error
  await logAccountAction(admin, user.id, userId, 'account.password_reset')
}

// Permanently removes an account.
export async function deletePerson(userId: string): Promise<void> {
  const { user, admin } = await requireCanManage(userId)
  if (userId === user.id) throw new Error("You can't delete your own account")
  const { data: gone } = await admin.auth.admin.getUserById(userId)
  await admin.from('user_department_access').update({ granted_by: null }).eq('granted_by', userId)
  await admin.from('audit_log').update({ changed_by: null }).eq('changed_by', userId)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    if (/foreign key|violates|database error/i.test(error.message)) {
      throw new Error('This person has recorded history, so they can\'t be deleted. Set them to Inactive instead: they can no longer sign in.')
    }
    throw error
  }
  await logAccountAction(admin, user.id, userId, 'account.delete', { email: gone?.user?.email ?? null })
}

// Changes someone's sign-in e-mail directly.
export async function updatePersonEmail(userId: string, email: string): Promise<void> {
  const { user, admin } = await requireCanManage(userId)
  const next = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) throw new Error('That does not look like an e-mail address')
  const { data: before } = await admin.auth.admin.getUserById(userId)
  const { error } = await admin.auth.admin.updateUserById(userId, { email: next, email_confirm: true })
  if (error) throw error
  await logAccountAction(admin, user.id, userId, 'account.email_change', { from: before?.user?.email ?? null, to: next })
}
