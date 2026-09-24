export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Lock } from 'lucide-react'
import MonthLockTable from './MonthLockTable'

export default async function MouldMonthLockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: myAccess } = user
    ? await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'mould').maybeSingle()
    : { data: null }
  const isAdmin = myAccess?.role === 'admin'

  // Last 12 months, newest first — periods with no lock row yet are "open" by default.
  const periods: string[] = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }

  const { data: locks } = await supabase.from('mould_month_locks').select('period, status, locked_by, locked_at').in('period', periods)
  const lockByPeriod = new Map((locks || []).map(l => [l.period, l]))

  const rows = periods.map(p => ({
    period: p,
    status: lockByPeriod.get(p)?.status || 'open',
    locked_by: lockByPeriod.get(p)?.locked_by || null,
    locked_at: lockByPeriod.get(p)?.locked_at || null,
  }))

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-2"><Lock className="w-7 h-7 text-teal-600" /> Month Lock</h1>
      <p className="text-sm text-gray-500 mb-6">
        Locking a month freezes every time entry dated inside it — nobody, including admins editing directly, can
        add, edit, or delete hours in a locked period. Unlock only to correct a genuine mistake; every lock/unlock is recorded.
      </p>
      <MonthLockTable rows={rows} isAdmin={isAdmin} />
    </div>
  )
}
