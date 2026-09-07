# PRD: Maintenance Department for AlphaVision

Status: Confirmed — implementation in progress · Author: Claude (assisted) · Date: 2026-09-07

## 1. Background / Problem

KOMT's equipment maintenance tracking currently lives entirely outside
AlphaVision, spread across Google Workspace:

- **"KOMT Maintenance Job Report"** — a Google Form that feeds a linked
  response spreadsheet (actively used; last modified today). The
  spreadsheet's first tab is a manual pivot summary ("Daily Task Report" /
  "Downtime by Category"), broken down by equipment category
  (Air Compressor, Batching Plant, Building Facilities, Crane, Equipment,
  Machinery, Office, Tools, Transport, "clear scrap metal", "maintenance
  area") across months back to 2022.
- **"Equipment Handling Record V0"** — a separate spreadsheet acting as the
  asset master list: ~160+ pieces of equipment (`EquipID` like `E00001`,
  item name, condition — Good/Fair/Poor/Spoil — and person-in-charge).
- Several Drive folders holding inspection photos/PDFs, organized by
  category: "Crane Inspection Report", "Air Compressor Report", "Transport
  Report", "Batching Machine Report", "Fabrication Machine Report",
  "Maintenance Report John", plus a "Maintenance Inventory" folder (likely
  spare-parts related — worth checking against §6's spare-parts table
  during implementation) and an older Form's file-response folder
  ("Monthly Job Report November 2022").
- A **weekly KPI dashboard**, manually assembled and exported as a PDF (the
  reference document for this PRD — see §4), covering: Machine Uptime %,
  Breakdown Response Effectiveness (BRE %) + Average Repair Time, Schedule
  Maintenance (Plan vs Actual) %, Spare Part Requested vs Received, Asset
  Availability %, Mean Time To Repair (MTTR), and a hand-maintained Critical
  Issues table.

This was confirmed directly: the PDF was rendered page-by-page (it's an
image-heavy dashboard export, not text) and the Drive folder at
`drive/folders/1QeCPUHvyPi5ptthgh2NBxh9apdEsiZSa` ("Komt Maintenance",
owned by the same Google account already used for AlphaVision's Security
photo storage) was listed directly via the app's existing OAuth
credentials.

**Pain points:**
- Fragmented across one Form, two spreadsheets, and several Drive folders
  with no structural link between them.
- No real-time visibility — the KPI dashboard is a manual weekly export.
- No access control — anyone with the Sheet/Form link can edit anything.
- No structured link between equipment records and the downtime/job data
  logged against them.
- The pivot sheet shows visible data-quality issues (e.g. a `#REF!` error
  in the top-left cell), suggesting some fragility in the current manual
  formulas.

**Goal:** build a proper Maintenance module inside AlphaVision as a 4th
department, following the exact same patterns already established for
Rebar, BPlant (cement), and Security — with the historical data (2022–2026)
migrated in — **without touching or altering the behavior of those three
existing departments.**

## 2. Decisions Already Confirmed

- **Migrate historical data in**, not a fresh start — same approach used
  for the earlier Cement and Security merges.
- **Full 4th department**: its own nav section, its own roles, its own tab
  in Access Control, its own RLS-scoped tables — not a lighter module
  bolted onto an existing department.
- **Logged-in technicians** file their own job reports (real accounts, like
  Rebar/Cement operators already have) — not an anonymous kiosk-style form
  like the Security visitor kiosk.

## 3. Goals / Non-Goals

**Goals (v1):**
- A live KPI dashboard reproducing the 6 charts + Critical Issues table
  from the reference PDF, computed from real data rather than assembled by
  hand.
- A structured equipment registry (the current "Equipment Handling Record").
- Technician-logged job reports (breakdowns, downtime, repairs), with photo
  attachments.
- Spare-parts request/receipt tracking.
- A scheduled-maintenance plan tracker (plan vs actual completion).
- A critical-issues board matching the PDF's table.
- Historical data (2022–2026) migrated in so trends have continuity from
  day one.
- Full department integration: nav, Access Control tab, RLS, and AI Helper
  awareness (so it can answer maintenance questions the same way it
  already answers Rebar/BPlant/Security ones).

**Non-Goals (v1):**
- Replacing the Google Form immediately — it can keep running in parallel
  during the transition period.
- Predictive/ML-based maintenance forecasting.
- A full spare-parts inventory/warehouse system beyond request vs
  received counts (matches what the current dashboard actually tracks).

## 4. Reference Material

- **KPI dashboard PDF** (user-supplied): 6 charts — Machine Uptime, BRE,
  Schedule Maintenance (Plan vs Actual), Spare Part Order vs Received,
  Asset Availability, Mean Time To Repair — plus a Critical Issues table
  with columns Equipment / Issue / Lead time.
- **Google Drive folder**: `drive/folders/1QeCPUHvyPi5ptthgh2NBxh9apdEsiZSa`
  ("Komt Maintenance") — contains the Job Report Form + response
  spreadsheet, the Equipment Handling Record spreadsheet, and the category
  photo folders listed in §1.
- **`ASSET OWNERSHIP.xlsx`** (user-supplied, 45 rows): equipment ownership
  register — `Asset`, `Location`, `Manager`, `Supervisor`, `PIC 1 (Day)`,
  `PIC 2 (Night)`. Richer than the "Equipment Handling Record" — this is
  where the day/night shift PIC split and Manager/Supervisor ownership
  fields come from.
- **`INVENTORY.xlsx`** (user-supplied, 681 rows): the real, detailed
  equipment/inspection log — `AssignID`, `AssignDate`, `EquipID`, `Person
  In-Charge`, `Item`, `Brand`, `Category`, `Purpose`, `Location`,
  `Equipment Condition`, `Issue By`, `Date Inspect`, `Remarks`,
  `Preventive Action Recommendation`. This is richer historical seed data
  than the "Equipment Handling Record V0" pivot sheet used for the first
  PRD draft, and is the source for each asset's inspection history.
- **`2026 PM SCHEDULE.xlsx`** (user-supplied): a yearly Gantt-style plan —
  equipment rows × `WK 1`–`WK 52` columns. Confirmed by reading actual
  cell *fill color* (not text — the cells are empty, the plan is conveyed
  by highlighting): a yellow cell marks a scheduled PM week, roughly every
  4th week per machine. This is the real source for both the "Schedule
  Maintenance Plan vs Actual %" KPI and a proper PM calendar feature.
- **A 46-page scanned PDF** (user-supplied, image-only — no text layer,
  rendered page-by-page): a compilation of two real paper form types still
  in active use:
  1. Per-machine monthly **"Maintenance & Service Report"** checklists
     (form code EM-F07/PT005/REV0) — e.g. "Vacuum Machine", "Vibrating
     Table" — each with lettered sections (e.g. "A) Vibrator
     Structure/Platform", "B) Control Panel"), numbered items, an OK/Fault
     tick column, a Remark column, a stated service schedule (e.g. "every
     1 month"), and Serviced-by / Checked-by (M&E Supervisor) / Verified-by
     (R&M Engineer/Production Manager) sign-off with dates.
  2. A **"Daily Machinery and Equipment Condition Checklist"** — one form
     per day, covering several plant sections at once (Batching Plant 1,
     Production, Water Curing Pond, Repair & Coating Area, Laboratory),
     each section listing multiple equipment rows with Qty/Condition/
     Remark, signed off by "Done by" and "Verify by".

## 5. Users & Roles

New department key: `maintenance`. Roles mirror the existing `ROLES` map
pattern in `src/app/(app)/admin/access/page.tsx` (e.g. BPlant already uses
`admin/manager/supervisor/technician`):

| Role | Can do |
|---|---|
| `technician` | Log their own job reports; view equipment they're assigned to |
| `manager` | Everything a technician can, plus: manage scheduled maintenance, spare-parts requests, resolve critical issues, view full dashboard |
| `admin` | Everything above, plus: manage the equipment master, manage department access/roles (via the existing Access Control page) |

## 6. Data Model

New tables only, `maintenance_`-prefixed, purely additive — no existing
table, column, or RLS policy for rebar/cement/security is touched.

- **`maintenance_equipment`** — merges both source registers (Asset
  Ownership + Inventory) into one table: `equip_code` (e.g. `E00001`),
  `name`, `category`, `brand`, `purpose`, `location`, `condition`
  (good/fair/poor/spoil), `manager`, `supervisor`, `pic_day`, `pic_night`
  (all free text, matching the existing convention of storing names as
  text rather than a hard FK — see `security_post_logs.guard_name`),
  `manual_drive_id` (the equipment's user manual PDF — requirement #2),
  `pm_checklist_template_id` (which checklist template applies to this
  asset, if any — nullable, links to `maintenance_checklist_templates`
  below), `is_active`.
- **`maintenance_inspections`** — one row per historical inspection, seeded
  from Inventory's 681 real rows: `equipment_id`, `inspected_by`,
  `inspection_date`, `condition`, `remarks`,
  `preventive_action_recommendation`. This is the data that populates an
  asset's "Maintenance History" tab (requirement #2).
- **`maintenance_job_reports`** — `equipment_id`, `category`, `report_date`,
  `reported_by`, `issue_description`, `downtime_hours`, `repair_time_hours`,
  `status` (open/in_progress/completed/cancelled), `photo_drive_id`,
  `notes`, `created_at`. This is the data that populates an asset's
  "Maintenance Record" tab (requirement #2).
- **`maintenance_critical_issues`** — `equipment_id` (nullable — some rows
  in the source table name an equipment *type*, not a specific asset),
  `issue`, `lead_time_note` (free text — the source data mixes dates,
  "TBA", "Completed", "Cancelled" in one column), `status`, `created_at`,
  `resolved_at`.
- **`maintenance_pm_schedule`** — `equipment_id`, `year`, `week_number`
  (1–52), `planned` (bool — from the source spreadsheet's yellow-highlighted
  cells), `completed_at` (nullable) — feeds "Schedule Maintenance Plan vs
  Actual %" (requirement #3). Keyed by year + week rather than a calendar
  date so next year's plan is just a new set of rows, matching how the
  source spreadsheet itself is organized (one workbook per year).
- **Checklist tables** (requirement #3 — one schema covers both real paper
  form shapes found in the PDF):
  - `maintenance_checklist_templates` — `name` (e.g. "Vacuum Machine PM
    Checklist", "Daily Equipment Condition Checklist"), `scope`
    (`single_equipment` — tied to one asset, like the monthly service
    reports — or `section_list` — covers many equipment rows grouped by
    plant section in one submission, like the daily checklist),
    `frequency` (e.g. daily/monthly), `form_code` (e.g. "EM-F07/PT005").
  - `maintenance_checklist_items` — `template_id`, `section_label`
    (nullable, e.g. "A) Vibrator Structure/Platform" or "Batching Plant 1"
    for a section-list template), `item_no`, `description`.
  - `maintenance_checklist_submissions` — `template_id`, `equipment_id`
    (nullable for a section-list submission), `submission_date`,
    `done_by`, `verified_by`.
  - `maintenance_checklist_submission_items` — `submission_id`,
    `checklist_item_id`, `result` (ok/fault), `qty` (nullable — the daily
    checklist has a Qty column), `remark`, `photo_drive_id` (nullable —
    requirement #1).
- **`maintenance_spare_parts_requests`** — `part_name`, `equipment_id`
  (nullable), `quantity_requested`, `quantity_received`, `request_date`,
  `received_date`.
- **`maintenance_work_requests`** (requirement #4) — `requester_name`,
  `requester_contact`, `location`, `equipment_id` (nullable — the public
  submitter may not know the exact asset), `issue_description`,
  `photo_drive_id` (evidence at request time), `status`
  (pending/assigned/completed/cancelled), `assigned_to`, `assigned_at`,
  `completed_at`, `resolution_photo_drive_id` (evidence the assigned
  technician submits on completion), `time_taken` (derived:
  `completed_at − assigned_at`), `created_at`.

KPI numbers (Uptime %, BRE %, Asset Availability %, MTTR) are **computed
live** from these tables at query time — not stored — the same approach the
Rebar Dashboard already uses for its live bottleneck-coverage calculation,
rather than a cached/precomputed number that can drift out of sync.

**RLS:** `has_dept_access('maintenance')` for read/write, matching the
accepted pattern used everywhere else in this app — per-role restriction
(e.g. only manager+ can resolve critical issues) is enforced by hiding UI
via `department_nav_permissions`, not by RLS, consistent with how
Rebar/BPlant/Security already work. `maintenance_work_requests` is the one
exception: the public intake insert (see §8) goes through a service-role
Server Action exactly like `visitor-checkin`'s does, since the submitter
has no session at all.

### Photo evidence (requirement #1)

Every photo captured in this department — job report evidence, checklist
submission photos, and work-request resolution evidence — reuses the exact
pattern already used across the app rather than inventing a new upload
mechanism: client-side `compressImage()` resize (as already implemented in
`src/app/(app)/security/entries/page.tsx` and
`src/app/(app)/admin/access/page.tsx`) before upload, then
`uploadToDrive()` (`src/lib/google-drive.ts`) into a new `maintenance`
Drive subfolder, with the returned file id stored in the relevant
`photo_drive_id` column. Viewing goes through the same
`has_dept_access`-gated proxy pattern as `/api/security/photo/[fileId]`.

## 7. Historical Data Migration

A one-off script, `scripts/migrate-maintenance.mjs`, mirroring the existing
`scripts/archive/migrate-cement.mjs` / `migrate-security.mjs`:

1. Reads **`ASSET OWNERSHIP.xlsx`** + **`INVENTORY.xlsx`** → merges into
   one `maintenance_equipment` row per physical asset. **Confirmed with
   the user: both files describe the same assets, just captured at
   different times, and should be combined rather than kept as two
   registers.** Matching strategy: primary key off `INVENTORY.xlsx`'s
   `EquipID` (it's the more granular, item-level source); for each
   `ASSET OWNERSHIP.xlsx` row (which is asset-*type*-level, e.g. one
   "Forklift" row can cover several `EquipID`s), match by `Item`/`Asset`
   name + `Location`, and apply that row's Manager/Supervisor/PIC
   Day/Night onto every matching `EquipID`. Rows that don't confidently
   match by name+location are flagged in the migration script's output
   for a manual pass rather than silently guessed.
2. Reads `INVENTORY.xlsx`'s 681 rows a second time → one
   `maintenance_inspections` row each (this file *is* the historical
   inspection log, not just an equipment master).
3. Reads **`2026 PM SCHEDULE.xlsx`** → one `maintenance_pm_schedule` row
   per equipment × yellow-highlighted week (read via cell fill color, not
   cell value).
4. Reads the `KOMT Maintenance Job Report` response spreadsheet's raw data
   → `maintenance_job_reports` (and derives `maintenance_critical_issues`
   rows for anything matching the PDF's Critical Issues table shape).
5. Creates `maintenance_checklist_templates` + `maintenance_checklist_
   items` from the two real form shapes found in the 46-page PDF (a
   `single_equipment` template per machine type like "Vacuum Machine", and
   one `section_list` template for the daily plant-wide checklist).
   **Confirmed with the user: digitize the full history, not just the
   template shapes** — every one of the 46 scanned pages becomes a
   `maintenance_checklist_submission` (+ its per-item
   `maintenance_checklist_submission_items`: OK/Fault, qty, remark) with
   `done_by`/`verified_by` and the date read off the form. Since the pages
   are handwritten scans, this needs a human transcription/verification
   pass on the migration script's output — OCR alone won't be reliable
   enough for tick-marks and handwritten remarks/signatures — budget this
   as manual data-entry effort, not a fully automated import.
6. Creates `<name>@maintenance.local` Supabase Auth accounts for each
   distinct person-in-charge / reporter found — same placeholder-email
   convention already used for Cement and Security migrations — and grants
   them `maintenance` department access with the `technician` role by
   default (adjustable afterward in Access Control).
7. Uploads the category-folder photos to Google Drive under the app's
   existing integration (`src/lib/google-drive.ts`), into a new
   `maintenance` subfolder, linking each via `photo_drive_id` — exactly the
   pattern already used for Security's entry/incident photos.

**Known risk:** exporting the spreadsheets via `drive.files.export(...,
'text/csv')` (as done for this PRD's research) only returns the *first/
active* sheet tab. The Job Report spreadsheet's raw "Form Responses" data
is very likely on a different tab than the pivot summary that was
inspected. Pulling that tab specifically will need the Sheets API
(`spreadsheets.values.get`), which may require re-authorizing the existing
Google OAuth credentials with the Sheets readonly scope — the current
refresh token's exact granted scopes weren't verified in this PRD pass.
Follow `scripts/archive/google-drive-auth.mjs`'s pattern to redo the OAuth
consent with the added scope if needed.

## 8. Pages

New routes under `src/app/(app)/maintenance/`, reusing existing components
and UI patterns rather than inventing new ones:

- **`page.tsx`** (Dashboard) — the 6 KPI cards/charts + Critical Issues
  table, with a period switch reusing the Rebar Dashboard's This
  Month/Last Month/Custom Range pattern (`src/app/(app)/rebar/dashboard/
  page.tsx`).
- **`equipment/page.tsx`** — equipment registry (list, condition,
  location, manager/supervisor, PIC day/night), styled like Rebar
  Settings' sizes table.
- **`equipment/[id]/page.tsx`** (new — requirement #2) — asset detail
  view: user manual upload/download (`manual_drive_id`), this asset's PM
  schedule for the year, a "Maintenance History" tab
  (`maintenance_inspections` + relevant `maintenance_checklist_
  submissions`), and a "Maintenance Record" tab
  (`maintenance_job_reports` for this asset).
- **`jobs/page.tsx`** — technician job-report form + history table, reusing
  `PhotoPicker`/`PhotoLightbox` (`src/components/`) for photo capture, and
  the Rebar Transactions page's filter + sticky-header + pagination +
  export pattern for the history table.
- **`schedule/page.tsx`** (requirement #3) — yearly PM calendar (equipment
  × week, mirroring the source spreadsheet's own shape) with plan vs
  actual completion, plus checklist template management and a "fill in
  today's checklist" flow covering both template scopes: pick one asset
  for a `single_equipment` checklist, or fill in a whole
  `section_list` checklist covering several equipment rows at once (as the
  real daily paper form does).
- **`spare-parts/page.tsx`** — request/receipt tracking.
- **`critical-issues/page.tsx`** — critical issues board matching the PDF
  table's columns exactly.
- **`work-requests/page.tsx`** (new — requirement #4, in-app half) —
  two views in one page depending on role: **Manager/Supervisor** see the
  pending queue and an assign-to-technician action; **technician** sees
  their own "My Tasks" list (assigned to them), a mark-complete action
  that requires resolution photo evidence before it's allowed to submit,
  and a running count of tasks they've completed so far.
- **`settings/page.tsx`** — equipment CRUD, category management, checklist
  template editor (admin/manager only, nav-gated the same way Cement's
  Settings page is).

**New public route (requirement #4, intake half):**
`src/app/maintenance-request/page.tsx` + `actions.ts` — outside the
`(app)` layout entirely, mirroring the existing
`src/app/visitor-checkin/page.tsx` + `actions.ts` pattern exactly: no
login required, a narrow service-role Server Action that only ever inserts
a fixed set of fields into a `pending` `maintenance_work_requests` row
(requester name/contact, location, issue description, optional photo —
same `compressImage()` + `uploadToDrive()` pattern as everywhere else).
`src/proxy.ts`'s public-route allowlist (currently `/login`, `/auth`,
`/visitor-checkin`) gains this one additional path.

## 9. Integration Points

Every change below is additive — existing departments' code paths are
unaffected:

- **`src/components/AppNavigation.tsx`** — add `'maintenance'` to the
  `Department` union, `DEPARTMENT_LABEL`, `DEPARTMENT_HOME`, and a new
  `NAV_ITEMS.maintenance` array.
- **`src/app/(app)/admin/access/page.tsx`** — add `maintenance:
  ['admin','manager','technician']` to the `ROLES` map; it automatically
  becomes a new tab in the already-tabbed Access Control UI (see the
  September redesign of that page). Seed `department_nav_permissions`
  rows for its pages.
- **`src/proxy.ts`** — extend the existing department-access guard
  (currently `deptSegment === 'rebar' || 'cement' || 'security'`) to also
  include `'maintenance'` — a one-line addition to an already-generic
  check, so a user without maintenance access bounces home the same way
  it already works for the other three.
- **`src/lib/ai-helper-tools.ts`** — add the new `maintenance_*` tables to
  the `ALLOWED_TABLES` allow-list so AI Helper can answer maintenance
  questions too, under the same RLS-scoped access it already respects for
  every other department (see the AI Helper feature added this session).
- **Database** — brand-new `maintenance_` prefixed tables only, in a new
  numbered `supabase_migration_vNN_maintenance_department.sql` file,
  following the existing paper-trail convention.

## 10. Notifications (requirement #4)

Confirmed with the user: **in-app + email**, not in-app alone.

- **In-app:** a pending-request count badge on the Maintenance dashboard
  and nav item, visible to `manager`+ roles — always current, no new
  infrastructure needed, works the moment they next open the app.
- **Email — confirmed: sent immediately every time a work request is
  filed**, not batched. That rules out re-using Cement's *cron* (which is
  inherently periodic/batched — see `supabase_migration_v12_cement_alert_
  cron.sql`'s once-daily `cron.schedule`); it calls for the event-driven
  half of that same pattern instead: a Postgres `AFTER INSERT` trigger on
  `maintenance_work_requests` that fires on every single row, calling
  `net.http_post` to a new Edge Function (`supabase/functions/send-
  maintenance-work-request-alert/`) the same way `cement_run_daily_alert_
  job()` calls `send-variance-alerts` — same Vault-stored shared-secret
  auth, same `pg_net` extension, just triggered by a row insert instead of
  a cron schedule. This also means it fires for *any* insert into the
  table, not only ones that go through the public form's Server Action —
  more robust than emailing from the Server Action itself.

## 11. KPI Formulas (confirmed)

The PDF showed only output numbers, not the underlying formulas. Since
the original sheet's author wasn't reachable, these are now locked in as
concrete, computable definitions rather than left open — internally
consistent with each other and with the schema in §6:

| KPI | Formula |
|---|---|
| Machine Uptime % | Per equipment/category, per period: `(period_hours − downtime_hours) / period_hours × 100`, where `period_hours` is the calendar length of the period (e.g. 168h for a week) and `downtime_hours` is `sum(maintenance_job_reports.downtime_hours)` for that equipment/category in the period. |
| No. of Breakdown | `count(maintenance_job_reports)` per category per week. |
| BRE % (Breakdown Response Effectiveness) | `(breakdowns where repair_time_hours <= target) / (total breakdowns) × 100`. `target` comes from a new `maintenance_equipment.target_repair_hours` (nullable — falls back to a department-wide default in `maintenance_settings` if not set per asset). |
| Average Repair Time | `avg(repair_time_hours)` across `maintenance_job_reports` in the period, per category. |
| Schedule Maintenance (Plan vs Actual) % | `(maintenance_pm_schedule rows where completed_at is not null) / (maintenance_pm_schedule rows where planned = true) × 100`, for the period. |
| Spare Part Order vs Received | Shown as paired bars, not a ratio: `sum(quantity_requested)` vs `sum(quantity_received)` from `maintenance_spare_parts_requests`, per period. |
| Asset Availability % | The **same formula as Machine Uptime %**, aggregated fleet-wide instead of per category — i.e. `sum(period_hours across all equipment) − sum(downtime_hours across all equipment)`, divided by `sum(period_hours across all equipment)`. This is the deliberate resolution to the PDF showing two very similarly-shaped charts: Machine Uptime is the per-category breakdown, Asset Availability is the same underlying calculation rolled up to one fleet-wide number. |
| Mean Time To Repair (MTTR) | **Confirmed to be the same figure as Average Repair Time**, just rolled up fleet-wide instead of per category — same resolution approach as Uptime/Availability above, rather than two unrelated metrics. |

This adds `maintenance_equipment.target_repair_hours` (nullable numeric)
and a small `maintenance_settings` singleton table (`default_target_
repair_hours`, mirroring `global_settings`/`cement_alert_settings`'s
existing singleton-row pattern) to §6.

## 12. Rollout & Verification

- Build order: Dashboard + Critical Issues first (matches how Cement and
  Security were both built dashboard-first), then Equipment (+ asset
  detail page), then Jobs, then Schedule/Checklists, then Work Requests
  (public intake route first, then the in-app manage/assign view), then
  Spare Parts, then Settings.
- `npx tsc --noEmit` and `npx next build` clean before every push —
  established habit throughout this project.
- After the schema migration and after the data migration script, run
  `get_advisors` and spot-check rebar/cement/security row counts to
  confirm zero impact — same verification approach used for the earlier
  Cement and Security department merges.

## 13. Open Questions / Risks

### Resolved by the user

- **PM Schedule color meaning** — confirmed: a yellow cell means that week
  needs preventive maintenance done. `maintenance_pm_schedule.planned`
  reads directly off this.
- **Equipment matching between Asset Ownership and Inventory** — confirmed:
  both describe the same assets, captured at different times; combine them
  (see the updated matching strategy in §7) rather than keep two registers.
- **Historical checklists — digitize or start fresh?** — confirmed: **yes,
  digitize the full history** (all 46 pages), not just the template
  shapes. Flagged in §7 as needing a manual transcription/verification
  pass, since OCR alone won't reliably read handwritten ticks/remarks.
- **Work Request email cadence** — confirmed: **immediately, every time a
  work request is filed** — not batched/periodic. §10 now specifies an
  `AFTER INSERT` trigger + Edge Function instead of a cron job.

### Still open

- **Sheets API scope**: migrating the raw Form-response data (not just the
  visible pivot sheet) may require re-authorizing the Google OAuth
  credentials with Sheets read access.
- **Data quality**: the source pivot sheet shows a visible `#REF!` formula
  error, suggesting some historical data may need manual cleanup before
  import rather than a direct 1:1 migration.
- **Critical Issues equipment linkage**: some rows in the source table name
  an equipment *category* (e.g. "Batching plant 1") rather than a specific
  `EquipID` — `maintenance_critical_issues.equipment_id` is nullable to
  allow a free-text fallback for these.
- **"Manual" scope**: assumed to mean the equipment's user/operating manual
  (a PDF, one per asset) — if it instead means something like a
  maintenance procedure/SOP document, that's closer to the checklist
  templates in §6 and may not need a separate field.
- **Checklist digitization effort/timeline**: now that all 46 pages are in
  scope (not just template shapes), this is a real data-entry effort to
  plan for — worth sizing before committing to a migration date.
