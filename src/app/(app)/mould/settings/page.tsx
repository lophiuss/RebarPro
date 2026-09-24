export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Settings as SettingsIcon } from 'lucide-react'
import SettingsForm from './SettingsForm'

export default async function MouldSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: myAccess } = user
    ? await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'mould').maybeSingle()
    : { data: null }
  const isAdmin = myAccess?.role === 'admin'

  const { data: settings } = await supabase.from('mould_settings').select('*').eq('id', 1).single()

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-2"><SettingsIcon className="w-7 h-7 text-teal-600" /> Mould Settings</h1>
      <p className="text-sm text-gray-500 mb-6">
        These rates are snapshotted onto every job and time entry when they&apos;re saved — changing a rate here only
        affects work recorded after the change. Past months never move.
      </p>
      <SettingsForm initial={settings} isAdmin={isAdmin} />
    </div>
  )
}
