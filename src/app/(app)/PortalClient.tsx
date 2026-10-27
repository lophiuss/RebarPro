'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import {
  Boxes, Factory, Hammer, ShieldCheck, Wrench, ClipboardCheck,
  Users, CalendarDays, ArrowUpRight, Search, Sparkles,
  Building2, ChevronRight, Filter, CheckSquare,
  ArrowRight, Gauge, Layers, Sun, Moon,
  Clock, AlertCircle, RefreshCw
} from 'lucide-react'
import {
  type Department,
  type DepartmentAccess,
  DEPARTMENT_LABEL,
  DEPARTMENT_HOME,
  DEPARTMENT_ICON,
} from '@/components/AppNavigation'
import { type PortalKpiSummary, type PortalActionItem } from './page'

interface Props {
  userEmail: string
  fullName: string | null
  departments: DepartmentAccess[]
  kpis: PortalKpiSummary
  actionItems: PortalActionItem[]
}

type ModuleCategory = 'all' | 'production' | 'operations' | 'corporate'
type ViewMode = 'launchpad' | 'cockpit'

interface ModuleInfo {
  department: Department
  name: string
  category: 'production' | 'operations' | 'corporate'
  categoryLabel: string
  description: string
  lightColor: {
    bg: string
    text: string
    border: string
    badge: string
    hoverBorder: string
  }
  darkColor: {
    bg: string
    text: string
    border: string
    badge: string
    hoverBorder: string
  }
  quickLinks: { label: string; href: string }[]
}

const MODULE_DEFINITIONS: Record<Department, ModuleInfo> = {
  rebar: {
    department: 'rebar',
    name: 'Rebar',
    category: 'production',
    categoryLabel: 'Manufacturing & Materials',
    description: 'Steel reinforcement inventory tracking, intake/outtake transaction batches, and monthly cost consumption reporting.',
    lightColor: {
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      text: 'text-amber-600',
      border: 'border-amber-200',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      hoverBorder: 'hover:border-amber-400',
    },
    darkColor: {
      bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      text: 'text-amber-400',
      border: 'border-amber-500/20',
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      hoverBorder: 'hover:border-amber-500/50',
    },
    quickLinks: [
      { label: 'Dashboard', href: '/rebar/dashboard' },
      { label: 'Transactions', href: '/rebar/transactions' },
      { label: 'Stock Take', href: '/rebar/stock-take' },
      { label: 'Monthly Report', href: '/rebar/monthly-report' },
    ],
  },
  cement: {
    department: 'cement',
    name: 'BPlant',
    category: 'production',
    categoryLabel: 'Manufacturing & Materials',
    description: 'Ready-mix concrete batching plant operations, weighbridge in/out management, and raw material unloading records.',
    lightColor: {
      bg: 'bg-orange-50 text-orange-700 border-orange-200',
      text: 'text-orange-600',
      border: 'border-orange-200',
      badge: 'bg-orange-50 text-orange-700 border-orange-200',
      hoverBorder: 'hover:border-orange-400',
    },
    darkColor: {
      bg: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      text: 'text-orange-400',
      border: 'border-orange-500/20',
      badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      hoverBorder: 'hover:border-orange-500/50',
    },
    quickLinks: [
      { label: 'Overview', href: '/cement' },
      { label: 'Planning', href: '/cement/planning' },
      { label: 'Weight In', href: '/cement/weight-in' },
      { label: 'Unloading', href: '/cement/unloading' },
      { label: 'Report', href: '/cement/report' },
    ],
  },
  mould: {
    department: 'mould',
    name: 'Mould',
    category: 'production',
    categoryLabel: 'Manufacturing & Materials',
    description: 'Precast mould asset lifecycle tracking, maintenance work orders, technician time allocation, and cost amortisation.',
    lightColor: {
      bg: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      text: 'text-yellow-600',
      border: 'border-yellow-200',
      badge: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      hoverBorder: 'hover:border-yellow-400',
    },
    darkColor: {
      bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      text: 'text-yellow-400',
      border: 'border-yellow-500/20',
      badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      hoverBorder: 'hover:border-yellow-500/50',
    },
    quickLinks: [
      { label: 'Monthly Cost', href: '/mould' },
      { label: 'Mould Assets', href: '/mould/assets' },
      { label: 'Jobs', href: '/mould/jobs' },
      { label: 'Time Allocation', href: '/mould/allocation' },
    ],
  },
  security: {
    department: 'security',
    name: 'Security',
    category: 'operations',
    categoryLabel: 'Operations & Safety',
    description: 'Gate entry and exit checkpoints for visitors and vehicles, electronic guard logs, key management, and GPS clocking.',
    lightColor: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      text: 'text-emerald-600',
      border: 'border-emerald-200',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      hoverBorder: 'hover:border-emerald-400',
    },
    darkColor: {
      bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      text: 'text-emerald-400',
      border: 'border-emerald-500/20',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      hoverBorder: 'hover:border-emerald-500/50',
    },
    quickLinks: [
      { label: 'Dashboard', href: '/security' },
      { label: 'Gate Entries', href: '/security/entries' },
      { label: 'Post Logs', href: '/security/post-logs' },
      { label: 'Keys Registry', href: '/security/keys' },
      { label: 'GPS Clocking', href: '/security/gps-clocking' },
    ],
  },
  maintenance: {
    department: 'maintenance',
    name: 'Maintenance',
    category: 'operations',
    categoryLabel: 'Operations & Safety',
    description: 'Plant-wide heavy equipment asset registry, breakdown work requests, preventative routine checklists, and spare parts.',
    lightColor: {
      bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      text: 'text-cyan-600',
      border: 'border-cyan-200',
      badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      hoverBorder: 'hover:border-cyan-400',
    },
    darkColor: {
      bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      text: 'text-cyan-400',
      border: 'border-cyan-500/20',
      badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      hoverBorder: 'hover:border-cyan-500/50',
    },
    quickLinks: [
      { label: 'Dashboard', href: '/maintenance' },
      { label: 'Equipment', href: '/maintenance/equipment' },
      { label: 'Work Requests', href: '/maintenance/work-requests' },
      { label: 'Spare Parts', href: '/maintenance/spare-parts' },
      { label: 'Schedules', href: '/maintenance/schedule' },
    ],
  },
  qaqc: {
    department: 'qaqc',
    name: 'QAQC',
    category: 'operations',
    categoryLabel: 'Operations & Safety',
    description: 'Concrete cube compressive test tracking, compliance records, 3rd party lab invoice tracking, and credit note billing.',
    lightColor: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200',
      text: 'text-rose-600',
      border: 'border-rose-200',
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      hoverBorder: 'hover:border-rose-400',
    },
    darkColor: {
      bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      text: 'text-rose-400',
      border: 'border-rose-500/20',
      badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      hoverBorder: 'hover:border-rose-500/50',
    },
    quickLinks: [
      { label: 'Test Records', href: '/qaqc/records' },
      { label: 'Dashboard', href: '/qaqc/dashboard' },
      { label: 'Targets', href: '/qaqc/targets' },
      { label: 'Billing Config', href: '/qaqc/settings' },
    ],
  },
  plantpro: {
    department: 'plantpro',
    name: 'HR & Workers',
    category: 'corporate',
    categoryLabel: 'Corporate & People',
    description: 'Overtime & daily workforce allocation, supervisor timesheet verification, monthly wage inputs, hostel beds, and claims.',
    lightColor: {
      bg: 'bg-purple-50 text-purple-700 border-purple-200',
      text: 'text-purple-600',
      border: 'border-purple-200',
      badge: 'bg-purple-50 text-purple-700 border-purple-200',
      hoverBorder: 'hover:border-purple-400',
    },
    darkColor: {
      bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      text: 'text-purple-400',
      border: 'border-purple-500/20',
      badge: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      hoverBorder: 'hover:border-purple-500/50',
    },
    quickLinks: [
      { label: 'OT & Allocation', href: '/plantpro/ot' },
      { label: 'HR Dashboard', href: '/plantpro/dashboard' },
      { label: 'Timesheet', href: '/plantpro/timesheet' },
      { label: 'Hostel Matrix', href: '/plantpro/hostel' },
    ],
  },
  meetings: {
    department: 'meetings',
    name: 'Meetings & Strategy',
    category: 'corporate',
    categoryLabel: 'Corporate & People',
    description: 'Personal executive workspace, company-wide meetings, team to-do management, 1:1 quarterly reviews, and org chart.',
    lightColor: {
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      text: 'text-blue-600',
      border: 'border-blue-200',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      hoverBorder: 'hover:border-blue-400',
    },
    darkColor: {
      bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      text: 'text-blue-400',
      border: 'border-blue-500/20',
      badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      hoverBorder: 'hover:border-blue-500/50',
    },
    quickLinks: [
      { label: 'My Workspace', href: '/meetings/workspace' },
      { label: 'Meetings', href: '/meetings' },
      { label: 'Action To-dos', href: '/meetings/todos' },
      { label: 'Org Chart', href: '/meetings/org-chart' },
    ],
  },
}

const CATEGORY_TABS: { id: ModuleCategory; label: string }[] = [
  { id: 'all', label: 'All Modules' },
  { id: 'production', label: 'Manufacturing & Materials' },
  { id: 'operations', label: 'Operations & Safety' },
  { id: 'corporate', label: 'Corporate & People' },
]

export default function PortalClient({ userEmail, fullName, departments, kpis, actionItems }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ModuleCategory>('all')
  // By default, open App Launcher for clear, uncluttered module access
  const [viewMode, setViewMode] = useState<ViewMode>('launchpad')
  // Theme state: 'light' or 'dark', saved in localStorage
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem('av-portal-theme')
      if (storedTheme === 'dark') {
        setIsDark(true)
      }
      const storedView = localStorage.getItem('av-portal-view') as ViewMode
      if (storedView === 'cockpit' || storedView === 'launchpad') {
        setViewMode(storedView)
      }
    } catch {
      // Ignore private mode errors
    }
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    try {
      localStorage.setItem('av-portal-theme', next ? 'dark' : 'light')
    } catch {}
  }

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem('av-portal-view', mode)
    } catch {}
  }

  const firstName = (fullName || userEmail.split('@')[0]).split(' ')[0]
  const deptSet = useMemo(() => new Set(departments.map(d => d.department)), [departments])

  const accessibleModules = useMemo(() => {
    return departments
      .map(d => {
        const def = MODULE_DEFINITIONS[d.department]
        return {
          ...def,
          role: d.role,
        }
      })
      .filter(Boolean)
  }, [departments])

  const filteredModules = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return accessibleModules.filter(m => {
      if (activeTab !== 'all' && m.category !== activeTab) return false
      if (!q) return true
      const matchName = m.name.toLowerCase().includes(q)
      const matchLabel = DEPARTMENT_LABEL[m.department].toLowerCase().includes(q)
      const matchDesc = m.description.toLowerCase().includes(q)
      const matchQuick = m.quickLinks.some(l => l.label.toLowerCase().includes(q))
      return matchName || matchLabel || matchDesc || matchQuick
    })
  }, [accessibleModules, activeTab, searchQuery])

  // Group modules by category for presentation
  const groupedModules = useMemo(() => {
    const groups: { category: ModuleCategory; title: string; items: typeof filteredModules }[] = [
      {
        category: 'production',
        title: 'Manufacturing & Materials',
        items: filteredModules.filter(m => m.category === 'production'),
      },
      {
        category: 'operations',
        title: 'Plant Operations, Safety & Quality',
        items: filteredModules.filter(m => m.category === 'operations'),
      },
      {
        category: 'corporate',
        title: 'Corporate Organization & Workforce',
        items: filteredModules.filter(m => m.category === 'corporate'),
      },
    ]
    return groups.filter(g => g.items.length > 0)
  }, [filteredModules])

  // Micro status badge helper for App Launcher cards (unobtrusive live state)
  const getMicroStatus = (dept: Department) => {
    switch (dept) {
      case 'cement':
        return kpis.todayCementWeightIns !== null ? `${kpis.todayCementWeightIns} Loads today` : null
      case 'maintenance':
        return kpis.pendingMaintenanceRequests ? `${kpis.pendingMaintenanceRequests} Requests` : null
      case 'qaqc':
        return kpis.pendingQaqcTests ? `${kpis.pendingQaqcTests} Tests Pending` : null
      case 'security':
        return kpis.todaySecurityEntries !== null ? `${kpis.todaySecurityEntries} Passes today` : null
      case 'plantpro':
        return kpis.pendingOtRequests ? `${kpis.pendingOtRequests} OT Pending` : null
      case 'meetings':
        return kpis.myPendingTodosCount ? `${kpis.myPendingTodosCount} Action Items` : null
      default:
        return null
    }
  }

  // Full KPI cards list for Command Center
  const kpiCards = useMemo(() => {
    const list: {
      id: string
      title: string
      value: string | number
      subtext: string
      icon: React.ElementType
      lightStyle: string
      darkStyle: string
      href: string
      visible: boolean
    }[] = [
      {
        id: 'cement-weight-in',
        title: 'BPlant Weighbridge',
        value: kpis.todayCementWeightIns !== null ? `${kpis.todayCementWeightIns} Loads` : '--',
        subtext: 'Today weigh-ins processed',
        icon: Factory,
        lightStyle: 'text-orange-600 bg-orange-50 border-orange-200',
        darkStyle: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
        href: '/cement/weight-in',
        visible: deptSet.has('cement'),
      },
      {
        id: 'maintenance-pending',
        title: 'Maintenance Orders',
        value: kpis.pendingMaintenanceRequests !== null ? kpis.pendingMaintenanceRequests : '--',
        subtext: 'Pending work requests',
        icon: Wrench,
        lightStyle: 'text-cyan-600 bg-cyan-50 border-cyan-200',
        darkStyle: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
        href: '/maintenance/work-requests',
        visible: deptSet.has('maintenance'),
      },
      {
        id: 'qaqc-pending-tests',
        title: 'QAQC Pending Reports',
        value: kpis.pendingQaqcTests !== null ? kpis.pendingQaqcTests : '--',
        subtext: 'Awaiting lab report entry',
        icon: ClipboardCheck,
        lightStyle: 'text-rose-600 bg-rose-50 border-rose-200',
        darkStyle: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        href: '/qaqc/records',
        visible: deptSet.has('qaqc'),
      },
      {
        id: 'security-entries',
        title: 'Gate Clearances',
        value: kpis.todaySecurityEntries !== null ? `${kpis.todaySecurityEntries} Passes` : '--',
        subtext: 'Visitor / Vehicle entries today',
        icon: ShieldCheck,
        lightStyle: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        darkStyle: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        href: '/security/entries',
        visible: deptSet.has('security'),
      },
      {
        id: 'plantpro-ot',
        title: 'Workforce Overtime',
        value: kpis.pendingOtRequests !== null ? kpis.pendingOtRequests : '--',
        subtext: 'OT requests pending review',
        icon: Users,
        lightStyle: 'text-purple-600 bg-purple-50 border-purple-200',
        darkStyle: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
        href: '/plantpro/ot',
        visible: deptSet.has('plantpro'),
      },
      {
        id: 'meetings-todos',
        title: 'My Action To-Dos',
        value: kpis.myPendingTodosCount !== null ? kpis.myPendingTodosCount : '--',
        subtext: 'Open tasks assigned to me',
        icon: CalendarDays,
        lightStyle: 'text-blue-600 bg-blue-50 border-blue-200',
        darkStyle: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        href: '/meetings/workspace',
        visible: deptSet.has('meetings'),
      },
    ]

    return list.filter(k => k.visible)
  }, [kpis, deptSet])

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col transition-colors duration-200">
        
        {/* ========================================================= */}
        {/* Top Header & Navigation Banner                           */}
        {/* ========================================================= */}
        <header className="border-b border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              
              {/* Left Brand & Greeting */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Operational · {accessibleModules.length} Modules</span>
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">AlphaVision Portal</span>
                </div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Welcome back, {firstName} 👋
                </h1>
              </div>

              {/* Right View Switcher & Theme Toggle */}
              <div className="flex items-center gap-3">
                {/* Mode Switcher Tabs */}
                <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs font-semibold">
                  <button
                    onClick={() => handleViewChange('launchpad')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
                      viewMode === 'launchpad'
                        ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>App Launcher</span>
                  </button>
                  <button
                    onClick={() => handleViewChange('cockpit')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
                      viewMode === 'cockpit'
                        ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    <span>Command Centre</span>
                  </button>
                </div>

                {/* Theme Toggle (Light / Dark) */}
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-xs"
                  aria-label="Toggle theme"
                  title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
                </button>
              </div>
            </div>

            {/* Bottom Filter & Search (For App Launcher mode) */}
            {viewMode === 'launchpad' && (
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {CATEGORY_TABS.map(tab => {
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                          isActive
                            ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search apps or actions..."
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* ========================================================= */}
        {/* Main Workspace Body                                      */}
        {/* ========================================================= */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-12 py-8">

          {/* ------------------------------------------------------- */}
          {/* VIEW 1: APP LAUNCHER (Clean, Dedicated Grid)            */}
          {/* ------------------------------------------------------- */}
          {viewMode === 'launchpad' && (
            <div className="space-y-10 animate-in fade-in duration-150">
              {groupedModules.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/40 p-8 shadow-xs">
                  <Filter className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No matching apps found</p>
                  <p className="text-xs text-slate-500 mt-1">Try clearing your search query or switching categories.</p>
                  <button
                    onClick={() => { setSearchQuery(''); setActiveTab('all') }}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shadow-xs"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                groupedModules.map(group => (
                  <section key={group.category} className="space-y-4">
                    {/* Category Title */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-500" />
                      <h2 className="text-xs font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
                        {group.title}
                      </h2>
                      <span className="text-xs text-slate-400 dark:text-slate-600 font-medium">({group.items.length})</span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800/80 ml-2" />
                    </div>

                    {/* App Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {group.items.map(m => {
                        const Icon = DEPARTMENT_ICON[m.department] || Building2
                        const homeHref = DEPARTMENT_HOME[m.department]
                        const colors = isDark ? m.darkColor : m.lightColor
                        const microStatus = getMicroStatus(m.department)

                        return (
                          <div
                            key={m.department}
                            className={`group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900/60 p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:hover:bg-slate-900 ${colors.hoverBorder}`}
                          >
                            <div>
                              {/* Card Header: Icon + Status Pill + Direct Launch Arrow */}
                              <div className="flex items-start justify-between gap-3 mb-3.5">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${colors.bg} transition-transform group-hover:scale-105`}>
                                  <Icon className="w-5 h-5" />
                                </div>
                                
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  {microStatus && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                                      {microStatus}
                                    </span>
                                  )}
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${colors.badge}`}>
                                    {m.role ? m.role.toUpperCase() : 'MEMBER'}
                                  </span>
                                  <Link
                                    href={homeHref}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                    title={`Launch ${DEPARTMENT_LABEL[m.department]}`}
                                  >
                                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                  </Link>
                                </div>
                              </div>

                              {/* Title & Description */}
                              <Link href={homeHref} className="block">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {DEPARTMENT_LABEL[m.department]}
                                </h3>
                              </Link>
                              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                {m.description}
                              </p>
                            </div>

                            {/* Quick Actions Footer */}
                            <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80">
                              <div className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase mb-2">
                                Shortcuts
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {m.quickLinks.slice(0, 4).map(link => (
                                  <Link
                                    key={link.href}
                                    href={link.href}
                                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:bg-blue-600 dark:hover:text-white transition-colors border border-slate-200/70 dark:border-slate-700/50"
                                  >
                                    {link.label}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          )}

          {/* ------------------------------------------------------- */}
          {/* VIEW 2: COMMAND CENTRE (Dedicated Live Operations Pulse)*/}
          {/* ------------------------------------------------------- */}
          {viewMode === 'cockpit' && (
            <div className="space-y-8 animate-in fade-in duration-150">
              {/* Top Operational KPIs Section */}
              <section className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h2 className="text-xs font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
                      Real-time Division Indicators
                    </h2>
                  </div>
                  <span className="text-xs text-slate-400">Auto-calculated live stats</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
                  {kpiCards.map(k => {
                    const Icon = k.icon
                    const style = isDark ? k.darkStyle : k.lightStyle
                    return (
                      <Link
                        key={k.id}
                        href={k.href}
                        className="group rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:bg-slate-900 hover:border-blue-400 dark:hover:border-slate-700 shadow-xs"
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <span className={`p-2 rounded-xl border ${style}`}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                        </div>
                        <div className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                          {k.value}
                        </div>
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-0.5 truncate">
                          {k.title}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                          {k.subtext}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>

              {/* Action Stream + Shortcuts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* My Action Items (2 cols) */}
                <div className="lg:col-span-2 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <h2 className="text-xs font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
                        My Action Stream & Pending Requests
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 font-bold">
                        {actionItems.length}
                      </span>
                    </div>
                    <Link href="/meetings/todos" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium">
                      <span>View all to-dos</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 divide-y divide-slate-100 dark:divide-slate-800/70 overflow-hidden shadow-xs">
                    {actionItems.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                        <CheckSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <span>All caught up! No pending work requests or personal to-dos.</span>
                      </div>
                    ) : (
                      actionItems.map(item => {
                        const DeptIcon = DEPARTMENT_ICON[item.department] || Building2
                        return (
                          <Link
                            key={item.id}
                            href={item.href}
                            className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group"
                          >
                            <div className="flex items-start gap-3.5 min-w-0">
                              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 mt-0.5 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <DeptIcon className="w-4 h-4 shrink-0" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {item.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${item.badgeColor}`}>
                                    {item.badgeText}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {item.subtitle}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[11px] text-slate-400 dark:text-slate-500 block">{item.date}</span>
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium inline-flex items-center gap-1 mt-1">
                                Review <ChevronRight className="w-3 h-3" />
                              </span>
                            </div>
                          </Link>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Right Column: AI Assistant + Shortcuts */}
                <div className="space-y-3.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <h2 className="text-xs font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
                      Smart Assistant & Fast Track
                    </h2>
                  </div>

                  <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-5 space-y-4 shadow-xs">
                    {/* AI Assistant Banner */}
                    <div className="rounded-xl p-4 bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-indigo-950/70 dark:to-blue-950/30 border border-blue-200 dark:border-blue-500/20">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-xs font-bold mb-1">
                        <Sparkles className="w-4 h-4" />
                        <span>AlphaVision AI Assistant</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                        Query real-time plant KPIs, inventory stock takes, equipment histories, or pending worker allocations.
                      </p>
                      <Link
                        href="/ai-helper"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition"
                      >
                        <span>Open AI Helper</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Operational Shortcuts
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Link
                          href="/cement/weight-in"
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-xs font-medium text-slate-700 dark:text-slate-200 transition flex items-center gap-2"
                        >
                          <Factory className="w-3.5 h-3.5 text-orange-500" />
                          <span className="truncate">Weigh In</span>
                        </Link>
                        <Link
                          href="/maintenance/work-requests"
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-xs font-medium text-slate-700 dark:text-slate-200 transition flex items-center gap-2"
                        >
                          <Wrench className="w-3.5 h-3.5 text-cyan-500" />
                          <span className="truncate">Work Order</span>
                        </Link>
                        <Link
                          href="/qaqc/records"
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-xs font-medium text-slate-700 dark:text-slate-200 transition flex items-center gap-2"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5 text-rose-500" />
                          <span className="truncate">Test Record</span>
                        </Link>
                        <Link
                          href="/security/entries"
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-xs font-medium text-slate-700 dark:text-slate-200 transition flex items-center gap-2"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="truncate">Gate Entry</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950 py-5 px-6 lg:px-12 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3 max-w-7xl w-full mx-auto">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-500" />
            <span>AlphaVision Manufacturing & Plant Operations OS</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/profile" className="hover:text-blue-600 dark:hover:text-slate-300 transition">My Profile</Link>
            <span>•</span>
            <Link href="/ai-helper" className="hover:text-blue-600 dark:hover:text-slate-300 transition">AI Assistant</Link>
            <span>•</span>
            <button onClick={toggleTheme} className="hover:text-blue-600 dark:hover:text-slate-300 transition flex items-center gap-1">
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
