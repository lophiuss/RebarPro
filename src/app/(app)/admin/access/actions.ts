'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type Person = { id: string; email: string; full_name: string | null }

// Combines the Auth user list (for email — this project's `profiles` table has
// no email column) with `profiles` (for full_name). Requires SUPABASE_SECRET_KEY;
// never called from the browser.
export async function listPeople(): Promise<Person[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  // This lists every auth user in the project (including other apps that share
  // this Supabase project) — restrict it to people who administer at least one
  // department here, matching what the page itself is meant to be gated behind.
  const { data: adminRows } = await supabase
    .from('user_department_access')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
  if (!adminRows || adminRows.length === 0) throw new Error('Not authorized')

  const admin = createAdminClient()
  const [{ data: authList, error: authErr }, { data: profiles, error: profErr }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from('profiles').select('id, full_name'),
  ])
  if (authErr) throw authErr
  if (profErr) throw profErr

  const nameById = new Map((profiles ?? []).map(p => [p.id, p.full_name as string | null]))

  return authList.users
    .map(u => ({ id: u.id, email: u.email ?? '(no email)', full_name: nameById.get(u.id) ?? null }))
    .sort((a, b) => a.email.localeCompare(b.email))
}
