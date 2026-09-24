-- v39: PlantPro department (6th department, displayed as "HR" in nav) —
-- schema.
--
-- Full merge of plant-management-system ("PlantPro"), a standalone
-- Next.js/Prisma/SQLite productivity & OT/timesheet/payroll app, into
-- RebarPro. Same playbook as v10's cement merge (a separate Node/SQLite app
-- merged in the same way) and v38's mould department (source_pms_id-keyed
-- upsert pattern, chosen here over cement's "reuse the SQLite row id"
-- approach because PlantPro's FK chain runs 4 levels deep — Worker ->
-- OtMonth -> OtDay -> OtDayAllocation — where idempotent upsert-by-external-id
-- is safer to get right than juggling preserved ids + a sequence reset
-- across 27 tables).
--
-- NOT YET APPLIED. Apply via `supabase db query --linked -f`, then
-- get_advisors, same as v38.
--
-- Design notes (decisions confirmed with the plant owner):
--   * FULL merge, not staged: worker/project/supervisor roster, OT & daily
--     hour allocation, HR pay-column engine, hostel management, document
--     tracking, PDF/Excel import parsing (ported separately, not in this
--     schema), monthly targets & claims reporting.
--   * ~10 named supervisors/managers/GM/HR get real Supabase Auth accounts
--     (role tiers: admin/manager/hr/supervisor). The ~156 factory workers
--     stay a roster table with NO auth.users FK — same "flat roster,
--     no login" shape as mould_workers.
--   * plantpro_worker_pay_values is the FIRST business-data table in this
--     codebase needing role-tiered (not just department-tiered) RLS: HR/
--     Manager/Admin can see wage amounts, Supervisor cannot. Every other
--     plantpro_* table uses the uniform has_dept_access('plantpro') pattern
--     every other department already uses.
--   * WorkerAllocation/OtDayAllocation/WorkerTransfer are ported with full
--     shape even though all three are empty (0 rows) in the live PMS
--     database today — not simplified or dropped, per explicit instruction.
--   * TimesheetDay (HR's actual-hours ledger) and OtDay (supervisor's
--     planning ledger) are two independent, deliberately UNRECONCILED
--     tables, exactly as in PMS today. No cross-validation is added here.
--   * OtApproval.submitted_by/approved_by/rejected_by become real
--     uuid references to profiles(id) instead of PMS's free-text role/name
--     strings — a deliberate behavior improvement (PMS's shared role-cookie
--     login meant literally anyone could approve any supervisor's OT as
--     "Manager" with no real attribution).
--   * plantpro_documents' file bytes live in Google Drive (new "HR"
--     subfolder, flat structure, filename encodes worker id + doc type +
--     timestamp), not Supabase Storage — plantpro_documents.stored_name
--     holds the Drive file id. Only metadata lives in Postgres.
--   * mould_projects/mould_workers (the sync-snapshot tables v38 built) are
--     retired by a follow-up v40 migration once this lands — mould_jobs/
--     mould_time_entries get repointed straight at plantpro_projects/
--     plantpro_workers. Not done in this file.

alter table public.user_department_access drop constraint user_department_access_department_check;
alter table public.user_department_access add constraint user_department_access_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro']));

alter table public.department_nav_permissions drop constraint department_nav_permissions_department_check;
alter table public.department_nav_permissions add constraint department_nav_permissions_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro']));

alter table public.shoutouts drop constraint shoutouts_department_check;
alter table public.shoutouts add constraint shoutouts_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro']));

-- =============================================================
-- Level 1: independent lookup tables
-- =============================================================

create table public.plantpro_project_types (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.plantpro_supervisors (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  name text not null unique,
  status text not null default 'Active' check (status in ('Active','Inactive')),
  -- The real login this supervisor uses, once their account is created by
  -- scripts/plantpro-migration/create-plantpro-accounts.mjs. Nullable: a
  -- supervisor row can exist as a roster/dropdown entity before (or without)
  -- ever getting a login, matching PMS's current reality.
  linked_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.plantpro_pay_columns (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  key text not null unique,
  label text not null,
  type text not null check (type in ('ADD','DEDUCT')),
  sort_order int not null default 0,
  include_in_gross boolean not null default false,
  include_in_net_deduct boolean not null default false,
  compute_mode text not null default 'MANUAL' check (compute_mode in ('MANUAL','MULTIPLIER')),
  multiplier_percent numeric,
  created_at timestamptz not null default now()
);

create table public.plantpro_pay_column_bases (
  id bigint generated always as identity primary key,
  column_id bigint not null references public.plantpro_pay_columns(id) on delete cascade,
  base_column_id bigint not null references public.plantpro_pay_columns(id) on delete cascade,
  unique (column_id, base_column_id)
);

create table public.plantpro_document_types (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  name text not null unique,
  scope text not null check (scope in ('WORKER','HOSTEL','BOTH')),
  sort_order int not null default 0
);

create table public.plantpro_hostel_bill_item_types (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  name text not null unique,
  charge_to_workers boolean not null default true,
  sort_order int not null default 0
);

create table public.plantpro_hostels (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  name text not null unique,
  status text not null default 'Active' check (status in ('Active','Inactive')),
  address text,
  owner_name text,
  owner_contact text,
  rental_per_month numeric,
  deposit_withheld numeric,
  created_at timestamptz not null default now()
);

-- Singleton settings row. Replaces PMS's generic AppSetting key/value table
-- with named columns, matching mould_settings/cement_alert_settings's shape
-- — a deliberate cosmetic deviation (same values, typed instead of JSON).
create table public.plantpro_settings (
  id int primary key default 1 check (id = 1),
  hr_columns_order jsonb,
  current_supervisor_id bigint references public.plantpro_supervisors(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.plantpro_settings (id) values (1);

create table public.plantpro_timesheet_multiplier (
  id int primary key default 1 check (id = 1),
  normal_ot numeric not null default 1.5,
  sunday_basic numeric not null default 1.5,
  sunday_ot numeric not null default 2.0,
  holiday_basic numeric not null default 2.0,
  holiday_ot numeric not null default 3.0
);
insert into public.plantpro_timesheet_multiplier (id) values (1);

create table public.plantpro_holidays (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  date date not null unique,
  label text not null
);

-- =============================================================
-- Level 2: projects (depends on project_types)
-- =============================================================

create table public.plantpro_projects (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  name text not null unique,
  type_id bigint references public.plantpro_project_types(id) on delete set null,
  status text not null default 'Active' check (status in ('Active','Inactive')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================
-- Level 3: workers (depends on supervisors) — roster, no login,
-- same shape as mould_workers.
-- =============================================================

create table public.plantpro_workers (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  worker_no text not null unique,
  name text not null,
  line text,
  designation text,
  supervisor_id bigint references public.plantpro_supervisors(id) on delete set null,
  status text not null default 'Active' check (status in ('Active','Inactive','On Leave')),
  remarks text,
  nationality text,
  date_of_birth date,
  date_joined date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================
-- Level 4: depend on workers/projects
-- =============================================================

-- Wage amounts. The ONLY plantpro_* table with role-tiered (not just
-- department-tiered) RLS — see the policy block below.
create table public.plantpro_worker_pay_values (
  id bigint generated always as identity primary key,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  pay_column_id bigint not null references public.plantpro_pay_columns(id) on delete cascade,
  value numeric not null default 0,
  unique (worker_id, pay_column_id)
);

-- Standing monthly project-split. Ported with full shape though currently
-- 0 rows in PMS — not dropped or simplified.
create table public.plantpro_worker_allocations (
  id bigint generated always as identity primary key,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  project_id bigint not null references public.plantpro_projects(id) on delete restrict,
  percentage numeric not null,
  unique (worker_id, project_id)
);

create table public.plantpro_allocation_snapshots (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  month text not null,
  supervisor_id bigint references public.plantpro_supervisors(id) on delete set null,
  unique (worker_id, month)
);

create table public.plantpro_ot_months (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  month text not null,
  mode text not null default 'General' check (mode in ('Production','Delivery','General')),
  remark text,
  unique (worker_id, month)
);

create table public.plantpro_timesheet_days (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  month text not null,
  day text not null,
  basic numeric not null default 0,
  ot numeric not null default 0,
  unique (worker_id, month, day)
);

create table public.plantpro_hostel_stays (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  hostel_id bigint not null references public.plantpro_hostels(id) on delete restrict,
  move_in_date date not null,
  move_out_date date,
  created_at timestamptz not null default now()
);

-- File bytes live in Google Drive (new "HR" subfolder) — stored_name holds
-- the Drive file id, not a local filename. Metadata only, here.
create table public.plantpro_documents (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  owner_type text not null check (owner_type in ('WORKER','HOSTEL')),
  worker_id bigint references public.plantpro_workers(id) on delete cascade,
  hostel_id bigint references public.plantpro_hostels(id) on delete cascade,
  document_type_id bigint not null references public.plantpro_document_types(id) on delete restrict,
  file_name text,
  stored_name text,
  mime_type text,
  issue_date date,
  expiry_date date,
  remarks text,
  uploaded_at timestamptz not null default now(),
  constraint plantpro_documents_owner_shape check (
    (owner_type = 'WORKER' and worker_id is not null and hostel_id is null) or
    (owner_type = 'HOSTEL' and hostel_id is not null and worker_id is null)
  )
);

-- =============================================================
-- Level 5: depend on level-4 tables
-- =============================================================

create table public.plantpro_allocation_snapshot_items (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null references public.plantpro_allocation_snapshots(id) on delete cascade,
  project_id bigint not null references public.plantpro_projects(id) on delete restrict,
  percentage numeric not null
);

create table public.plantpro_ot_days (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  ot_month_id bigint not null references public.plantpro_ot_months(id) on delete cascade,
  day text not null,
  basic numeric not null default 0,
  ot numeric not null default 0,
  unique (ot_month_id, day)
);

-- Audit log of mid-month supervisor reassignments. The corresponding
-- Worker.supervisorId live-mutation (PMS's POST /api/ot/transfer does both)
-- is application logic, not a trigger — the Server Action must perform both
-- writes together, same as PMS's route handler does.
create table public.plantpro_worker_transfers (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  month text not null,
  day text not null,
  to_supervisor_id bigint not null references public.plantpro_supervisors(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (worker_id, month, day)
);

-- One independent approval workflow per (month, supervisor). *_by columns
-- are real identities, not PMS's free-text role/name strings — the
-- deliberate improvement noted above. Nullable because the 2 real historical
-- PMS rows may not cleanly resolve to a linked_user_id (migration script
-- leaves unresolved ones null rather than guessing).
create table public.plantpro_ot_approvals (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  month text not null,
  supervisor_id bigint not null references public.plantpro_supervisors(id) on delete cascade,
  status text not null default 'Draft' check (status in ('Draft','Pending Approval','Approved','Rejected')),
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  unique (month, supervisor_id)
);

create table public.plantpro_monthly_targets (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  project_id bigint not null references public.plantpro_projects(id) on delete cascade,
  month text not null,
  production_target numeric not null default 0,
  delivery_target numeric not null default 0,
  general_target numeric not null default 0,
  unique (project_id, month)
);

create table public.plantpro_claims (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  project_id bigint not null references public.plantpro_projects(id) on delete restrict,
  type text not null check (type in ('Production','Delivery','General')),
  volume_or_trips numeric not null default 0,
  amount numeric not null default 0,
  remarks text,
  date date not null,
  created_at timestamptz not null default now()
);

create table public.plantpro_hostel_utility_bills (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  hostel_id bigint not null references public.plantpro_hostels(id) on delete cascade,
  month text not null,
  applied_at timestamptz,
  unique (hostel_id, month)
);

-- =============================================================
-- Level 6: depend on level-5 tables
-- =============================================================

-- Per-day override of the standing WorkerAllocation split. 0 rows in PMS
-- today; ported with full shape regardless.
create table public.plantpro_ot_day_allocations (
  id bigint generated always as identity primary key,
  ot_day_id bigint not null references public.plantpro_ot_days(id) on delete cascade,
  project_id bigint not null references public.plantpro_projects(id) on delete restrict,
  percentage numeric not null,
  unique (ot_day_id, project_id)
);

create table public.plantpro_hostel_bill_line_items (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  bill_id bigint not null references public.plantpro_hostel_utility_bills(id) on delete cascade,
  item_type_id bigint not null references public.plantpro_hostel_bill_item_types(id) on delete restrict,
  amount numeric not null default 0,
  unique (bill_id, item_type_id)
);

-- =============================================================
-- RLS
-- =============================================================

-- Wage-visibility helper. First role-tiered (not just department-tiered)
-- access check in the codebase — every other department's RLS is uniform
-- has_dept_access(dept) for all roles.
create or replace function public.plantpro_can_see_wages()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_department_access uda
    where uda.user_id = auth.uid()
      and uda.department = 'plantpro'
      and uda.role in ('admin', 'manager', 'hr')
  );
$$;
grant execute on function public.plantpro_can_see_wages() to authenticated;

alter table public.plantpro_project_types enable row level security;
alter table public.plantpro_supervisors enable row level security;
alter table public.plantpro_pay_columns enable row level security;
alter table public.plantpro_pay_column_bases enable row level security;
alter table public.plantpro_document_types enable row level security;
alter table public.plantpro_hostel_bill_item_types enable row level security;
alter table public.plantpro_hostels enable row level security;
alter table public.plantpro_settings enable row level security;
alter table public.plantpro_timesheet_multiplier enable row level security;
alter table public.plantpro_holidays enable row level security;
alter table public.plantpro_projects enable row level security;
alter table public.plantpro_workers enable row level security;
alter table public.plantpro_worker_pay_values enable row level security;
alter table public.plantpro_worker_allocations enable row level security;
alter table public.plantpro_allocation_snapshots enable row level security;
alter table public.plantpro_ot_months enable row level security;
alter table public.plantpro_timesheet_days enable row level security;
alter table public.plantpro_hostel_stays enable row level security;
alter table public.plantpro_documents enable row level security;
alter table public.plantpro_allocation_snapshot_items enable row level security;
alter table public.plantpro_ot_days enable row level security;
alter table public.plantpro_worker_transfers enable row level security;
alter table public.plantpro_ot_approvals enable row level security;
alter table public.plantpro_monthly_targets enable row level security;
alter table public.plantpro_claims enable row level security;
alter table public.plantpro_hostel_utility_bills enable row level security;
alter table public.plantpro_ot_day_allocations enable row level security;
alter table public.plantpro_hostel_bill_line_items enable row level security;

-- Uniform has_dept_access('plantpro') policy for every table EXCEPT
-- plantpro_worker_pay_values.
create policy "plantpro_all_access" on public.plantpro_project_types for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_supervisors for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_pay_columns for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_pay_column_bases for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_document_types for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_hostel_bill_item_types for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_hostels for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_settings for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_timesheet_multiplier for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_holidays for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_projects for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_workers for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_worker_allocations for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_allocation_snapshots for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_ot_months for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_timesheet_days for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_hostel_stays for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_documents for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_allocation_snapshot_items for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_ot_days for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_worker_transfers for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_ot_approvals for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_monthly_targets for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_claims for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_hostel_utility_bills for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_ot_day_allocations for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));
create policy "plantpro_all_access" on public.plantpro_hostel_bill_line_items for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));

-- plantpro_worker_pay_values: write access is uniform (a Supervisor never
-- has a UI path to touch this table anyway — the OT grid only writes
-- OtDay/OtDayAllocation), but SELECT is restricted to wage-visible roles.
-- This is the actual enforcement of decision #3.
create policy "plantpro members write pay values" on public.plantpro_worker_pay_values for insert with check (has_dept_access('plantpro'));
create policy "plantpro members update pay values" on public.plantpro_worker_pay_values for update using (has_dept_access('plantpro'));
create policy "plantpro members delete pay values" on public.plantpro_worker_pay_values for delete using (has_dept_access('plantpro'));
create policy "plantpro wage-visible roles select pay values" on public.plantpro_worker_pay_values for select using (public.plantpro_can_see_wages());

-- =============================================================
-- Nav permissions seed (manager/hr/supervisor — admin always sees
-- everything per AppNavigation's isAllowed()). Getting this right the first
-- time, matching v38's lesson learned from v23/v25's after-the-fact patch.
-- =============================================================

-- config's allowed roles mirror PMS's own requireRole(['GM','Manager','HR'])
-- on that page today (admin==GM always sees it regardless, per
-- AppNavigation's isAllowed() admin-bypass) — deliberately NOT treated as an
-- admin-only "Settings" page the way mould/maintenance treat theirs, because
-- PMS's real business rule already includes Manager and HR.
insert into public.department_nav_permissions (department, role, nav_key) values
  ('plantpro', 'manager', '/plantpro'),
  ('plantpro', 'manager', '/plantpro/ot'),
  ('plantpro', 'manager', '/plantpro/timesheet'),
  ('plantpro', 'manager', '/plantpro/hr'),
  ('plantpro', 'manager', '/plantpro/hostel'),
  ('plantpro', 'manager', '/plantpro/documents'),
  ('plantpro', 'manager', '/plantpro/import'),
  ('plantpro', 'manager', '/plantpro/targets'),
  ('plantpro', 'manager', '/plantpro/claims'),
  ('plantpro', 'manager', '/plantpro/config'),
  ('plantpro', 'hr', '/plantpro'),
  ('plantpro', 'hr', '/plantpro/timesheet'),
  ('plantpro', 'hr', '/plantpro/hr'),
  ('plantpro', 'hr', '/plantpro/hostel'),
  ('plantpro', 'hr', '/plantpro/documents'),
  ('plantpro', 'hr', '/plantpro/import'),
  ('plantpro', 'hr', '/plantpro/config'),
  ('plantpro', 'supervisor', '/plantpro'),
  ('plantpro', 'supervisor', '/plantpro/ot')
on conflict do nothing;

-- =============================================================
-- Indexes
-- =============================================================

create index plantpro_workers_supervisor_idx on public.plantpro_workers(supervisor_id);
create index plantpro_worker_pay_values_worker_idx on public.plantpro_worker_pay_values(worker_id);
create index plantpro_worker_allocations_worker_idx on public.plantpro_worker_allocations(worker_id);
create index plantpro_ot_months_worker_month_idx on public.plantpro_ot_months(worker_id, month);
create index plantpro_ot_days_month_idx on public.plantpro_ot_days(ot_month_id);
create index plantpro_timesheet_days_worker_month_idx on public.plantpro_timesheet_days(worker_id, month);
create index plantpro_hostel_stays_worker_idx on public.plantpro_hostel_stays(worker_id);
create index plantpro_hostel_stays_hostel_idx on public.plantpro_hostel_stays(hostel_id);
create index plantpro_documents_worker_idx on public.plantpro_documents(worker_id);
create index plantpro_documents_hostel_idx on public.plantpro_documents(hostel_id);
create index plantpro_documents_expiry_idx on public.plantpro_documents(expiry_date);
create index plantpro_ot_approvals_month_idx on public.plantpro_ot_approvals(month);
create index plantpro_claims_project_idx on public.plantpro_claims(project_id);
create index plantpro_monthly_targets_project_month_idx on public.plantpro_monthly_targets(project_id, month);
