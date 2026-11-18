import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'

export type DlerRole = 'admin' | 'viewer' | 'hr_worker' | 'hr_staff' | 'm3_input' | 'gp_input'

export function dlerHomeForRole(role: string): string {
  switch (role) {
    case 'admin':
    case 'viewer':
      return '/dler/dashboard'
    case 'hr_worker':
      return '/dler/workers'
    case 'hr_staff':
      return '/dler/staff'
    case 'm3_input':
      return '/dler/m3'
    case 'gp_input':
      return '/dler/gp'
    default:
      return '/'
  }
}

export async function requireDlerAccess() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) throw new Error('Not signed in')

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'dler' })
  if (!hasAccess) throw new Error('Not authorized for DLER module')

  const { data: access } = await supabase
    .from('user_department_access')
    .select('role')
    .eq('user_id', user.id)
    .eq('department', 'dler')
    .maybeSingle()

  if (!access?.role) throw new Error('Not authorized for DLER module')

  return { supabase, user, role: access.role as DlerRole }
}

export async function requireDlerRole(allowed: DlerRole[]) {
  const ctx = await requireDlerAccess()
  if (ctx.role !== 'admin' && !allowed.includes(ctx.role)) {
    throw new Error(`Requires DLER role: ${allowed.join(' or ')}`)
  }
  return ctx
}

export async function guardDlerPage(allowed: DlerRole[]) {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const { data: access } = await supabase
    .from('user_department_access')
    .select('role')
    .eq('user_id', user.id)
    .eq('department', 'dler')
    .maybeSingle()

  if (!access?.role) redirect('/')

  const role = access.role as DlerRole
  if (role !== 'admin' && !allowed.includes(role)) {
    redirect(dlerHomeForRole(role))
  }

  return { supabase, user, role }
}
