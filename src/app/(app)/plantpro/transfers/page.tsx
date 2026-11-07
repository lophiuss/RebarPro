import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { redirect } from 'next/navigation'
import TransfersClient from './TransfersClient'

export const dynamic = 'force-dynamic'

export default async function TransfersPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'plantpro' })
  if (!hasAccess) redirect('/')

  const [
    { data: workers },
    { data: supervisors },
    { data: movements },
    { data: linesRaw },
  ] = await Promise.all([
    supabase.from('plantpro_workers').select('id, name, worker_no, line, supervisor_id').neq('status', 'Inactive').order('name'),
    supabase.from('plantpro_supervisors').select('id, name').eq('status', 'Active').order('name'),
    supabase.from('plantpro_worker_movements').select('*, worker:plantpro_workers(name, worker_no)').order('created_at', { ascending: false }).limit(60),
    supabase.from('plantpro_workers').select('line').not('line', 'is', null),
  ])

  const uniqueLines = Array.from(new Set((linesRaw || []).map(l => l.line as string))).filter(Boolean).sort()

  return (
    <TransfersClient
      workers={workers || []}
      supervisors={supervisors || []}
      initialMovements={(movements || []) as any}
      departments={uniqueLines}
    />
  )
}
