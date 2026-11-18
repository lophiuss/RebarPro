import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { dlerHomeForRole } from './guard'

export default async function DlerRootPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) redirect('/login')

  const { data: access } = await supabase
    .from('user_department_access')
    .select('role')
    .eq('user_id', user.id)
    .eq('department', 'dler')
    .maybeSingle()

  if (!access?.role) redirect('/')
  redirect(dlerHomeForRole(access.role))
}
