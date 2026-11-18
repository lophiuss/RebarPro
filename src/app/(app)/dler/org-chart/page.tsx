import { guardDlerPage } from '../guard'
import OrgChartClient from './OrgChartClient'
import type { DlerAllocation, DlerDepartment, DlerPerson, DlerProject } from '@/lib/dler-math'

export const dynamic = 'force-dynamic'

export default async function DlerOrgChartPage() {
  const { supabase, role } = await guardDlerPage(['admin', 'viewer', 'hr_worker', 'hr_staff'])

  const [deptsRes, projsRes, peopleRes, allocRes] = await Promise.all([
    supabase.from('dler_departments').select('*').order('sort_order').order('name'),
    supabase.from('dler_projects').select('*').order('name'),
    supabase.from('dler_people').select('*').order('person_type').order('emp_no'),
    supabase.from('dler_project_allocations').select('person_id, project_id, percentage'),
  ])

  if (deptsRes.error) throw deptsRes.error
  if (projsRes.error) throw projsRes.error
  if (peopleRes.error) throw peopleRes.error
  if (allocRes.error) throw allocRes.error

  return (
    <OrgChartClient
      role={role}
      departments={(deptsRes.data ?? []) as DlerDepartment[]}
      projects={(projsRes.data ?? []) as DlerProject[]}
      people={(peopleRes.data ?? []) as DlerPerson[]}
      allocations={(allocRes.data ?? []) as DlerAllocation[]}
    />
  )
}
