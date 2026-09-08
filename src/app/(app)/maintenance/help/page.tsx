import Link from 'next/link'
import { HelpCircle, Wrench, Inbox, History, CalendarClock, ClipboardList, PackageSearch, AlertTriangle, Settings as SettingsIcon, LayoutDashboard } from 'lucide-react'

// Static reference documentation — no data fetching, so it's the same for
// every visitor. Deliberately not role-gated (see AppNavigation.tsx's nav
// link for this page): every Maintenance account, whatever their role,
// should be able to open this without needing anything configured for them.

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
        <p>Every Work Request that's reached Completed or Approved status, department-wide — the permanent record. Filter by technician, category, status, or date range; the per-technician cards (collapsed by default — click to expand) show each person's approved/total count. A shared job credits every assignee, so those numbers can add up to more than the total shown at the top — that's expected, not a miscount.</p>
        <p>Click any row for the full detail (requester, every timestamp, evidence photo). Managers/admins can Edit or Delete a record from that same detail view (deletions are logged). Use Export to Excel or Export to PDF to download the full filtered result set, and the thumbnail-size toggle to see bigger evidence photos in the table.</p>
      </Section>

      <Section id="schedule" icon={CalendarClock} title="PM Schedule &amp; Checklists">
        <p>Three views of the same underlying schedule — Day, Week, and Month — all sharing the same Frequency and PIC controls, so a change in one shows up everywhere.</p>
        <p><strong>Setting a plan:</strong> pick a Frequency for a piece of equipment (Daily/Weekly/Monthly/Quarterly/Half-Yearly/Yearly), choose a start date and a PIC, and it auto-generates the schedule going forward. To stop it, pick the blank option in the Frequency dropdown, or open the plan and click <strong>Cancel Plan</strong> — this clears the plan and un-plans any upcoming week that isn't completed yet (past and already-completed weeks stay as history).</p>
        <p><strong>When a week is due:</strong> it shows up in the red "PM Due This Week" box. If the equipment has a checklist template attached, click it to fill in the checklist; if not, click it to mark done directly.</p>
        <p><strong>Filling a checklist:</strong> pick OK/Fault, Yes/No, a numeric reading, or free text per item (depending on how that item was set up), add a remark, optionally attach a photo, and submit — it goes to a manager for approval. Once approved, that week's cell turns green.</p>
        <p>A small blue "C" badge appears on any grid cell where a checklist has already been submitted — click it to jump straight to that submission's detail. Click <strong>Checklist History</strong> to browse every submission ever filed (any status), filterable by equipment or approval status.</p>
      </Section>

      <Section id="templates" icon={ClipboardList} title="Checklist Templates">
        <p>Built in Settings. A template is either <em>Single Equipment</em> (one machine, sectioned checks) or <em>Multi-Section</em> (a daily sweep across several areas). Add items one at a time, each with its own type — OK/Fault, Yes/No, Numeric reading, or Text/remark only — and an optional section label.</p>
        <p>Rename a template or edit any item's wording/section/type in place with the pencil icon. Use the copy icon to duplicate a whole template as a starting point for a similar one, or Export/Import as JSON to move a template between installs.</p>
      </Section>

      <Section id="equipment" icon={Wrench} title="Equipment">
        <p>The equipment list — search or filter by category/location/condition. Click a row to edit it (managers/admins only): category, location, and purpose are pick-a-value-or-add-new dropdowns; Ownership Manager and Ownership Supervisor work the same way. Click the equipment's name (not the row) to open its own detail page — user manual upload, this year's PM calendar, and its maintenance history.</p>
      </Section>

      <Section id="spare-parts" icon={PackageSearch} title="Spare Parts">
        <p>Log a part request with quantity, requisition number, and remark. Anyone can Log Receipt when parts arrive (it records who logged it and when). Only managers/admins can Edit or Delete a request record.</p>
      </Section>

      <Section id="critical-issues" icon={AlertTriangle} title="Critical Issues">
        <p>A running list of serious, standalone issues that need visibility beyond a normal Work Request. Anyone can report one; only managers/admins can change its status or mark it resolved.</p>
      </Section>

      <Section id="settings" icon={SettingsIcon} title="Settings">
        <p>Manager/admin only. Covers: the Work Request notification email, the full Equipment list with every field editable, Checklist Templates (see above), and the public Job Report QR-code link for posting around the site.</p>
      </Section>

      <p className="text-xs text-gray-400 text-center mt-8">Something not covered here, or not working the way it's described? Tell your manager or admin.</p>
    </div>
  )
}
