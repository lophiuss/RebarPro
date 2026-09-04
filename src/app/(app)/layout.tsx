import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppNavigation from '@/components/AppNavigation'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: access }, { data: navPerms }, { data: profile }] = await Promise.all([
    supabase.from('user_department_access').select('department, role').eq('user_id', user.id),
    supabase.from('department_nav_permissions').select('department, role, nav_key'),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ])

  const departments = access ?? []

  if (departments.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center border rounded-xl bg-white shadow-sm p-8">
          <h1 className="text-xl font-bold text-slate-800 mb-2">No access assigned yet</h1>
          <p className="text-sm text-gray-500 mb-6">
            Your account ({user.email}) isn&apos;t assigned to the Rebar or Cement department yet.
            Ask an admin to grant access.
          </p>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-blue-600 hover:text-blue-800 underline">
              Sign out
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <AppNavigation userEmail={user.email || ''} fullName={profile?.full_name ?? null} departments={departments} navPermissions={navPerms ?? []}>
      {children}
    </AppNavigation>
  )
}
