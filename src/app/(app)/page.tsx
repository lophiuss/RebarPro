import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { DEPARTMENT_HOME, type Department } from '@/components/AppNavigation'
import PortalClient from './PortalClient'

export default async function HomePage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)

  if (!user) {
    redirect('/login')
  }

  const [{ data: access }, { data: profile }] = await Promise.all([
    supabase.from('user_department_access').select('department, role').eq('user_id', user.id),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ])

  const departments = (access ?? []) as { department: Department; role: string }[]

  // 方案 C: 智能角色路由 (Role-based Smart Routing)
  // 如果用户只被分配了 1 个部门权限，直接直达该部门首页，无需多余点击
  if (departments.length === 1) {
    const singleDept = departments[0].department
    redirect(DEPARTMENT_HOME[singleDept] || '/rebar/dashboard')
  }

  // 如果用户拥有 >= 2 个部门权限（管理层、跨部门协调员、Admin），渲染方案 B 业务模块门户矩阵
  return (
    <PortalClient
      userEmail={user.email || ''}
      fullName={profile?.full_name ?? null}
      departments={departments}
    />
  )
}
