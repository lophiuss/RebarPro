'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, List, ClipboardCheck, LogOut, Settings, FileBarChart2, Menu, X,
  ShieldCheck, Building2, Boxes, Scale, PackageOpen, ScrollText, BarChart3,
  ArrowLeftRight, ClipboardList, AlertTriangle, Factory
} from 'lucide-react'

export type DepartmentAccess = { department: 'rebar' | 'cement'; role: string }

interface Props {
  userEmail: string
  departments: DepartmentAccess[]
  children: React.ReactNode
}

const DEPARTMENT_LABEL: Record<DepartmentAccess['department'], string> = {
  rebar: 'Rebar',
  cement: 'BPlant',
}

const DEPARTMENT_HOME: Record<DepartmentAccess['department'], string> = {
  rebar: '/rebar/dashboard',
  cement: '/cement',
}

// Cement's real pages land here module-by-module (see the merge plan's build order).
// Until then, /cement is a single placeholder page rather than a set of 404s.
//
// `roles` mirrors the data-role visibility rules from the legacy cement-app's
// sidebar.html (undefined = visible to every role in the department).
type NavItem = { href: string; label: string; icon: any; roles?: string[] }
const NAV_ITEMS: Record<DepartmentAccess['department'], NavItem[]> = {
  rebar: [
    { href: '/rebar/dashboard', label: 'Dashboard', icon: Home },
    { href: '/rebar/transactions', label: 'Transactions', icon: List },
    { href: '/rebar/stock-take', label: 'Stock Take', icon: ClipboardCheck },
    { href: '/rebar/monthly-report', label: 'Monthly Report', icon: FileBarChart2 },
  ],
  cement: [
    { href: '/cement', label: 'Overview', icon: Boxes, roles: ['supervisor', 'manager', 'admin'] },
    { href: '/cement/planning', label: 'Planning', icon: Factory, roles: ['supervisor', 'manager', 'admin'] },
    { href: '/cement/weight-in', label: 'Weight In', icon: Scale },
    { href: '/cement/unloading', label: 'Unloading', icon: PackageOpen },
    { href: '/cement/weight-out', label: 'Weight Out', icon: Scale },
    { href: '/cement/records', label: 'Records', icon: ScrollText },
    { href: '/cement/report', label: 'Report', icon: BarChart3, roles: ['manager', 'admin'] },
    { href: '/cement/transfer', label: 'Transfer', icon: ArrowLeftRight, roles: ['supervisor', 'manager', 'admin'] },
    { href: '/cement/stocktake-usage', label: 'Stock Take / Usage', icon: ClipboardList, roles: ['supervisor', 'manager', 'admin'] },
    { href: '/cement/alert-setting', label: 'Alert Setting', icon: AlertTriangle, roles: ['manager', 'admin'] },
  ],
}

export default function AppNavigation({ userEmail, departments, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const activeDept: DepartmentAccess['department'] | null = pathname.startsWith('/cement')
    ? 'cement'
    : pathname.startsWith('/rebar')
    ? 'rebar'
    : departments[0]?.department ?? null

  const activeRole = departments.find(d => d.department === activeDept)?.role
  const navItems = activeDept
    ? NAV_ITEMS[activeDept].filter(item => !item.roles || (activeRole && item.roles.includes(activeRole)))
    : []
  const isAdminAnywhere = departments.some(d => d.role === 'admin')
  const settingsHref = activeDept === 'cement' ? '/cement/settings' : '/rebar/settings'
  // Cement settings was admin-only in the legacy app; rebar settings has no such history, keep it open to all rebar members.
  const canSeeSettings = activeDept !== 'cement' || activeRole === 'admin'

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
          <span className="font-bold text-lg tracking-tight">PlantVision</span>
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
            <h1 className="text-2xl font-bold text-white tracking-tight">PlantVision</h1>
            <p className="text-xs text-slate-400 mt-1 truncate max-w-[180px]">{userEmail}</p>
          </div>
          <button
            onClick={closeSidebar}
            className="md:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Department Switcher (only shown when the user belongs to more than one) */}
        {departments.length > 1 && (
          <div className="px-3 pt-4 grid grid-cols-2 gap-1.5">
            {departments.map(d => (
              <Link
                key={d.department}
                href={DEPARTMENT_HOME[d.department]}
                onClick={closeSidebar}
                className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                  activeDept === d.department
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                {DEPARTMENT_LABEL[d.department]}
              </Link>
            ))}
          </div>
        )}

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

          {canSeeSettings && (
          <Link
            href={settingsHref}
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              pathname === settingsHref
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'
            }`}
          >
            <Settings className={`w-5 h-5 ${pathname === settingsHref ? 'text-white' : 'text-slate-400'}`} />
            <span>Settings</span>
          </Link>
          )}

          {isAdminAnywhere && (
            <Link
              href="/admin/access"
              onClick={closeSidebar}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                pathname === '/admin/access'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'
              }`}
            >
              <ShieldCheck className={`w-5 h-5 ${pathname === '/admin/access' ? 'text-white' : 'text-slate-400'}`} />
              <span>Access Control</span>
            </Link>
          )}
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
