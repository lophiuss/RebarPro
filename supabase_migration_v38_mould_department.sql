-- v38: Mould department (5th department) — schema.
--
-- Captures mould fabrication / change / maintenance cost by project by month.
-- Additive only: new mould_* tables, plus widening the same three department
-- CHECK constraints (user_department_access, department_nav_permissions,
-- shoutouts) to accept 'mould' — no existing rebar/cement/security/maintenance
-- row, column, or policy is touched.
--
-- Applied live to jiltqrunlpewqkofzulz via `supabase db query --linked -f`
-- (this session's Supabase MCP connector was bound to a different, unrelated
-- project — tunnelSDSv1 — so the CLI was used directly against the linked
-- project instead, matching the same Management API path MCP would take).
-- get_advisors ran clean afterward except two warnings on
-- mould_assert_month_open matching the pre-existing pattern on every other
-- SECURITY DEFINER function here; hardened with an explicit REVOKE below.
-- This file is the local record of that state, matching the v2..v37 convention.
--
-- Design notes (decisions confirmed with the plant owner):
--   * Cost = material (standard steel rate x weight) + labour (hours x rate).
--   * Labour hours are booked to the month they were WORKED; the steel weight
--     and its cost are booked when the job COMPLETES. Hence per-day time rows.
--   * All rates are SNAPSHOTTED onto the row at save/completion. Reports must
--     never recompute historical cost from today's rates.
--   * Workers and projects are the master data of plant-management-system,
--     which is still Prisma/SQLite. Until it migrates to Supabase, both are
--     imported here with source_pms_id kept for one-time reconciliation later.
--   * mould_assets.product_weight_kg (concrete per pour) and
--     mould_assets.steel_weight_kg (the mould's own steel) are deliberately
--     SEPARATE. The PFMMS prototype conflated them, so adding a stiffener
--     plate during rework permanently inflated reported production tonnage.

alter table public.user_department_access drop constraint user_department_access_department_check;
alter table public.user_department_access add constraint user_department_access_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould']));

alter table public.department_nav_permissions drop constraint department_nav_permissions_department_check;
alter table public.department_nav_permissions add constraint department_nav_permissions_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould']));

alter table public.shoutouts drop constraint shoutouts_department_check;
alter table public.shoutouts add constraint shoutouts_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould']));

-- Singleton settings row (mirrors maintenance_settings / cement_alert_settings).
-- provisional_labour_rate_per_hour is a PLACEHOLDER until plant-management-system
-- migrates and real per-worker wages become available. It must be labelled as
-- provisional wherever it surfaces in the UI.
create table public.mould_settings (
  id int primary key default 1 check (id = 1),
  standard_steel_rate_per_kg numeric not null default 6.00,
  provisional_labour_rate_per_hour numeric not null default 8.00,
  scrap_rate_per_kg numeric not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.mould_settings (id) values (1);

-- Default nav permissions for manager/supervisor. AppNavigation only shows a
-- page to a non-admin role when a department_nav_permissions row explicitly
-- allows it (admins always see everything) — v23 shipped without this and
-- had to be patched in v25 after managers/technicians landed on an empty
-- sidebar. Getting it right here the first time.
--
-- supervisor: day-to-day — report, mould register, jobs, time allocation.
-- manager: everything supervisor has, plus Month Lock visibility (locking
-- itself is still enforced admin-only at the action layer, independent of
-- nav visibility) — not Settings (standard rate changes stay admin-only).
insert into public.department_nav_permissions (department, role, nav_key) values
  ('mould', 'supervisor', '/mould'),
  ('mould', 'supervisor', '/mould/assets'),
  ('mould', 'supervisor', '/mould/jobs'),
  ('mould', 'supervisor', '/mould/allocation'),
  ('mould', 'manager', '/mould'),
  ('mould', 'manager', '/mould/assets'),
  ('mould', 'manager', '/mould/jobs'),
  ('mould', 'manager', '/mould/allocation'),
  ('mould', 'manager', '/mould/month-lock')
on conflict do nothing;

-- Master data imported from plant-management-system (Prisma/SQLite).
create table public.mould_projects (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  code text,
  name text not null,
  status text not null default 'active' check (status in ('active','completed')),
  created_at timestamptz not null default now()
);

create table public.mould_workers (
  id bigint generated always as identity primary key,
  source_pms_id bigint unique,
  worker_no text,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.mould_assets (
  id bigint generated always as identity primary key,
  mould_code text,
  name text not null,
  mould_type text not null default 'project_bound' check (mould_type in ('project_bound','common')),
  status text not null default 'fabricating' check (status in ('fabricating','active','parked','eol')),
  owning_project_id bigint references public.mould_projects(id) on delete set null,
  current_project_id bigint references public.mould_projects(id) on delete set null,
  product_weight_kg numeric,
  steel_weight_kg numeric not null default 0,
  parked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Activity taxonomy. cost_target decides where an hour lands:
--   mould   -> must sit on a mould_job (fabrication / change / maintenance)
--   project -> charged straight to the project (cast-in items, routine work)
--   factory -> factory overhead, no project
create table public.mould_activities (
  code text primary key,
  label text not null,
  cost_target text not null check (cost_target in ('mould','project','factory')),
  sort_order int not null default 0,
  is_active boolean not null default true
);

insert into public.mould_activities (code, label, cost_target, sort_order) values
  ('fabricate_new',   'Fabricate new mould',        'mould',   10),
  ('modify_mould',    'Modify mould',               'mould',   20),
  ('maintain_mould',  'Mould maintenance',          'mould',   30),
  ('decommission',    'Dismantle (decommission)',   'mould',   40),
  ('assembly',        'Assembly',                   'project', 50),
  ('dismantle_cast',  'Dismantle (after cast)',     'project', 60),
  ('shifting',        'Shifting of mould',          'project', 70),
  ('cast_in_items',   'Fabricate cast-in items',    'project', 80),
  ('mould_work',      'General mould work',         'project', 90),
  ('factory_work',    'Factory work',               'factory', 100);

-- A job is the cost container. Hours accrue to it daily; steel weight and its
-- cost are recorded once, at completion.
create table public.mould_jobs (
  id bigint generated always as identity primary key,
  job_no text,
  mould_id bigint not null references public.mould_assets(id) on delete restrict,
  job_type text not null check (job_type in ('fabrication','change','maintenance','decommission')),
  cost_center text not null default 'project' check (cost_center in ('project','factory')),
  project_id bigint references public.mould_projects(id) on delete set null,
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  started_on date,
  completed_on date,
  added_steel_kg numeric not null default 0,
  steel_rate_snapshot numeric,
  material_cost_snapshot numeric,
  scrap_weight_kg numeric,
  scrap_rate_snapshot numeric,
  scrap_value_snapshot numeric,
  notes text,
  created_at timestamptz not null default now(),
  constraint mould_jobs_project_required
    check (cost_center = 'factory' or project_id is not null)
);

-- One row per worker per day per target. This is the deliberate divergence
-- from maintenance_job_reports (which stores a single aggregate
-- repair_time_hours): an aggregate cannot be split across workers on
-- different rates, nor across a month boundary.
create table public.mould_time_entries (
  id bigint generated always as identity primary key,
  work_date date not null,
  worker_id bigint not null references public.mould_workers(id) on delete restrict,
  hours numeric not null check (hours > 0),
  activity_code text not null references public.mould_activities(code),
  cost_target text not null check (cost_target in ('mould','project','factory')),
  job_id bigint references public.mould_jobs(id) on delete cascade,
  project_id bigint references public.mould_projects(id) on delete set null,
  rate_used numeric not null,
  labour_cost numeric not null,
  is_provisional_rate boolean not null default true,
  created_at timestamptz not null default now(),
  constraint mould_time_entries_target_shape check (
    (cost_target = 'mould'   and job_id is not null) or
    (cost_target = 'project' and project_id is not null) or
    (cost_target = 'factory')
  )
);

-- Month-end lock. Supervisors must reconcile allocated hours against the
-- timecard before HR/admin locks the period; once locked nothing may change.
create table public.mould_month_locks (
  period text primary key check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'open' check (status in ('open','locked')),
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Hard enforcement of the lock at the database, not just the UI.
create or replace function public.mould_assert_month_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dates date[];
  d date;
begin
  -- On UPDATE both the old and the new date are checked, so an entry can
  -- neither be moved into nor out of a locked period. OLD is only referenced
  -- inside a guarded branch: it is unassigned during INSERT.
  if tg_op = 'INSERT' then
    dates := array[new.work_date];
  elsif tg_op = 'DELETE' then
    dates := array[old.work_date];
  else
    dates := array[old.work_date, new.work_date];
  end if;

  foreach d in array dates
  loop
    if exists (
      select 1 from public.mould_month_locks
      where period = to_char(d, 'YYYY-MM') and status = 'locked'
    ) then
      raise exception 'Period % is locked; time entries can no longer be changed.',
        to_char(d, 'YYYY-MM');
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger mould_time_entries_lock_guard
  before insert or update or delete on public.mould_time_entries
  for each row execute function public.mould_assert_month_open();

-- get_advisors flagged this as callable directly via PostgREST RPC by
-- anon/authenticated (it would just error outside trigger context, since it
-- reads TG_OP/NEW/OLD, but there's no reason to leave it reachable at all).
revoke execute on function public.mould_assert_month_open() from public, anon, authenticated;

-- RLS: has_dept_access('mould') everywhere, same accepted pattern as every
-- other department (role restriction is nav-hiding, not RLS).
alter table public.mould_settings enable row level security;
alter table public.mould_projects enable row level security;
alter table public.mould_workers enable row level security;
alter table public.mould_assets enable row level security;
alter table public.mould_activities enable row level security;
alter table public.mould_jobs enable row level security;
alter table public.mould_time_entries enable row level security;
alter table public.mould_month_locks enable row level security;

create policy "mould_all_access" on public.mould_settings for all using (has_dept_access('mould')) with check (has_dept_access('mould'));
create policy "mould_all_access" on public.mould_projects for all using (has_dept_access('mould')) with check (has_dept_access('mould'));
create policy "mould_all_access" on public.mould_workers for all using (has_dept_access('mould')) with check (has_dept_access('mould'));
create policy "mould_all_access" on public.mould_assets for all using (has_dept_access('mould')) with check (has_dept_access('mould'));
create policy "mould_all_access" on public.mould_activities for all using (has_dept_access('mould')) with check (has_dept_access('mould'));
create policy "mould_all_access" on public.mould_jobs for all using (has_dept_access('mould')) with check (has_dept_access('mould'));
create policy "mould_all_access" on public.mould_time_entries for all using (has_dept_access('mould')) with check (has_dept_access('mould'));
create policy "mould_all_access" on public.mould_month_locks for all using (has_dept_access('mould')) with check (has_dept_access('mould'));

create index mould_assets_owning_project_idx on public.mould_assets(owning_project_id);
create index mould_jobs_mould_idx on public.mould_jobs(mould_id);
create index mould_jobs_project_idx on public.mould_jobs(project_id);
create index mould_jobs_completed_idx on public.mould_jobs(completed_on);
create index mould_time_entries_job_idx on public.mould_time_entries(job_id);
create index mould_time_entries_date_idx on public.mould_time_entries(work_date);
create index mould_time_entries_worker_idx on public.mould_time_entries(worker_id);
