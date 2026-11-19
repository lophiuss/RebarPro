import { guardDlerPage } from '../guard'
import { createAdminClient } from '@/lib/supabase/admin'
import OrgChartClient from './OrgChartClient'
import type { DlerAllocation, DlerDepartment, DlerPerson, DlerProject } from '@/lib/dler-math'

export const dynamic = 'force-dynamic'

export default async function DlerOrgChartPage() {
  const { supabase, role } = await guardDlerPage(['admin', 'viewer', 'hr_worker', 'hr_staff'])

  const [deptsRes, projsRes, peopleRes, allocRes, factoriesRes] = await Promise.all([
    supabase.from('dler_departments').select('*').order('sort_order').order('name'),
    supabase.from('dler_projects').select('*').order('name'),
    supabase.from('dler_people').select('*').order('person_type').order('emp_no'),
    supabase.from('dler_project_allocations').select('person_id, project_id, percentage'),
    supabase.from('dler_factories').select('id').order('id').limit(1),
  ])

  if (deptsRes.error) throw deptsRes.error
  if (projsRes.error) throw projsRes.error
  if (peopleRes.error) throw peopleRes.error
  if (allocRes.error) throw allocRes.error
  if (factoriesRes.error) throw factoriesRes.error

  const defaultFactoryId = factoriesRes.data?.[0]?.id ?? deptsRes.data?.[0]?.factory_id ?? 1

  // Logins (name + email) so people can be linked to an account. Names/emails only — no pay data.
  const admin = createAdminClient()
  const [{ data: profs }, usersRes] = await Promise.all([
    admin.from('profiles').select('id, full_name'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])
  const emailById = new Map((usersRes.data?.users ?? []).map(u => [u.id, u.email ?? '']))
  const logins = (profs ?? [])
    .map(p => ({ id: p.id as string, name: (p.full_name as string | null) ?? '', email: emailById.get(p.id as string) ?? '' }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))

  return (
    <OrgChartClient
      role={role}
      departments={(deptsRes.data ?? []) as DlerDepartment[]}
      projects={(projsRes.data ?? []) as DlerProject[]}
      people={(peopleRes.data ?? []) as DlerPerson[]}
      allocations={(allocRes.data ?? []) as DlerAllocation[]}
      logins={logins}
      defaultFactoryId={defaultFactoryId}
    />
  )
}
