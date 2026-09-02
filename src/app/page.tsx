import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: access } = await supabase
    .from('user_department_access')
    .select('department')
    .eq('user_id', user.id)

  const departments = (access ?? []).map(a => a.department)

  if (departments.includes('rebar')) {
    redirect('/rebar/dashboard')
  }
  if (departments.includes('cement')) {
    redirect('/cement')
  }

  // No department access yet — (app)/layout.tsx shows the "no access" message.
  redirect('/rebar/dashboard')
}
