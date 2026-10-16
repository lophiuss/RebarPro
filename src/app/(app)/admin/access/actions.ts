'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type Person = { id: string; email: string; full_name: string | null; avatar_url: string | null; is_active: boolean }

// Every server action here manages other people's accounts with the
// service-role client, so every one of them must independently re-check this
// — never assume the page's own client-side gating was honored.
async function requireDeptAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

// Every account-level action leaves a trace: who did what to whom.
async function logAccountAction(admin: AdminClient, actorId: string, targetId: string, action: string, detail: Record<string, unknown> = {}) {
  try {
    await admin.from('audit_log').insert({ table_name: 'account', record_id: targetId, action, new_data: detail, changed_by: actorId })
  } catch { /* a logging hiccup must not undo the action itself */ }
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
export async function createPerson(email: string, password: string, fullName: string): Promise<void> {
  const { user } = await requireDeptAdmin()
  if (!email.trim() || !password) throw new Error('Email and password are required')
  if (password.length < 8) throw new Error('Password must be at least 8 characters')

  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim() || undefined },
  })
  if (error) throw error
  if (created?.user) await logAccountAction(admin, user.id, created.user.id, 'account.create', { email: email.trim() })
}

// Updates someone else's name/picture. profiles' own RLS only lets people
// edit their own row, so this goes through the service-role client instead
// of a plain client update. avatarUrl is a public URL already uploaded to
// the 'avatars' storage bucket by the caller (that bucket's own RLS allows a
// dept admin to upload into anyone's folder) — this just records it.
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
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters')
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) throw error
  await logAccountAction(admin, user.id, userId, 'account.password_reset')
}

// Permanently removes an account. Their department access, attendance, seats, notes and personal
// to-dos go with it; anything they owned in Meetings (to-dos, issues, KPIs, priorities) stays but
// loses its owner. Someone who has made audited changes can't be deleted: deactivate them instead.
export async function deletePerson(userId: string): Promise<void> {
  const { user, admin } = await requireCanManage(userId)
  if (userId === user.id) throw new Error("You can't delete your own account")
  // Access that this person granted to others must not block the delete. Their audit entries stay:
  // the deleted account's e-mail is recorded in the entry for the delete itself.
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

// Changes someone's sign-in e-mail directly (no confirmation e-mail; an admin is vouching for it).
// Meetings invitations that were already linked to them keep working.
export async function updatePersonEmail(userId: string, email: string): Promise<void> {
  const { user, admin } = await requireCanManage(userId)
  const next = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) throw new Error('That does not look like an e-mail address')
  const { data: before } = await admin.auth.admin.getUserById(userId)
  const { error } = await admin.auth.admin.updateUserById(userId, { email: next, email_confirm: true })
  if (error) throw error
  await logAccountAction(admin, user.id, userId, 'account.email_change', { from: before?.user?.email ?? null, to: next })
}
