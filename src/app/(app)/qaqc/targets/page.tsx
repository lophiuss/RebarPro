export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { redirect } from 'next/navigation'
import TargetsClient from './TargetsClient'
import { Target } from 'lucide-react'

export default async function QaqcTargetsPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const [
    { data: plantproProjects },
    { data: targets },
  ] = await Promise.all([
    supabase
      .from('plantpro_projects')
      .select('name')
      .eq('status', 'Active')
      .order('name'),
    supabase
      .from('qaqc_targets')
      .select('*'),
  ])

  const projects = (plantproProjects || []).map(p => p.name)

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2.5">
          <Target className="w-8 h-8 text-rose-600" />
          Project Testing Targets & Budgets
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Set expected monthly testing frequency and allocated expenditure budgets for each project
        </p>
      </div>

      <TargetsClient
        projects={projects}
        targets={(targets as any) || []}
      />
    </div>
  )
}
