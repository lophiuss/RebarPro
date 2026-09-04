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
  const { user } = await requireDeptAdmin()
  if (userId === user.id && !active) throw new Error("You can't deactivate your own account")

  const admin = createAdminClient()
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? 'none' : '876000h', // ~100 years — GoTrue has no "forever", this is the standard idiom
  })
  if (banErr) throw banErr

  const { error } = await admin.from('profiles').update({ is_active: active }).eq('id', userId)
  if (error) throw error
}

// Creates a brand-new account directly, as an alternative to self-signup —
// e.g. for someone who won't use the login page themselves. Department
// access is granted separately via the existing Grant Access form.
export async function createPerson(email: string, password: string, fullName: string): Promise<void> {
  await requireDeptAdmin()
  if (!email.trim() || !password) throw new Error('Email and password are required')
  if (password.length < 6) throw new Error('Password must be at least 6 characters')

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim() || undefined },
  })
  if (error) throw error
}

// Updates someone else's name/picture. profiles' own RLS only lets people
// edit their own row, so this goes through the service-role client instead
// of a plain client update. avatarUrl is a public URL already uploaded to
// the 'avatars' storage bucket by the caller (that bucket's own RLS allows a
// dept admin to upload into anyone's folder) — this just records it.
export async function updatePersonProfile(userId: string, fullName: string, avatarUrl?: string | null): Promise<void> {
  await requireDeptAdmin()
  const admin = createAdminClient()
  const patch: { full_name: string | null; avatar_url?: string | null } = { full_name: fullName.trim() || null }
  if (avatarUrl !== undefined) patch.avatar_url = avatarUrl
  const { error } = await admin.from('profiles').update(patch).eq('id', userId)
  if (error) throw error
}

export async function resetPersonPassword(userId: string, newPassword: string): Promise<void> {
  await requireDeptAdmin()
  if (newPassword.length < 6) throw new Error('Password must be at least 6 characters')
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) throw error
}
