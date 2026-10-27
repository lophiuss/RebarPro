'use client'

import React, { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  HelpCircle, Boxes, Factory, ShieldCheck, Wrench, Hammer,
  Users, CalendarDays, ClipboardCheck, LayoutGrid, Gauge,
  ArrowRight, Search, CheckCircle2, AlertTriangle, BookOpen, ExternalLink
} from 'lucide-react'
import {
  type Department,
  DEPARTMENT_LABEL,
  DEPARTMENT_HOME,
  DEPARTMENT_ICON
} from '@/components/AppNavigation'

type ManualSection = Department | 'portal'

interface ModuleManual {
  id: ManualSection
  title: string
  subtitle: string
  icon: React.ElementType
  color: {
    bg: string
    text: string
    border: string
  }
  roles: { role: string; desc: string }[]
  keyFeatures: { title: string; steps: string[]; link?: string; linkText?: string }[]
  tips: string[]
}

const MANUAL_DATA: Record<ManualSection, ModuleManual> = {
  portal: {
    id: 'portal',
    title: 'Executive Portal & Command Centre',
    subtitle: 'Unified plant launchpad, real-time pulse KPIs, and action stream management.',
    icon: LayoutGrid,
    color: {
      bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800',
    },
    roles: [
      { role: 'Super Admin', desc: 'Manage global settings, configure AI Helper models and access, and oversee multi-department allocations.' },
      { role: 'Division Admin / Manager', desc: 'Access authorized departmental portals, review real-time KPIs, and assign operational tasks.' },
      { role: 'Staff / Operator', desc: 'Direct access to daily operational workflows with personalized to-do action streams.' },
    ],
    keyFeatures: [
      {
        title: 'Switching Between App Launcher & Command Centre',
        steps: [
          'Use the toggle in the top-right header to switch between "App Launcher" and "Command Centre".',
          'App Launcher: dedicated, clutter-free grid of 8 departmental modules with quick action shortcuts.',
          'Command Centre: real-time live plant indicators (today weigh-ins, open work requests, pending lab tests, gate entries) and unified personal action stream.',
          'Your view preference (and Light/Dark theme) is automatically remembered across sessions.',
        ],
        link: '/',
        linkText: 'Go to Main Portal',
      },
      {
        title: 'App Launcher Logo & Navigation Rail',
        steps: [
          'The 9-dot grid icon at the top of the left slim rail is the global App Launcher shortcut.',
          'Hover over the icon to view the quick tooltip "App Launcher · Main Portal".',
          'Clicking it from any department instantly returns you to the main portal.',
        ],
      },
    ],
    tips: [
      'Single-department staff are automatically routed straight to their dedicated department without unnecessary clicks.',
      'Use the category tabs (Production, Operations, Corporate) to filter specialized modules quickly.',
    ],
  },
  rebar: {
    id: 'rebar',
    title: 'Rebar Steel Management',
    subtitle: 'Steel reinforcement inventories, intake and usage transactions, physical stock takes, and monthly consumption.',
    icon: Boxes,
    color: {
      bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-800',
    },
    roles: [
      { role: 'Admin', desc: 'Full access to all stock movements, monthly report generation, setting master rebar sizes and target daily consumptions.' },
      { role: 'Manager', desc: 'Record incoming deliveries, log daily usage batches, execute physical stock takes, and download monthly reconciliations.' },
      { role: 'Staff', desc: 'Log transactional stock movements and view current inventory balances.' },
    ],
    keyFeatures: [
      {
        title: 'Recording Stock Movements (Transactions)',
        steps: [
          'Navigate to Transactions from the sidebar menu.',
          'Click "+ New Transaction" to record steel intake (Incoming) or production deduction (Usage).',
          'Select rebar size (e.g. H10, H13, H16, H20, H25, H32), input quantity in tonnes, and specify project reference or DO number.',
          'Support for Transfer, Wastage, and Suspended stock statuses.',
        ],
        link: '/rebar/transactions',
        linkText: 'View Transactions',
      },
      {
        title: 'Physical Stock Take Reconciliation',
        steps: [
          'Perform physical yard inventory counts periodically.',
          'Enter physical count per size into the Stock Take page to calculate book vs actual variance.',
          'Submit the count to recalibrate live opening balances for the subsequent period.',
        ],
        link: '/rebar/stock-take',
        linkText: 'Open Stock Take',
      },
    ],
    tips: [
      'Always enter rebar weights in metric tonnes (t).',
      'Lock down monthly transactions after the physical stock take to prevent retroactive adjustments.',
    ],
  },
  cement: {
    id: 'cement',
    title: 'BPlant (Ready-Mix Concrete & Batching)',
    subtitle: 'Weighbridge inbound/outbound weighing, silo inventory, cement transfer, and material delivery records.',
    icon: Factory,
    color: {
      bg: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20',
      text: 'text-orange-600 dark:text-orange-400',
      border: 'border-orange-200 dark:border-orange-800',
    },
    roles: [
      { role: 'Admin', desc: 'Configure silos, plants, materials, suppliers, and variance alert thresholds.' },
      { role: 'Operator / Weighbridge Officer', desc: 'Log Gross (Weight In), Tare (Weight Out), verify DO delivery weights, and monitor raw material silo unloading.' },
      { role: 'Manager', desc: 'Oversee daily production batching reports, silo transfers, and monthly consumption reconciliations.' },
    ],
    keyFeatures: [
      {
        title: 'Weighbridge Inbound Workflow (Weight In)',
        steps: [
          'When raw material lorry arrives, navigate to "Weight In".',
          'Input lorry registration number, supplier DO number, select target plant & silo, and record gross weight.',
          'Ensure the driver connects to the designated silo pipe before commencing blow-in.',
        ],
        link: '/cement/weight-in',
        linkText: 'Weigh In Terminal',
      },
      {
        title: 'Unloading & Weight Out',
        steps: [
          'Monitor unloading start and completion timestamps.',
          'Lorry returns to weighbridge after discharge: navigate to "Weight Out" to capture tare weight.',
          'System automatically computes Net Delivered Weight and flags any variance against DO weight.',
        ],
        link: '/cement/weight-out',
        linkText: 'Weigh Out Terminal',
      },
    ],
    tips: [
      'Configure auto-alert triggers in Alert Settings to get notified if silo variance exceeds tolerance thresholds.',
      'Archived records can be reviewed anytime under Records & Reports.',
    ],
  },
  security: {
    id: 'security',
    title: 'Site Security & Gate Checkpoints',
    subtitle: 'Visitor and delivery vehicle gate access, guard shift logs, key registry, incident reporting, and GPS patrol clocking.',
    icon: ShieldCheck,
    color: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-800',
    },
    roles: [
      { role: 'Admin / Security Supervisor', desc: 'Review audit logs, incident reports, GPS clocking compliance, and configure guard posts/gates.' },
      { role: 'Guard / Gatekeeper', desc: 'Register visitor & contractor vehicle entries, issue key passes, log shift handovers, and execute mobile GPS patrol clocking.' },
    ],
    keyFeatures: [
      {
        title: 'Logging Visitor & Vehicle Gate Entries',
        steps: [
          'Navigate to "Entries" on the guard post tablet or workstation.',
          'Select Category: Visitor, Delivery, In-house, or Security Event.',
          'Enter Driver / Person Name, IC/Passport, Vehicle No, and Purpose.',
          'Click Camera to attach vehicle/driver photo, assign badge number, and click "Check In".',
          'Upon exit, search vehicle number and click "Check Out" to record exit timestamp.',
        ],
        link: '/security/entries',
        linkText: 'Security Entries',
      },
      {
        title: 'Key Log & GPS Patrol Clocking',
        steps: [
          'Keys Registry: record which department or technician checked out plant keys with digital timestamp.',
          'GPS Clocking: guards on patrol scan QR or verify GPS coordinates at designated plant checkpoints to confirm active patrols.',
        ],
        link: '/security/gps-clocking',
        linkText: 'Patrol Clocking',
      },
    ],
    tips: [
      'In emergencies, the Panic Log button instantly records timestamp and notifies supervisor.',
      'Abnormal entries (e.g. unauthorized cargo or missing permit) can be flagged with a red alert badge.',
    ],
  },
  maintenance: {
    id: 'maintenance',
    title: 'Plant Machinery Maintenance',
    subtitle: 'Heavy equipment registry, preventive maintenance schedules, routine checklists, breakdown work orders, and spare parts.',
    icon: Wrench,
    color: {
      bg: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20',
      text: 'text-cyan-600 dark:text-cyan-400',
      border: 'border-cyan-200 dark:border-cyan-800',
    },
    roles: [
      { role: 'Admin / Maintenance Manager', desc: 'Assign work requests, approve completed repairs, manage equipment assets, checklist templates, and critical issues.' },
      { role: 'Technician', desc: 'Accept assigned work requests, submit completion notes with repair evidence photos, fill routine PM checklists, and request spare parts.' },
    ],
    keyFeatures: [
      {
        title: 'Work Request Lifecycle (Two-Eye Sign-off)',
        steps: [
          'Step 1: Any authorized staff raises a breakdown request (Equipment, Issue Description, Photo).',
          'Step 2: Manager reviews "Pending Queue" and assigns technician(s).',
          'Step 3: Technician accepts task in "My Tasks", executes physical repair, enters repair remarks, attaches resolution photo, and clicks "Mark Complete".',
          'Step 4: Manager reviews under "Awaiting Approval" and clicks Approve (or Reject with rework reason). Technicians cannot sign off their own work.',
        ],
        link: '/maintenance/work-requests',
        linkText: 'Work Requests',
      },
      {
        title: 'Preventive Maintenance (PM Schedule) & Spare Parts',
        steps: [
          'Weekly PM schedules outline planned inspections for gantry cranes, batching mixers, and compressors.',
          'Technicians submit digital checklists with pass/fail and meter readings.',
          'Spare parts inventory logs incoming stock and tracks parts consumed per equipment repair.',
        ],
        link: '/maintenance/schedule',
        linkText: 'PM Schedules',
      },
    ],
    tips: [
      'Unresolved machine breakdowns can be escalated to "Critical Issues" for company-wide executive visibility.',
      'Public QR codes on equipment allow shop floor staff to submit breakdown requests even without logging in.',
    ],
  },
  mould: {
    id: 'mould',
    title: 'Precast Mould & Cost Amortisation',
    subtitle: 'Mould asset lifecycle, steel weight growth tracking, technician modification jobs, and monthly cost reporting.',
    icon: Hammer,
    color: {
      bg: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20',
      text: 'text-yellow-600 dark:text-yellow-400',
      border: 'border-yellow-200 dark:border-yellow-800',
    },
    roles: [
      { role: 'Admin / Mould Supervisor', desc: 'Create mould assets, initiate fabrication/modification jobs, allocate worker labour hours, and execute Month Lock.' },
      { role: 'Mould Worker / Technician', desc: 'View assigned change jobs and log daily hours spent per mould.' },
    ],
    keyFeatures: [
      {
        title: 'Tracking Mould Assets & Steel Weight',
        steps: [
          'Each mould asset records its product cast weight and its own structural steel weight (kg).',
          'When a mould undergoes alteration (Change Job), additional steel plates and stiffeners are logged.',
          'The mould steel weight updates dynamically to reflect true asset value.',
        ],
        link: '/mould/assets',
        linkText: 'Mould Assets',
      },
      {
        title: 'Time Allocation & Monthly Cost Lock',
        steps: [
          'Assign technician hours to specific mould jobs or factory overhead cost centers.',
          'At month end, review the Monthly Cost Report for total labour and steel consumption.',
          'Admin executes "Month Lock" to finalize cost amortization and prevent retroactive tampering.',
        ],
        link: '/mould/allocation',
        linkText: 'Time Allocation',
      },
    ],
    tips: [
      'Always mark decommissioned moulds as EOL (End of Life) to scrap steel value accurately.',
      'Locked months require Admin unlock permission before any past time records can be adjusted.',
    ],
  },
  plantpro: {
    id: 'plantpro',
    title: 'Workforce, HR & Hostel Management',
    subtitle: 'Worker master roster, overtime allocation, timesheet verification, hostel facility occupancy, and document expiry tracking.',
    icon: Users,
    color: {
      bg: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-200 dark:border-purple-800',
    },
    roles: [
      { role: 'HR Admin / Paymaster', desc: 'Full worker wage input, payroll exports, document expiry monitoring, and hostel lease administration.' },
      { role: 'Shop Floor Supervisor', desc: 'Plan and record daily worker basic & overtime hours across project lines, submit ad-hoc extra OT requests.' },
    ],
    keyFeatures: [
      {
        title: 'Daily Overtime & Worker Allocation',
        steps: [
          'Supervisors access "OT & Allocation" to assign workers to active casting projects or machine lines.',
          'Record daily planned basic and OT hours for the work crew.',
          'Ad-hoc extra OT requires supervisor reason and manager approval under extra requests.',
        ],
        link: '/plantpro/ot',
        linkText: 'OT Allocation',
      },
      {
        title: 'Foreign Worker Hostel Matrix & Document Tracking',
        steps: [
          'Hostel Management: view room and bed allocations per hostel unit, track monthly rent and deposit deductions.',
          'Documents Center: automated tracking of foreign worker Passports, Work Permits, and FOMEMA medical clearances with 30/60-day expiry warnings.',
        ],
        link: '/plantpro/hostel',
        linkText: 'Hostel Matrix',
      },
    ],
    tips: [
      'Worker wage values and payroll tables are strictly RLS-gated to HR Admin accounts only.',
      'Supervisor OT planning and HR timesheet records are maintained in parallel ledgers for audit reconciliation.',
    ],
  },
  meetings: {
    id: 'meetings',
    title: 'Executive Meetings & Strategy Workspace',
    subtitle: 'Weekly leadership meetings, live agendas, to-dos, issues solving, quarterly OKR priorities, org chart, and 1:1 reviews.',
    icon: CalendarDays,
    color: {
      bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800',
    },
    roles: [
      { role: 'Leader / Meeting Admin', desc: 'Run weekly live meetings, rate sessions, manage org chart seats, assign priorities, and configure KPIs.' },
      { role: 'Team Member', desc: 'Manage personal workspace, resolve assigned to-dos, raise issues, submit weekly KPI actuals, and participate in 1:1 reviews.' },
    ],
    keyFeatures: [
      {
        title: 'My Workspace (Personal Dashboard)',
        steps: [
          'Your personalized morning launchpad: shows all active to-dos assigned to you across company meetings.',
          'Review quarterly priorities (Goals/OKRs), assigned weekly KPI metrics, and private personal notes with color coding.',
        ],
        link: '/meetings/workspace',
        linkText: 'My Workspace',
      },
      {
        title: 'Live Weekly Meeting Flow (EOS / OKR Style)',
        steps: [
          'Leader starts meeting run: Good News & Headlines -> Review Previous To-dos -> KPI Scorecard -> Quarterly Priorities -> IDS (Identify, Discuss, Solve Issues).',
          'Action items created during meetings directly sync to attendees\' workspace to-dos.',
          'Rate meeting (1-10) upon conclusion and system automatically generates summary archive.',
        ],
        link: '/meetings',
        linkText: 'Meetings Center',
      },
    ],
    tips: [
      'Use the Org Chart to inspect accountability seats, reporting lines, and RPRS (Right Person Right Seat) fit scores.',
      'Online whiteboards and document repositories support collaborative strategy planning sessions.',
    ],
  },
  qaqc: {
    id: 'qaqc',
    title: 'QAQC Quality Assurance & Testing',
    subtitle: 'Concrete cube compressive strength tests, 3rd party laboratory reports, PO/Invoice multi-test matching, and credit notes.',
    icon: ClipboardCheck,
    color: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
      text: 'text-rose-600 dark:text-rose-400',
      border: 'border-rose-200 dark:border-rose-800',
    },
    roles: [
      { role: 'Admin / QAQC Manager', desc: 'Configure testing catalog, set laboratory test targets, approve credit note deductions, and oversee invoice billing.' },
      { role: 'QAQC Officer', desc: 'Record casting dates, test dates (7d/14d/28d), input strength test reports, and track lab certifications.' },
      { role: 'Purchaser / Accounts', desc: 'Multi-select tests to assign Purchase Orders (PO) and Invoices with intelligent batch amount splitting.' },
    ],
    keyFeatures: [
      {
        title: 'Logging Test Batches & Laboratory Reports',
        steps: [
          'Navigate to "Test Records" to log a new concrete cube or tensile testing batch.',
          'Specify Project, Supplier, Sample Marking, Test Type, Casting Date, and Scheduled Test Date.',
          'When testing laboratory sends official results: enter Report No, Email Date, and QAQC remarks to complete record.',
        ],
        link: '/qaqc/records',
        linkText: 'Test Records',
      },
      {
        title: 'Batch Billing: Multi-Select PO & Invoice Splitting',
        steps: [
          'Purchaser checks multiple test checkboxes to batch them under a single laboratory invoice.',
          'Click "Assign PO / Invoice" action bar.',
          'Enter PO Number, Total Invoice Number, and Gross Invoice Amount (e.g. RM 3,000 across 6 tests).',
          'System automatically distributes the invoice amount evenly across selected tests and updates billing status to Billed.',
          'Supports Credit Note recording for testing discounts or rebated sample batches.',
        ],
        link: '/qaqc/records',
        linkText: 'Open QAQC Records',
      },
    ],
    tips: [
      'Use table column filters to isolate "Unbilled" tests or tests "Missing Report No" in one click.',
      'Inline editing allows quick updates to Marking, Date Cast, and Quantity without opening modals.',
    ],
  },
}

function ManualContent() {
  const searchParams = useSearchParams()
  const initialDept = (searchParams.get('dept') as ManualSection) || 'portal'

  const [activeSection, setActiveSection] = useState<ManualSection>(initialDept)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const deptParam = searchParams.get('dept') as ManualSection
    if (deptParam && MANUAL_DATA[deptParam]) {
      setActiveSection(deptParam)
    }
  }, [searchParams])

  const sectionsList: ManualSection[] = [
    'portal', 'rebar', 'cement', 'security', 'maintenance',
    'mould', 'plantpro', 'meetings', 'qaqc'
  ]

  const currentManual = MANUAL_DATA[activeSection] || MANUAL_DATA.portal
  const CurrentIcon = currentManual.icon

  // Simple search filter across all manuals
  const searchResults = searchQuery.trim()
    ? sectionsList.filter(sec => {
        const m = MANUAL_DATA[sec]
        const q = searchQuery.toLowerCase()
        return (
          m.title.toLowerCase().includes(q) ||
          m.subtitle.toLowerCase().includes(q) ||
          m.keyFeatures.some(f => f.title.toLowerCase().includes(q) || f.steps.some(s => s.toLowerCase().includes(q)))
        )
      })
    : null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Top Banner Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 py-8 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold mb-2">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Official Operations & Knowledge Base</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              AlphaVision User Manual
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Complete operational guides, role permissions, and step-by-step procedures for every plant division.
            </p>
          </div>

          {/* Search box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search guides, workflows..."
              className="w-full pl-9 pr-8 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600">
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="max-w-6xl w-full mx-auto px-6 lg:px-12 py-8 flex flex-col md:flex-row gap-8 flex-1">
        
        {/* Left Side: Department Selector Tabs */}
        <aside className="w-full md:w-64 shrink-0 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 mb-2">
            Division Manuals
          </div>

          <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0 [scrollbar-width:none]">
            {sectionsList.map(sec => {
              const info = MANUAL_DATA[sec]
              const Icon = info.icon
              const isSelected = activeSection === sec
              return (
                <button
                  key={sec}
                  onClick={() => { setActiveSection(sec); setSearchQuery('') }}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap text-left ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{info.title.split('&')[0].trim()}</span>
                </button>
              )
            })}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 hidden md:block">
            <Link
              href="/"
              className="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
            >
              <span>Back to App Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </aside>

        {/* Right Side: Manual Content Article */}
        <main className="flex-1 min-w-0 space-y-8 animate-in fade-in duration-150">
          
          {/* Header Card */}
          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900/60 p-6 shadow-xs">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${currentManual.color.bg}`}>
                  <CurrentIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {currentManual.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {currentManual.subtitle}
                  </p>
                </div>
              </div>

              {activeSection !== 'portal' && (
                <Link
                  href={DEPARTMENT_HOME[activeSection as Department]}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition"
                >
                  <span>Launch Module</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>

          {/* Section 1: Roles & Permissions */}
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900/60 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-600" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                1. Roles: Who Can Do What
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Access permissions are configured per user in Access Control. Below is the authority matrix:
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                  <tr>
                    <th className="px-4 py-2.5 w-36">Role</th>
                    <th className="px-4 py-2.5">Responsibilities &amp; Permissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {currentManual.roles.map(r => (
                    <tr key={r.role} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50">
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 align-top">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                          {r.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 leading-relaxed">
                        {r.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 2: Key Operational Workflows */}
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900/60 p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-600" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                2. Step-by-Step Operating Procedures
              </h3>
            </div>

            <div className="space-y-6">
              {currentManual.keyFeatures.map((feat, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {feat.title}
                    </h4>
                    {feat.link && (
                      <Link
                        href={feat.link}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold"
                      >
                        <span>{feat.linkText || 'Open Page'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {feat.steps.map((st, sIdx) => (
                      <li key={sIdx}>{st}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          {/* Section 3: Best Practices & Tips */}
          <section className="rounded-2xl border border-blue-200/80 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 p-5 space-y-3">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs">
              <AlertTriangle className="w-4 h-4" />
              <span className="uppercase tracking-wider">Operational Tips &amp; Rules</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {currentManual.tips.map((tip, tIdx) => (
                <li key={tIdx}>{tip}</li>
              ))}
            </ul>
          </section>

        </main>
      </div>
    </div>
  )
}

export default function UserManualPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading User Manual...</div>}>
      <ManualContent />
    </Suspense>
  )
}
