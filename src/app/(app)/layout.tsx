import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Home, List, ClipboardCheck, LogOut, BarChart3, Settings, FileBarChart2 } from 'lucide-react'

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

  return (
    <div className="flex min-h-screen bg-gray-50 text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">RebarPro</h1>
          <p className="text-sm text-slate-400 mt-1 truncate">{user.email}</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            <Home className="w-5 h-5 text-slate-400" />
            <span>Dashboard</span>
          </Link>
          <Link href="/transactions" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            <List className="w-5 h-5 text-slate-400" />
            <span>Transactions</span>
          </Link>
          <Link href="/stock-take" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            <ClipboardCheck className="w-5 h-5 text-slate-400" />
            <span>Stock Take</span>
          </Link>
          <Link href="/reports" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            <span>Reports</span>
          </Link>
          <Link href="/monthly-report" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            <FileBarChart2 className="w-5 h-5 text-slate-400" />
            <span>Monthly Report</span>
          </Link>
          <div className="pt-4 mt-4 border-t border-slate-800"></div>
          <Link href="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            <Settings className="w-5 h-5 text-slate-400" />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="p-4 mt-auto">
          <form action="/auth/signout" method="post">
            <button type="submit" className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-slate-800 transition-colors text-slate-300">
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
