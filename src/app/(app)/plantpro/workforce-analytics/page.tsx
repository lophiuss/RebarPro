import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { redirect } from 'next/navigation'
import WorkforceAnalyticsClient from './WorkforceAnalyticsClient'
import { getWorkforceAnalytics } from '../analytics-actions'

export const dynamic = 'force-dynamic'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function WorkforceAnalyticsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams
  const month = qMonth || currentMonth()

  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'plantpro' })
  if (!hasAccess) redirect('/')

  const [
    { data: deptsRaw },
    { data: projects },
    analyticsData,
  ] = await Promise.all([
    supabase.from('plantpro_workers').select('line').not('line', 'is', null),
    supabase.from('plantpro_projects').select('id, name').eq('status', 'Active').eq('archived', false).order('name'),
    getWorkforceAnalytics({ month }),
  ])

  const uniqueDepts = Array.from(new Set((deptsRaw || []).map(d => d.line as string))).filter(Boolean).sort()

  return (
    <WorkforceAnalyticsClient
      initialMonth={month}
      initialData={analyticsData}
      departments={uniqueDepts}
      projects={projects || []}
    />
  )
}
