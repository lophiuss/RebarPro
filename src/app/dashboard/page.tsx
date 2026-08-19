import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch some basic dashboard data here once DB is ready
  
  return (
    <div className="flex min-h-screen w-full flex-col p-4 md:p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex gap-4 items-center">
            <span className="text-sm text-gray-500">{user.email}</span>
            <form action="/auth/signout" method="post">
                <button type="submit" className="text-sm bg-gray-200 px-3 py-1 rounded hover:bg-gray-300">
                    Sign Out
                </button>
            </form>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* KPI Cards will go here */}
        <div className="border rounded-xl p-6 bg-white shadow-sm">
            <h3 className="font-semibold text-sm text-gray-500">Total Balance Stock</h3>
            <p className="text-3xl font-bold mt-2">0 tons</p>
        </div>
        <div className="border rounded-xl p-6 bg-white shadow-sm">
            <h3 className="font-semibold text-sm text-gray-500">Avg Daily Usage (7d)</h3>
            <p className="text-3xl font-bold mt-2">0 tons</p>
        </div>
        <div className="border rounded-xl p-6 bg-white shadow-sm">
            <h3 className="font-semibold text-sm text-gray-500">Incoming Target</h3>
            <p className="text-3xl font-bold mt-2">0 tons</p>
        </div>
        <div className="border rounded-xl p-6 bg-white shadow-sm">
            <h3 className="font-semibold text-sm text-gray-500">Days Coverage</h3>
            <p className="text-3xl font-bold mt-2">0 days</p>
        </div>
      </div>
    </div>
  )
}
