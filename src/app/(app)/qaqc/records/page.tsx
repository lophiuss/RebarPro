export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { redirect } from 'next/navigation'
import RecordsClient from './RecordsClient'
import { ClipboardCheck } from 'lucide-react'

export default async function QaqcRecordsPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const [
    { data: access },
    { data: tests },
    { data: testTypes },
    { data: suppliers },
    { data: plantproProjects },
  ] = await Promise.all([
    supabase
      .from('user_department_access')
      .select('role')
      .eq('user_id', user.id)
      .eq('department', 'qaqc')
      .maybeSingle(),
    supabase
      .from('qaqc_tests')
      .select('*')
      .order('date_test', { ascending: false })
      .order('id', { ascending: false }),
    supabase
      .from('qaqc_test_types')
      .select('name')
      .eq('status', 'Active')
      .order('sort_order'),
    supabase
      .from('qaqc_suppliers')
      .select('name')
      .eq('status', 'Active')
      .order('name'),
    supabase
      .from('plantpro_projects')
      .select('name')
      .eq('status', 'Active')
      .order('name'),
  ])

  const userRole = access?.role || 'qaqc'
  const knownProjects = (plantproProjects || []).map(p => p.name)
  const knownSuppliers = (suppliers || []).map(s => s.name)
  const knownTestTypes = (testTypes || []).map(t => t.name)

  return (
    <div className="p-4 md:p-8 max-w-[1700px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2.5">
            <ClipboardCheck className="w-8 h-8 text-indigo-600" />
            QAQC Test & Cost Tracker
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            End-to-end lifecycle tracking: Test Results ➜ Purchaser PO ➜ Account Invoicing & Payment
          </p>
        </div>
      </div>

      <RecordsClient
        initialTests={(tests as any) || []}
        userRole={userRole}
        knownProjects={knownProjects}
        knownSuppliers={knownSuppliers}
        knownTestTypes={knownTestTypes}
      />
    </div>
  )
}
