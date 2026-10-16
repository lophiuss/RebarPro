import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'

// Access checks shared by every Meetings server-action file. Lives outside any
// 'use server' file on purpose: exports of a 'use server' module become
// client-callable actions, and these helpers must not be.
//
// RLS on every mtg_* table is has_dept_access('meetings') for all roles (the
// sensitive 1:1 / RPRS tables add participant checks). Role checks here are an
// additional app-level guard where role matters.
export async function requireMeetingsAccess() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) throw new Error('Not signed in')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'meetings' })
  if (!hasAccess) throw new Error('Not authorized')
  return { supabase, user }
}

export async function requireMeetingsRole(allowed: string[]) {
  const ctx = await requireMeetingsAccess()
  const { data: access } = await ctx.supabase
    .from('user_department_access')
    .select('role')
    .eq('user_id', ctx.user.id)
    .eq('department', 'meetings')
    .maybeSingle()
  if (!access || !allowed.includes(access.role)) throw new Error(`Requires role: ${allowed.join(' or ')}`)
  return { ...ctx, role: access.role as string }
}

export const requireMeetingsAdmin = () => requireMeetingsRole(['admin'])
export const requireMeetingsManager = () => requireMeetingsRole(['admin', 'manager'])
