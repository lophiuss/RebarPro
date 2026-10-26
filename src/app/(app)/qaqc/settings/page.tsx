export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { redirect } from 'next/navigation'
import SettingsClient from './SettingsClient'
import { Settings } from 'lucide-react'

export default async function QaqcSettingsPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const [
    { data: access },
    { data: testTypes },
    { data: suppliers },
  ] = await Promise.all([
    supabase
      .from('user_department_access')
      .select('role')
      .eq('user_id', user.id)
      .eq('department', 'qaqc')
      .maybeSingle(),
    supabase
      .from('qaqc_test_types')
      .select('*')
      .order('sort_order')
      .order('name'),
    supabase
      .from('qaqc_suppliers')
      .select('*')
      .order('name'),
  ])

  const userRole = access?.role || 'qaqc'

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2.5">
          <Settings className="w-8 h-8 text-indigo-600" />
          QAQC Settings & Directories
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure recognized test categories, default testing rates, and external testing laboratories
        </p>
      </div>

      <SettingsClient
        initialTestTypes={(testTypes as any) || []}
        initialSuppliers={(suppliers as any) || []}
        userRole={userRole}
      />
    </div>
  )
}
