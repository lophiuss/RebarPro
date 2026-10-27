import Link from 'next/link'
import { HelpCircle, Wrench, Inbox, History, CalendarClock, ClipboardList, PackageSearch, AlertTriangle, Settings as SettingsIcon, LayoutDashboard, ArrowRight, BookOpen } from 'lucide-react'

const SECTIONS = [
  { id: 'roles', label: 'Roles: Who Can Do What' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'work-requests', label: 'Work Requests' },
  { id: 'job-history', label: 'Job History' },
  { id: 'schedule', label: 'PM Schedule & Checklists' },
  { id: 'templates', label: 'Checklist Templates' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'spare-parts', label: 'Spare Parts' },
  { id: 'critical-issues', label: 'Critical Issues' },
  { id: 'settings', label: 'Settings' },
]

function Section({ id, icon: Icon, title, children }: { id: string; icon: any; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 bg-white border rounded-xl shadow-sm p-5 md:p-6 mb-6">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Icon className="w-5 h-5 text-orange-600" /> {title}</h2>
      <div className="space-y-3 text-sm text-slate-700 leading-relaxed">{children}</div>
    </section>
  )
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal list-inside space-y-1.5 pl-1">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ol>
  )
}

export default function MaintenanceHelpPage() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      {/* Banner pointing to Unified Manual */}
      <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-blue-600 shrink-0" />
          <div className="text-xs text-blue-900">
            <span className="font-bold">AlphaVision Unified Knowledge Base: </span>
            View comprehensive user manuals across all 8 plant divisions (QAQC, Rebar, BPlant, HR, etc.).
          </div>
        </div>
        <Link
          href="/manual?dept=maintenance"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shrink-0 transition"
        >
          <span>Open Unified Manual</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2 flex items-center gap-2"><HelpCircle className="w-7 h-7 text-orange-600" /> Maintenance User Manual</h1>
      <p className="text-sm text-gray-500 mb-6">A walkthrough of every page in the Maintenance module — what it's for, and how to use it. Open to everyone with Maintenance access, whatever your role.</p>

      <nav className="bg-white border rounded-xl shadow-sm p-4 mb-6">
        <div className="text-xs font-bold text-gray-400 uppercase mb-2">Jump to a section</div>
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-orange-100 hover:text-orange-800">{s.label}</a>
          ))}
        </div>
      </nav>

      <Section id="roles" icon={SettingsIcon} title="Roles: Who Can Do What">
        <p>Every Maintenance account has one of three roles, granted in Access Control:</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Role</th>
                <th className="px-3 py-2 text-left font-semibold">Can do</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-3 py-2 font-medium align-top">Admin</td>
                <td className="px-3 py-2">Everything a Manager can, plus manage who has access to the whole app (Access Control).</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium align-top">Manager</td>
                <td className="px-3 py-2">Assign/approve/delete/edit Work Requests, edit Equipment, set PM plans and checklist templates, approve or reject submitted checklists, resolve Critical Issues, edit/delete Spare Parts requests, edit/delete Job History.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium align-top">Technician</td>
                <td className="px-3 py-2">Raise a Work Request, accept/complete their own assigned tasks, fill in a checklist, log a Spare Parts receipt, report a Critical Issue. Cannot edit or delete other people's records, cannot approve their own completed work.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400">This last point — a technician can't approve their own work — is deliberate: the person who does the job and the person who signs it off are always different, so nothing gets marked "done" without a second pair of eyes.</p>
      </Section>

      <Section id="dashboard" icon={LayoutDashboard} title="Dashboard">
        <p>The landing page. At the top, a bold red banner appears only when <strong>you personally</strong> have a Work Request assigned to you that isn't finished yet — click it to go straight to your task. Below that, lighter banners cover department-wide things: pending requests needing assignment, completed work awaiting your approval (managers), your PM tasks due this week, and PM tasks due but not yet marked done.</p>
        <p>Further down: Shoutouts (team recognition — collapses automatically when empty), Critical Issues (also collapses when there are none open), then the KPI cards. Hover any KPI card to see exactly how it's calculated. Switch between This Week / This Month / a custom date range with the toggle at the top — every KPI updates to match. Scroll down for month-by-month trend charts of the same KPIs, selectable for the past 6 months, 12 months, or a custom range.</p>
      </Section>

      <Section id="work-requests" icon={Inbox} title="Work Requests">
        <p><strong>Raising a job:</strong> use the "Jobs" page (or the public QR-code form, for people without a login) — pick a category, then the equipment, describe the issue, optionally attach a photo.</p>
        <p><strong>Managers</strong> see four tabs:</p>
        <Steps items={[
          'Pending Queue — new requests, not yet assigned. Assign it to one or more technicians (any of them can pick it up), edit its details first if needed, or delete it (logged for audit).',
          'In Progress — assigned jobs, showing whether the technician has accepted it yet.',
          'Awaiting Approval — completed jobs waiting for you to Approve (locks it in as done) or Reject (sends it back to the technician with a reason, to redo).',
          'My Tasks — the same view a technician gets, for anything assigned to you.',
        ]} />
        <p><strong>Technicians</strong> only see My Tasks: Accept a newly assigned job, then Mark Complete once it's done (a remark and evidence photo are optional but recommended — a manager will review this before it counts as finished). The tab shows how many active tasks you have. Below the active list, "My History" (collapsed by default) shows everything you've ever completed and had approved — click any row, active or historical, to see the full detail. While a submission is still "completed" (waiting on your manager), you can reopen it and fix the remark or replace the photo yourself; once approved it's locked.</p>
      </Section>

      <Section id="job-history" icon={History} title="Job History">
        <p>Every completed, approved work request across the whole department, searchable by equipment, technician, or date range. Managers can export records for auditing.</p>
      </Section>

      <Section id="schedule" icon={CalendarClock} title="PM Schedule & Checklists">
        <p>Planned maintenance inspections mapped across calendar weeks. Technicians access active checklists, submit inspection photos, and record machine hour-meter counts.</p>
      </Section>

      <Section id="equipment" icon={Wrench} title="Equipment">
        <p>The central asset registry: gantry cranes, concrete batching mixers, compressors, and hydraulic benders with operational health statuses (Good, Fair, Poor, Spoil).</p>
      </Section>

      <Section id="spare-parts" icon={PackageSearch} title="Spare Parts">
        <p>Inventory management for consumables and machine replacement parts with receipt logs and machine consumption history.</p>
      </Section>

      <Section id="critical-issues" icon={AlertTriangle} title="Critical Issues">
        <p>Plant-wide escalation board for severe machine downtime, structural fractures, or long-lead-time component breakdowns.</p>
      </Section>
    </div>
  )
}
