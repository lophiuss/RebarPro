export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { LayoutDashboard } from 'lucide-react'

export default async function QaqcDashboardPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const [
    { data: tests },
    { data: targets },
    { data: plantproProjects },
  ] = await Promise.all([
    supabase
      .from('qaqc_tests')
      .select('id, running_no, project, supplier, marking, test_type, date_cast, date_test, report_no, email_date, po_no, po_amount, invoice_no, invoice_amount, cn_no, cn_amount, payment_status')
      .order('date_test', { ascending: false }),
    supabase
      .from('qaqc_targets')
      .select('*'),
    supabase
      .from('plantpro_projects')
      .select('name')
      .eq('status', 'Active')
      .order('name'),
  ])

  const knownProjects = (plantproProjects || []).map(p => p.name)

  return (
    <div className="p-4 md:p-8 max-w-[1700px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2.5">
          <LayoutDashboard className="w-8 h-8 text-indigo-600" />
          QAQC Testing & Spend Dashboard
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Monthly & yearly test volumes, PO commitments, invoicing, and project testing spend vs targets
        </p>
      </div>

      <DashboardClient
        tests={(tests as any) || []}
        targets={(targets as any) || []}
        projects={knownProjects}
      />
    </div>
  )
}
