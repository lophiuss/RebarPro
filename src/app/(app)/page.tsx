import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { DEPARTMENT_HOME, type Department } from '@/components/AppNavigation'
import PortalClient from './PortalClient'

export interface PortalKpiSummary {
  todayCementWeightIns: number | null
  pendingMaintenanceRequests: number | null
  pendingQaqcTests: number | null
  todaySecurityEntries: number | null
  pendingOtRequests: number | null
  myPendingTodosCount: number | null
}

export interface PortalActionItem {
  id: string
  department: Department
  title: string
  subtitle: string
  href: string
  badgeText: string
  badgeColor: string
  date: string
}

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

  const deptSet = new Set(departments.map(d => d.department))
  const todayStr = new Date().toISOString().split('T')[0]
  const todayStart = `${todayStr}T00:00:00.000Z`

  // 方案 A: 企业指挥舱指标与待办事项查询 (安全并发，按权限加载)
  const queries: Promise<any>[] = []

  // 1. Cement weight-in today
  const cementPromise = deptSet.has('cement')
    ? supabase.from('cement_weight_in').select('id', { count: 'exact', head: true }).gte('created_at', todayStart)
    : Promise.resolve({ count: null })

  // 2. Maintenance pending work requests
  const maintenancePromise = deptSet.has('maintenance')
    ? supabase.from('maintenance_work_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    : Promise.resolve({ count: null })

  // 3. QAQC tests pending report
  const qaqcPromise = deptSet.has('qaqc')
    ? supabase.from('qaqc_tests').select('id', { count: 'exact', head: true }).is('report_no', null)
    : Promise.resolve({ count: null })

  // 4. Security entries today
  const securityPromise = deptSet.has('security')
    ? supabase.from('security_entries').select('id', { count: 'exact', head: true }).gte('created_at', todayStart)
    : Promise.resolve({ count: null })

  // 5. PlantPro OT extra requests pending
  const otPromise = deptSet.has('plantpro')
    ? supabase.from('plantpro_ot_extra_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    : Promise.resolve({ count: null })

  // 6. Meetings my personal pending todos
  const todosPromise = deptSet.has('meetings')
    ? supabase.from('mtg_personal_todos').select('id, title, due_date, created_at').eq('user_id', user.id).is('done_at', null).order('created_at', { ascending: false }).limit(6)
    : Promise.resolve({ data: [] })

  // 7. Maintenance pending work request list for action items
  const maintListPromise = deptSet.has('maintenance')
    ? supabase.from('maintenance_work_requests').select('id, requester_name, issue_description, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(4)
    : Promise.resolve({ data: [] })

  const [
    cementRes,
    maintRes,
    qaqcRes,
    secRes,
    otRes,
    todosRes,
    maintListRes,
  ] = await Promise.allSettled([
    cementPromise,
    maintenancePromise,
    qaqcPromise,
    securityPromise,
    otPromise,
    todosPromise,
    maintListPromise,
  ])

  const kpis: PortalKpiSummary = {
    todayCementWeightIns: cementRes.status === 'fulfilled' ? cementRes.value.count : null,
    pendingMaintenanceRequests: maintRes.status === 'fulfilled' ? maintRes.value.count : null,
    pendingQaqcTests: qaqcRes.status === 'fulfilled' ? qaqcRes.value.count : null,
    todaySecurityEntries: secRes.status === 'fulfilled' ? secRes.value.count : null,
    pendingOtRequests: otRes.status === 'fulfilled' ? otRes.value.count : null,
    myPendingTodosCount: todosRes.status === 'fulfilled' && todosRes.value.data ? todosRes.value.data.length : null,
  }

  // Aggregate unified action items
  const actionItems: PortalActionItem[] = []

  // Add my personal todos from Meetings
  if (todosRes.status === 'fulfilled' && Array.isArray(todosRes.value.data)) {
    todosRes.value.data.forEach((todo: any) => {
      actionItems.push({
        id: `todo-${todo.id}`,
        department: 'meetings',
        title: todo.title,
        subtitle: todo.due_date ? `Due: ${todo.due_date}` : 'Personal Action Item',
        href: '/meetings/todos',
        badgeText: 'To-do',
        badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
        date: todo.created_at ? new Date(todo.created_at).toLocaleDateString() : 'Recent',
      })
    })
  }

  // Add maintenance pending requests
  if (maintListRes.status === 'fulfilled' && Array.isArray(maintListRes.value.data)) {
    maintListRes.value.data.forEach((req: any) => {
      actionItems.push({
        id: `maint-${req.id}`,
        department: 'maintenance',
        title: req.issue_description || 'Equipment breakdown work request',
        subtitle: `Requested by ${req.requester_name || 'Staff'}`,
        href: '/maintenance/work-requests',
        badgeText: 'Pending Work Request',
        badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        date: req.created_at ? new Date(req.created_at).toLocaleDateString() : 'Recent',
      })
    })
  }

  return (
    <PortalClient
      userEmail={user.email || ''}
      fullName={profile?.full_name ?? null}
      departments={departments}
      kpis={kpis}
      actionItems={actionItems}
    />
  )
}
