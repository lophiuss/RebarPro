export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Clock } from 'lucide-react'
import OTClient from './OTClient'

function currentMonthDefault() {
  return new Date().toISOString().slice(0, 7)
}

interface SearchParams { month?: string }

export default async function PlantproOtPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { month: monthParam } = await searchParams
  const month = monthParam || currentMonthDefault()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: myAccess } = user
    ? await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'plantpro').maybeSingle()
    : { data: null }
  const myRole = myAccess?.role || 'supervisor'
  const { data: mySupervisorRow } = user
    ? await supabase.from('plantpro_supervisors').select('id, name').eq('linked_user_id', user.id).maybeSingle()
    : { data: null }

  const [
    { data: workers }, { data: supervisors }, { data: projects }, { data: projectTypes },
    { data: otMonths }, { data: allocations }, { data: otApprovals },
    { data: targets }, { data: claims }, { data: payValues }, { data: payColumns },
  ] = await Promise.all([
    supabase.from('plantpro_workers').select('id, name, worker_no, designation, status, supervisor_id, supervisors:plantpro_supervisors(name)').eq('status', 'Active').order('name'),
    supabase.from('plantpro_supervisors').select('id, name, status').eq('status', 'Active').order('name'),
    supabase.from('plantpro_projects').select('id, name, type_id, status').order('name'),
    supabase.from('plantpro_project_types').select('id, name'),
    supabase.from('plantpro_ot_months').select('id, worker_id, mode, remark, days:plantpro_ot_days(id, day, basic, ot, allocations:plantpro_ot_day_allocations(project_id, percentage))').eq('month', month),
    supabase.from('plantpro_worker_allocations').select('worker_id, project_id, percentage'),
    supabase.from('plantpro_ot_approvals').select('supervisor_id, status, submitted_by, submitted_at, approved_by, approved_at, rejected_by, rejected_at, submitter:profiles!plantpro_ot_approvals_submitted_by_fkey(full_name), approver:profiles!plantpro_ot_approvals_approved_by_fkey(full_name), rejecter:profiles!plantpro_ot_approvals_rejected_by_fkey(full_name)').eq('month', month),
    supabase.from('plantpro_monthly_targets').select('project_id, production_target, delivery_target, general_target').eq('month', month),
    supabase.from('plantpro_claims').select('project_id, type, amount, date').gte('date', `${month}-01`).lte('date', `${month}-31`),
    // RLS-gated: comes back empty for a supervisor-tier viewer, by design.
    supabase.from('plantpro_worker_pay_values').select('worker_id, pay_column_id, value'),
    supabase.from('plantpro_pay_columns').select('id, key'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Clock className="w-7 h-7 text-indigo-600" /> OT & Allocation</h1>
      <OTClient
        month={month}
        myRole={myRole}
        myUserId={user?.id || null}
        mySupervisorName={mySupervisorRow?.name || null}
        workers={(workers as any) || []}
        supervisors={supervisors || []}
        projects={projects || []}
        projectTypes={projectTypes || []}
        otMonths={(otMonths as any) || []}
        allocations={allocations || []}
        otApprovals={(otApprovals as any) || []}
        targets={targets || []}
        claims={claims || []}
        payValues={payValues || []}
        payColumns={payColumns || []}
      />
    </div>
  )
}
