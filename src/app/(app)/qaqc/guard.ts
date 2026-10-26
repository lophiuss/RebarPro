import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'

export async function requireQaqcAccess() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) throw new Error('Not signed in')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'qaqc' })
  if (!hasAccess) throw new Error('Not authorized')
  return { supabase, user }
}

export async function requireQaqcRole(allowed: string[]) {
  const ctx = await requireQaqcAccess()
  const { data: access } = await ctx.supabase
    .from('user_department_access')
    .select('role')
    .eq('user_id', ctx.user.id)
    .eq('department', 'qaqc')
    .maybeSingle()
  if (!access || !allowed.includes(access.role)) {
    throw new Error(`Requires role: ${allowed.join(' or ')}`)
  }
  return { ...ctx, role: access.role as string }
}
