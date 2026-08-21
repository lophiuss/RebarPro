'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, ClipboardCheck, LogOut, BarChart3, Settings, FileBarChart2, Menu, X } from 'lucide-react'

interface Props {
  userEmail: string
  children: React.ReactNode
}

export default function AppNavigation({ userEmail, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/transactions', label: 'Transactions', icon: List },
    { href: '/stock-take', label: 'Stock Take', icon: ClipboardCheck },
    { href: '/reports', label: 'Reports', icon: BarChart3 },
    { href: '/monthly-report', label: 'Monthly Report', icon: FileBarChart2 },
  ]

  const closeSidebar = () => setIsOpen(false)

  return (
    <div className="flex min-h-screen bg-gray-50 text-slate-900 flex-col md:flex-row">
      {/* Mobile Top Navbar */}
      <header className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-200 transition"
            aria-label="Toggle navigation"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <span className="font-bold text-lg tracking-tight">RebarPro</span>
        </div>
        <span className="text-xs text-slate-400 max-w-[150px] truncate">{userEmail}</span>
      </header>

      {/* Backdrop for Mobile */}
      {isOpen && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-xs transition-opacity animate-in fade-in"
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-64 bg-slate-900 text-white flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          shadow-xl md:shadow-none
        `}
      >
        {/* Sidebar Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">RebarPro</h1>
            <p className="text-xs text-slate-400 mt-1 truncate max-w-[180px]">{userEmail}</p>
          </div>
          <button
            onClick={closeSidebar}
            className="md:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 space-y-1.5 mt-4 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeSidebar}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            )
          })}

          <div className="pt-3 my-2 border-t border-slate-800/80" />

          <Link
            href="/settings"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              pathname === '/settings'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'
            }`}
          >
            <Settings className={`w-5 h-5 ${pathname === '/settings' ? 'text-white' : 'text-slate-400'}`} />
            <span>Settings</span>
          </Link>
        </nav>

        {/* Sign Out Button */}
        <div className="p-4 border-t border-slate-800/80 mt-auto">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-3 px-3.5 py-2.5 w-full rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors text-slate-300 text-sm font-medium"
            >
              <LogOut className="w-5 h-5 text-slate-400" />
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  )
}
