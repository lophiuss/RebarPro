'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Boxes, Factory, Hammer, ShieldCheck, Wrench, ClipboardCheck,
  Users, CalendarDays, ArrowUpRight, Search, Sparkles, User,
  CheckCircle2, Building2, ChevronRight, Filter
} from 'lucide-react'
import {
  type Department,
  type DepartmentAccess,
  DEPARTMENT_LABEL,
  DEPARTMENT_HOME,
  DEPARTMENT_ICON,
} from '@/components/AppNavigation'

interface Props {
  userEmail: string
  fullName: string | null
  departments: DepartmentAccess[]
}

type ModuleCategory = 'all' | 'production' | 'operations' | 'corporate'

interface ModuleInfo {
  department: Department
  name: string
  category: 'production' | 'operations' | 'corporate'
  categoryLabel: string
  description: string
  themeColor: {
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
    themeColor: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-500',
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
    themeColor: {
      bg: 'bg-orange-500/10',
      text: 'text-orange-500',
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
    themeColor: {
      bg: 'bg-yellow-500/10',
      text: 'text-yellow-500',
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
    themeColor: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-500',
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
    themeColor: {
      bg: 'bg-cyan-500/10',
      text: 'text-cyan-500',
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
    themeColor: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-500',
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
    themeColor: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-500',
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
    themeColor: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-500',
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

const CATEGORY_TABS: { id: ModuleCategory; label: string; countText?: string }[] = [
  { id: 'all', label: 'All Modules' },
  { id: 'production', label: 'Production & Materials' },
  { id: 'operations', label: 'Operations & Safety' },
  { id: 'corporate', label: 'Corporate & People' },
]

export default function PortalClient({ userEmail, fullName, departments }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ModuleCategory>('all')

  const firstName = (fullName || userEmail.split('@')[0]).split(' ')[0]

  // Map of departments the user has access to, with their role
  const accessMap = useMemo(() => {
    const map = new Map<Department, string>()
    departments.forEach(d => map.set(d.department, d.role))
    return map
  }, [departments])

  // Filter modules based on user access, search query, and category tab
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
      // Category filter
      if (activeTab !== 'all' && m.category !== activeTab) {
        return false
      }
      // Search filter
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
        title: 'Manufacturing & Production Materials',
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Hero Banner Section */}
      <div className="relative overflow-hidden border-b border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-950 pt-10 pb-8 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          {/* Top meta tags */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>System Operational · {accessibleModules.length} Active Modules Available</span>
            </div>
            <div className="text-xs text-slate-400">
              AlphaVision Enterprise Management Portal
            </div>
          </div>

          {/* Heading */}
          <div className="max-w-3xl">
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
              Welcome back, {firstName} 👋
            </h1>
            <p className="mt-2 text-sm lg:text-base text-slate-400 leading-relaxed">
              Select a specialized department portal below or use quick actions to jump straight into active workflows, reports, and real-time operations.
            </p>
          </div>

          {/* Search Bar & Tab Filters */}
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 rounded-xl border border-slate-800 overflow-x-auto [scrollbar-width:none]">
              {CATEGORY_TABS.map(tab => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search modules or pages..."
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-12 py-10 space-y-12">
        {groupedModules.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
            <Filter className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300">No matching modules found</p>
            <p className="text-xs text-slate-500 mt-1">Try clearing your search query or selecting a different tab.</p>
            <button
              onClick={() => { setSearchQuery(''); setActiveTab('all') }}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          groupedModules.map(group => (
            <section key={group.category} className="space-y-4">
              {/* Group Title Header */}
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <h2 className="text-sm font-bold tracking-wide uppercase text-slate-400">
                  {group.title}
                </h2>
                <span className="text-xs text-slate-600 font-medium">({group.items.length})</span>
                <div className="flex-1 h-px bg-slate-800/80 ml-2" />
              </div>

              {/* Grid of Module Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {group.items.map(m => {
                  const Icon = DEPARTMENT_ICON[m.department] || Building2
                  const homeHref = DEPARTMENT_HOME[m.department]
                  return (
                    <div
                      key={m.department}
                      className={`group relative flex flex-col justify-between rounded-2xl border border-slate-800/90 bg-slate-900/60 p-6 backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:bg-slate-900 hover:shadow-xl hover:shadow-blue-950/20 ${m.themeColor.hoverBorder}`}
                    >
                      <div>
                        {/* Card Header: Icon + Badge + Arrow */}
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${m.themeColor.bg} ${m.themeColor.text} transition-transform group-hover:scale-105`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${m.themeColor.badge}`}>
                              {m.role ? m.role.toUpperCase() : 'MEMBER'}
                            </span>
                            <Link
                              href={homeHref}
                              className="p-1.5 rounded-lg text-slate-500 group-hover:text-white group-hover:bg-slate-800 transition"
                              title={`Enter ${DEPARTMENT_LABEL[m.department]}`}
                            >
                              <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </Link>
                          </div>
                        </div>

                        {/* Title & Description */}
                        <Link href={homeHref} className="block group-hover:text-blue-400 transition-colors">
                          <h3 className="text-lg font-bold text-white tracking-tight">
                            {DEPARTMENT_LABEL[m.department]}
                          </h3>
                        </Link>
                        <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {m.description}
                        </p>
                      </div>

                      {/* Quick Links Section */}
                      <div className="mt-6 pt-4 border-t border-slate-800/70">
                        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase mb-2">
                          Quick Actions
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {m.quickLinks.slice(0, 4).map(link => (
                            <Link
                              key={link.href}
                              href={link.href}
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800/80 hover:bg-blue-600 hover:text-white text-slate-300 transition-colors border border-slate-700/50"
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

      {/* Footer Info Bar */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-6 lg:px-12 text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2 text-slate-400">
          <Building2 className="w-4 h-4 text-blue-500" />
          <span>AlphaVision Manufacturing & Operations Operating System</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <Link href="/profile" className="hover:text-slate-300 transition">User Profile</Link>
          <span>•</span>
          <Link href="/ai-helper" className="hover:text-slate-300 transition">AI Assistant</Link>
        </div>
      </footer>
    </div>
  )
}
