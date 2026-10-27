'use client'

import React, { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, List, ClipboardCheck, LogOut, Settings, FileBarChart2, Menu, X,
  ShieldCheck, Building2, Boxes, Scale, PackageOpen, ScrollText, BarChart3,
  ArrowLeftRight, ClipboardList, AlertTriangle, Factory, DoorClosed, KeyRound,
  Radio, Siren, ClipboardEdit, User, Sparkles, Wrench, CalendarClock,
  PackageSearch, Inbox, History, HelpCircle, Navigation, Hammer,
  Users, Lock, FileBarChart, Clock, BedDouble, FileText, Upload, Target, Receipt, DollarSign, LayoutDashboard, CalendarDays, ListChecks, Network, MessagesSquare, UserCheck, LifeBuoy, PanelLeftClose, PanelLeftOpen, PenTool, UserPlus, LayoutGrid, ArrowRight
} from 'lucide-react'

export type Department = 'rebar' | 'cement' | 'security' | 'maintenance' | 'mould' | 'plantpro' | 'meetings' | 'qaqc'
export type DepartmentAccess = { department: Department; role: string }
export type NavPermission = { department: Department; role: string; nav_key: string }

interface Props {
  userEmail: string
  fullName: string | null
  departments: DepartmentAccess[]
  navPermissions: NavPermission[]
  canUseAiHelper: boolean
  children: React.ReactNode
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export const DEPARTMENT_LABEL: Record<Department, string> = {
  rebar: 'Rebar',
  cement: 'BPlant',
  security: 'Security',
  maintenance: 'Maintenance',
  mould: 'Mould',
  plantpro: 'HR',
  meetings: 'Meetings',
  qaqc: 'QAQC',
}

export const DEPARTMENT_ICON: Record<Department, React.ElementType> = {
  rebar: Boxes,
  cement: Factory,
  security: ShieldCheck,
  maintenance: Wrench,
  mould: Hammer,
  plantpro: Users,
  meetings: CalendarDays,
  qaqc: ClipboardCheck,
}

export const DEPARTMENT_HOME: Record<Department, string> = {
  rebar: '/rebar/dashboard',
  cement: '/cement',
  security: '/security',
  maintenance: '/maintenance',
  mould: '/mould',
  plantpro: '/plantpro/ot',
  meetings: '/meetings/workspace',
  qaqc: '/qaqc/records',
}

const SETTINGS_HREF: Record<Department, string> = {
  rebar: '/rebar/settings',
  cement: '/cement/settings',
  security: '/security/settings',
  maintenance: '/maintenance/settings',
  mould: '/mould/settings',
  plantpro: '/plantpro/config',
  meetings: '/meetings/settings',
  qaqc: '/qaqc/settings',
}

type NavItem = { href: string; label: string; icon: any }
export const NAV_ITEMS: Record<Department, NavItem[]> = {
  rebar: [
    { href: '/rebar/dashboard', label: 'Dashboard', icon: Home },
    { href: '/rebar/transactions', label: 'Transactions', icon: List },
    { href: '/rebar/stock-take', label: 'Stock Take', icon: ClipboardCheck },
    { href: '/rebar/monthly-report', label: 'Monthly Report', icon: FileBarChart2 },
    { href: '/rebar/settings', label: 'Settings', icon: Settings },
  ],
  cement: [
    { href: '/cement', label: 'Overview', icon: Boxes },
    { href: '/cement/planning', label: 'Planning', icon: Factory },
    { href: '/cement/weight-in', label: 'Weight In', icon: Scale },
    { href: '/cement/unloading', label: 'Unloading', icon: PackageOpen },
    { href: '/cement/weight-out', label: 'Weight Out', icon: Scale },
    { href: '/cement/records', label: 'Records', icon: ScrollText },
    { href: '/cement/report', label: 'Report', icon: BarChart3 },
    { href: '/cement/transfer', label: 'Transfer', icon: ArrowLeftRight },
    { href: '/cement/stocktake-usage', label: 'Stock Take / Usage', icon: ClipboardList },
    { href: '/cement/alert-setting', label: 'Alert Setting', icon: AlertTriangle },
    { href: '/cement/settings', label: 'Settings', icon: Settings },
  ],
  security: [
    { href: '/security', label: 'Dashboard', icon: Home },
    { href: '/security/entries', label: 'Entries', icon: ClipboardEdit },
    { href: '/security/gates', label: 'Gates', icon: DoorClosed },
    { href: '/security/keys', label: 'Keys', icon: KeyRound },
    { href: '/security/post-logs', label: 'Post Logs', icon: Radio },
    { href: '/security/gps-clocking', label: 'GPS Clocking', icon: Navigation },
    { href: '/security/incidents', label: 'Incidents', icon: Siren },
    { href: '/security/audit', label: 'Audit', icon: ClipboardList },
    { href: '/security/settings', label: 'Settings', icon: Settings },
  ],
  maintenance: [
    { href: '/maintenance', label: 'Dashboard', icon: Home },
    { href: '/maintenance/equipment', label: 'Equipment', icon: Wrench },
    { href: '/maintenance/jobs', label: 'Jobs', icon: ClipboardEdit },
    { href: '/maintenance/schedule', label: 'Schedule & Checklists', icon: CalendarClock },
    { href: '/maintenance/work-requests', label: 'Work Requests', icon: Inbox },
    { href: '/maintenance/job-history', label: 'Job History', icon: History },
    { href: '/maintenance/spare-parts', label: 'Spare Parts', icon: PackageSearch },
    { href: '/maintenance/critical-issues', label: 'Critical Issues', icon: AlertTriangle },
    { href: '/maintenance/settings', label: 'Settings', icon: Settings },
  ],
  mould: [
    { href: '/mould', label: 'Monthly Cost Report', icon: FileBarChart },
    { href: '/mould/assets', label: 'Moulds', icon: Hammer },
    { href: '/mould/jobs', label: 'Jobs', icon: ClipboardEdit },
    { href: '/mould/allocation', label: 'Time Allocation', icon: Users },
    { href: '/mould/month-lock', label: 'Month Lock', icon: Lock },
    { href: '/mould/settings', label: 'Settings', icon: Settings },
  ],
  plantpro: [
    { href: '/plantpro/dashboard', label: 'HR Dashboard', icon: LayoutDashboard },
    { href: '/plantpro/ot', label: 'OT & Allocation', icon: Clock },
    { href: '/plantpro/timesheet', label: 'Timesheet', icon: ClipboardCheck },
    { href: '/plantpro/hr', label: 'HR Pay Input', icon: DollarSign },
    { href: '/plantpro/hostel', label: 'Hostel', icon: BedDouble },
    { href: '/plantpro/documents', label: 'Documents', icon: FileText },
    { href: '/plantpro/import', label: 'Import', icon: Upload },
    { href: '/plantpro/targets', label: 'Targets', icon: Target },
    { href: '/plantpro/claims', label: 'Claims & Reports', icon: Receipt },
    { href: '/plantpro/config', label: 'Config', icon: Settings },
  ],
  meetings: [
    { href: '/meetings/workspace', label: 'My Workspace', icon: LayoutDashboard },
    { href: '/meetings', label: 'Meetings', icon: CalendarDays },
    { href: '/meetings/todos', label: 'To-dos', icon: ListChecks },
    { href: '/meetings/growth-plan', label: 'Growth Plan', icon: Target },
    { href: '/meetings/org-chart', label: 'Org Chart', icon: Network },
    { href: '/meetings/direct-reports', label: 'Direct Reports', icon: Users },
    { href: '/meetings/one-on-one', label: 'Quarterly 1:1', icon: MessagesSquare },
    { href: '/meetings/rprs', label: 'Right Person Right Seat', icon: UserCheck },
    { href: '/meetings/session-prep', label: 'Session Prep', icon: ClipboardList },
    { href: '/meetings/coach', label: 'Coach (Whiteboard)', icon: PenTool },
    { href: '/meetings/documents', label: 'Documents', icon: FileText },
    { href: '/meetings/resources', label: 'Resource Center', icon: LifeBuoy },
    { href: '/meetings/people', label: 'People & Invitations', icon: UserPlus },
    { href: '/meetings/settings', label: 'Settings', icon: Settings },
  ],
  qaqc: [
    { href: '/qaqc/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/qaqc/records', label: 'Test Records', icon: ClipboardCheck },
    { href: '/qaqc/targets', label: 'Targets', icon: Target },
    { href: '/qaqc/settings', label: 'Settings', icon: Settings },
  ],
}

const SIDEBAR_KEY = 'av-sidebar-collapsed'
function subscribeSidebar(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener('av-sidebar', cb)
  return () => { window.removeEventListener('storage', cb); window.removeEventListener('av-sidebar', cb) }
}
function readSidebar() {
  try { return window.localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
}
function writeSidebar(collapsed: boolean) {
  try { window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0') } catch { /* private mode */ }
  window.dispatchEvent(new Event('av-sidebar'))
}

export default function AppNavigation({ userEmail, fullName, departments, navPermissions, canUseAiHelper, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebar, () => false)
  const pathname = usePathname()
  const firstName = (fullName || userEmail.split('@')[0]).split(' ')[0]

  const isPortal = pathname === '/'

  const activeDept: Department | null = pathname.startsWith('/cement')
    ? 'cement'
    : pathname.startsWith('/rebar')
    ? 'rebar'
    : pathname.startsWith('/security')
    ? 'security'
    : pathname.startsWith('/maintenance')
    ? 'maintenance'
    : pathname.startsWith('/mould')
    ? 'mould'
    : pathname.startsWith('/plantpro')
    ? 'plantpro'
    : pathname.startsWith('/meetings')
    ? 'meetings'
    : pathname.startsWith('/qaqc')
    ? 'qaqc'
    : isPortal
    ? null
    : departments[0]?.department ?? null

  const activeRole = departments.find(d => d.department === activeDept)?.role

  const isAllowed = (navKey: string) =>
    activeRole === 'admin' ||
    (!!activeDept && !!activeRole && navPermissions.some(p => p.department === activeDept && p.role === activeRole && p.nav_key === navKey))

  const settingsHref = activeDept ? SETTINGS_HREF[activeDept] : ''
  const navItems = activeDept ? NAV_ITEMS[activeDept].filter(item => item.href !== settingsHref && isAllowed(item.href)) : []
  const isAdminAnywhere = departments.some(d => d.role === 'admin')
  const canSeeAccessControl = isAdminAnywhere || departments.some(d => d.department === 'meetings' && d.role === 'manager')
  const canSeeSettings = !!activeDept && isAllowed(settingsHref)

  const closeSidebar = () => setIsOpen(false)

  const hasMultipleDepartments = departments.length > 1
  const ActiveIcon = isPortal ? LayoutGrid : (activeDept ? DEPARTMENT_ICON[activeDept] : Building2)

  // Shared Sub-nav contents
  const renderSubNavContent = (onLinkClick?: () => void) => (
    <div className="flex flex-col h-full">
      {/* Sub-nav Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400">
              <ActiveIcon className="w-4 h-4" />
            </span>
            <h1 className="text-sm font-bold text-white tracking-wide truncate">
              {isPortal ? 'App Launcher' : (activeDept ? DEPARTMENT_LABEL[activeDept] : 'AlphaVision')}
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1 truncate">
            {greeting()}, {firstName} 👋
          </p>
        </div>
        <button
          onClick={() => writeSidebar(true)}
          className="hidden md:inline-flex p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
          aria-label="Collapse Submenu"
          title="Collapse Submenu"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {isPortal ? (
          <>
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Portal Overview
            </div>
            <Link
              href="/"
              onClick={onLinkClick}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white shadow-sm shadow-blue-600/20"
            >
              <LayoutGrid className="w-4 h-4 shrink-0 text-white" />
              <span className="truncate">All Modules Portal</span>
            </Link>

            <div className="pt-3 my-2 border-t border-slate-800/70" />
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Switch Department
            </div>
            {departments.map(d => {
              const Icon = DEPARTMENT_ICON[d.department] || Building2
              return (
                <Link
                  key={d.department}
                  href={DEPARTMENT_HOME[d.department]}
                  onClick={onLinkClick}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-blue-400 transition-colors" />
                    <span className="truncate">{DEPARTMENT_LABEL[d.department]}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              )
            })}
          </>
        ) : (
          <>
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Menu
            </div>
            {navItems.map(item => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onLinkClick}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}

            <div className="pt-2 my-2 border-t border-slate-800/70" />

            {canSeeSettings && (
              <Link
                href={settingsHref}
                onClick={onLinkClick}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  pathname === settingsHref
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <Settings className={`w-4 h-4 shrink-0 ${pathname === settingsHref ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">Settings</span>
              </Link>
            )}

            {activeDept === 'maintenance' && (
              <Link
                href="/maintenance/help"
                onClick={onLinkClick}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  pathname === '/maintenance/help'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <HelpCircle className={`w-4 h-4 shrink-0 ${pathname === '/maintenance/help' ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">User Manual</span>
              </Link>
            )}
          </>
        )}

        {canSeeAccessControl && (
          <Link
            href="/admin/access"
            onClick={onLinkClick}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
              pathname === '/admin/access'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <ShieldCheck className={`w-4 h-4 shrink-0 ${pathname === '/admin/access' ? 'text-white' : 'text-slate-400'}`} />
            <span className="truncate">Access Control</span>
          </Link>
        )}

        {/* In single-department mode, put AI & Profile in the Sub-nav menu */}
        {!hasMultipleDepartments && (
          <>
            {canUseAiHelper && (
              <Link
                href="/ai-helper"
                onClick={onLinkClick}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  pathname === '/ai-helper'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <Sparkles className={`w-4 h-4 shrink-0 ${pathname === '/ai-helper' ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">AI Helper</span>
              </Link>
            )}
            <Link
              href="/profile"
              onClick={onLinkClick}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                pathname === '/profile'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <User className={`w-4 h-4 shrink-0 ${pathname === '/profile' ? 'text-white' : 'text-slate-400'}`} />
              <span className="truncate">My Profile</span>
            </Link>
          </>
        )}
      </nav>

      {/* Footer / User & Sign Out */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/50">
        <div className="px-2 py-1 mb-2">
          <p className="text-xs font-semibold text-slate-200 truncate">{fullName || firstName}</p>
          <p className="text-[11px] text-slate-400 truncate">{userEmail}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex items-center gap-2 px-3 py-1.5 w-full rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors text-slate-400 text-xs font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </form>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gray-50 text-slate-900 flex-col md:flex-row">
      {/* Mobile Top Navbar */}
      <header className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-200 transition"
            aria-label="Toggle navigation"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-blue-600/20 text-blue-400">
              <ActiveIcon className="w-4 h-4" />
            </span>
            <span className="font-bold text-base tracking-tight">
              {activeDept ? DEPARTMENT_LABEL[activeDept] : 'AlphaVision'}
            </span>
          </div>
        </div>
        <span className="text-xs text-slate-400 max-w-[130px] truncate">{greeting()}, {firstName}</span>
      </header>

      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-xs transition-opacity animate-in fade-in"
        />
      )}

      {/* Mobile Drawer (Dual-column if multiple departments) */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 md:hidden flex print:hidden
          transform transition-transform duration-200 ease-in-out shadow-2xl
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Mobile Slim Rail */}
        {hasMultipleDepartments && (
          <div className="w-16 bg-slate-950 flex flex-col items-center py-3 border-r border-slate-800/80">
            <Link
              href="/"
              onClick={closeSidebar}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3 shadow-sm shrink-0 transition ${
                isPortal
                  ? 'bg-blue-600 shadow-blue-500/30 ring-2 ring-blue-400/60'
                  : 'bg-gradient-to-br from-blue-600 to-indigo-700 hover:scale-105'
              }`}
              title="App Launcher · Portal"
            >
              <LayoutGrid className="w-5 h-5" />
            </Link>
            <div className="w-8 h-px bg-slate-800/80 mb-2 shrink-0" />
            <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto px-1.5">
              {departments.map(d => {
                const Icon = DEPARTMENT_ICON[d.department] || Building2
                const isActive = activeDept === d.department
                const label = DEPARTMENT_LABEL[d.department]
                return (
                  <Link
                    key={d.department}
                    href={DEPARTMENT_HOME[d.department]}
                    onClick={closeSidebar}
                    className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    title={label}
                  >
                    <Icon className="w-5 h-5" />
                    {isActive && (
                      <span className="absolute -left-1.5 w-1 h-4 bg-blue-400 rounded-r-full" />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Mobile Sub-nav */}
        <div className="w-60 bg-slate-900 text-white flex flex-col">
          {renderSubNavContent(closeSidebar)}
        </div>
      </aside>

      {/* Desktop Navigation */}
      <div className="hidden md:flex shrink-0 print:hidden h-screen sticky top-0">
        {/* Desktop Slim Rail (App Rail) */}
        {hasMultipleDepartments && (
          <aside className="w-16 bg-slate-950 border-r border-slate-800/80 flex flex-col items-center py-4 z-20 select-none">
            {/* Logo / App Launcher Icon */}
            <div className="relative group mb-3">
              <Link
                href="/"
                className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                  isPortal
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/60'
                    : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20 hover:scale-105 hover:from-blue-500 hover:to-indigo-600'
                }`}
                aria-label="App Launcher · Portal"
              >
                <LayoutGrid className="w-5 h-5" />
                {isPortal && (
                  <span className="absolute -left-2.5 w-1 h-5 bg-blue-400 rounded-r-full" />
                )}
              </Link>

              {/* Tooltip on mouse hover */}
              <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-slate-100 text-xs font-semibold rounded-lg shadow-xl border border-slate-700/80 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 flex items-center gap-1.5">
                <span>App Launcher · Main Portal</span>
              </div>
            </div>

            <div className="w-8 h-px bg-slate-800/80 mb-3" />

            {/* Department Icons List (Scrollable) */}
            <div className="flex-1 w-full flex flex-col items-center gap-2.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden px-2">
              {departments.map(d => {
                const Icon = DEPARTMENT_ICON[d.department] || Building2
                const isActive = activeDept === d.department
                const label = DEPARTMENT_LABEL[d.department]
                return (
                  <div key={d.department} className="relative group">
                    <Link
                      href={DEPARTMENT_HOME[d.department]}
                      className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/50'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {isActive && (
                        <span className="absolute -left-2.5 w-1 h-5 bg-blue-400 rounded-r-full" />
                      )}
                    </Link>

                    {/* Hover Tooltip */}
                    <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-slate-100 text-xs font-semibold rounded-lg shadow-xl border border-slate-700/80 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 flex items-center gap-1.5">
                      <span>{label}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="w-8 h-px bg-slate-800/80 my-3" />

            {/* Slim Rail Bottom Actions */}
            <div className="flex flex-col items-center gap-2 px-2">
              {canUseAiHelper && (
                <div className="relative group">
                  <Link
                    href="/ai-helper"
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 ${
                      pathname === '/ai-helper'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                  </Link>
                  <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-slate-100 text-xs font-semibold rounded-lg shadow-xl border border-slate-700/80 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                    AI Helper
                  </div>
                </div>
              )}

              <div className="relative group">
                <Link
                  href="/profile"
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 ${
                    pathname === '/profile'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <User className="w-4 h-4" />
                </Link>
                <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-slate-100 text-xs font-semibold rounded-lg shadow-xl border border-slate-700/80 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  My Profile
                </div>
              </div>

              {/* Collapse/Expand Submenu Toggle */}
              <button
                onClick={() => writeSidebar(!collapsed)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
                title={collapsed ? 'Expand Submenu' : 'Collapse Submenu'}
                aria-label={collapsed ? 'Expand Submenu' : 'Collapse Submenu'}
              >
                {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            </div>
          </aside>
        )}

        {/* Fallback slim rail for single department mode when collapsed */}
        {!hasMultipleDepartments && collapsed && (
          <div className="w-10 bg-slate-900 flex flex-col items-center pt-4 border-r border-slate-800/80">
            <button
              onClick={() => writeSidebar(false)}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Desktop Sub-nav (Department Pages) */}
        {!collapsed && (
          <aside className="w-60 bg-slate-900 text-white flex flex-col border-r border-slate-800/80">
            {renderSubNavContent()}
          </aside>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  )
}
