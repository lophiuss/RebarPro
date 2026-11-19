-- v69: DLER (Direct Labour Efficiency Ratio) Module
--
-- Integrates the standalone DLER tracker into AlphaVision as the 9th department ('dler')
-- with strict role & salary isolation, Daily & Monthly DLER by Department and Project,
-- separate GP and m3 analytics, an isolated DLER Org Chart + Project % Configurator,
-- and Stage 2 readiness columns for future ERP & external OT app syncing.

-- ============================================================================
-- 1. Widen department CHECK constraints to accept 'dler'
-- ============================================================================
alter table public.user_department_access drop constraint if exists user_department_access_department_check;
alter table public.user_department_access add constraint user_department_access_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro','meetings','qaqc','dler']));

alter table public.department_nav_permissions drop constraint if exists department_nav_permissions_department_check;
alter table public.department_nav_permissions add constraint department_nav_permissions_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro','meetings','qaqc','dler']));

alter table public.shoutouts drop constraint if exists shoutouts_department_check;
alter table public.shoutouts add constraint shoutouts_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro','meetings','qaqc','dler']));

-- ============================================================================
-- 2. Role helper function
-- ============================================================================
create or replace function public.dler_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_department_access
  where user_id = auth.uid() and department = 'dler'
  limit 1;
$$;
grant execute on function public.dler_my_role() to authenticated;

-- ============================================================================
-- 3. Core Tables
-- ============================================================================
create table if not exists public.dler_settings (
  id int primary key default 1 check (id = 1),
  working_days_mode text not null default 'fixed_26' check (working_days_mode in ('fixed_26','weekdays_excl_holidays','calendar_days')),
  fixed_working_days numeric not null default 26,
  standard_hours_per_day numeric not null default 8,
  normal_ot_multiplier numeric not null default 1.5,
  sunday_ot_multiplier numeric not null default 2.0,
  holiday_ot_multiplier numeric not null default 3.0,
  include_base_on_sunday_holiday boolean not null default false,
  erp_sync_url text,
  ot_sync_mode text not null default 'manual' check (ot_sync_mode in ('manual','hr_timesheet','external_api')),
  updated_at timestamptz not null default now()
);
insert into public.dler_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.dler_holidays (
  id bigint generated always as identity primary key,
  date date not null unique,
  label text not null
);

create table if not exists public.dler_factories (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.dler_departments (
  id bigint generated always as identity primary key,
  name text not null,
  factory_id bigint not null references public.dler_factories(id) on delete cascade,
  kind text not null default 'production' check (kind in ('production','support')),
  sort_order int not null default 0,
  unique (name, factory_id)
);

create table if not exists public.dler_projects (
  id bigint generated always as identity primary key,
  name text not null,
  factory_id bigint not null references public.dler_factories(id) on delete cascade,
  department_id bigint references public.dler_departments(id) on delete set null,
  plantpro_project_id bigint references public.plantpro_projects(id) on delete set null,
  status text not null default 'Active' check (status in ('Active','Inactive')),
  erp_code text,
  unique (name, factory_id)
);

create table if not exists public.dler_people (
  id bigint generated always as identity primary key,
  person_type text not null check (person_type in ('STAFF','WORKER')),
  emp_no text not null,
  name text not null,
  designation text,
  department_id bigint references public.dler_departments(id) on delete set null,
  reports_to_id bigint references public.dler_people(id) on delete set null,
  status text not null default 'Active' check (status in ('Active','Inactive','On Leave')),
  plantpro_worker_id bigint unique references public.plantpro_workers(id) on delete set null,
  remarks text,
  created_at timestamptz not null default now(),
  unique (person_type, emp_no)
);

create table if not exists public.dler_project_allocations (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.dler_people(id) on delete cascade,
  project_id bigint not null references public.dler_projects(id) on delete cascade,
  percentage numeric not null check (percentage >= 0 and percentage <= 100),
  unique (person_id, project_id)
);

create table if not exists public.dler_monthly_pay (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.dler_people(id) on delete cascade,
  month text not null,
  basic_pay numeric not null default 0,
  allowance numeric not null default 0,
  employer_statutory numeric not null default 0,
  deductions numeric not null default 0,
  gross_pay numeric not null default 0,
  working_days_override numeric,
  hourly_rate_override numeric,
  remarks text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (person_id, month)
);

create table if not exists public.dler_daily_ot (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.dler_people(id) on delete cascade,
  work_date date not null,
  basic_hours numeric not null default 8,
  ot_hours numeric not null default 0,
  day_type text not null default 'normal' check (day_type in ('normal','sunday','holiday')),
  is_absent boolean not null default false,
  source text not null default 'manual' check (source in ('manual','ot_app_sync')),
  external_ref text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (person_id, work_date)
);

create table if not exists public.dler_daily_m3 (
  id bigint generated always as identity primary key,
  entry_key text not null unique,
  entry_date date not null,
  target_type text not null default 'project' check (target_type in ('project','department')),
  project_id bigint references public.dler_projects(id) on delete cascade,
  department_id bigint references public.dler_departments(id) on delete cascade,
  m3_volume numeric not null default 0,
  remarks text,
  source text not null default 'manual' check (source in ('manual','erp_sync')),
  erp_ref text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint dler_daily_m3_target_chk check (
    (target_type = 'project' and project_id is not null and department_id is null) or
    (target_type = 'department' and department_id is not null and project_id is null)
  )
);

create unique index if not exists dler_daily_m3_proj_uniq on public.dler_daily_m3(entry_date, project_id) where target_type = 'project';
create unique index if not exists dler_daily_m3_dept_uniq on public.dler_daily_m3(entry_date, department_id) where target_type = 'department';

create table if not exists public.dler_gp_entries (
  id bigint generated always as identity primary key,
  entry_key text not null unique,
  period_type text not null default 'monthly' check (period_type in ('monthly','daily')),
  month text not null,
  entry_date date,
  target_type text not null check (target_type in ('project','department','factory')),
  project_id bigint references public.dler_projects(id) on delete cascade,
  department_id bigint references public.dler_departments(id) on delete cascade,
  factory_id bigint references public.dler_factories(id) on delete cascade,
  gross_profit numeric not null default 0,
  remarks text,
  source text not null default 'manual' check (source in ('manual','erp_sync')),
  erp_ref text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint dler_gp_entries_target_chk check (
    (target_type = 'project' and project_id is not null and department_id is null and factory_id is null) or
    (target_type = 'department' and department_id is not null and project_id is null and factory_id is null) or
    (target_type = 'factory' and factory_id is not null and project_id is null and department_id is null)
  )
);

create unique index if not exists dler_gp_monthly_proj_uniq on public.dler_gp_entries(month, project_id) where period_type = 'monthly' and target_type = 'project';
create unique index if not exists dler_gp_monthly_dept_uniq on public.dler_gp_entries(month, department_id) where period_type = 'monthly' and target_type = 'department';
create unique index if not exists dler_gp_monthly_fac_uniq on public.dler_gp_entries(month, factory_id) where period_type = 'monthly' and target_type = 'factory';
create unique index if not exists dler_gp_daily_proj_uniq on public.dler_gp_entries(entry_date, project_id) where period_type = 'daily' and target_type = 'project';
create unique index if not exists dler_gp_daily_dept_uniq on public.dler_gp_entries(entry_date, department_id) where period_type = 'daily' and target_type = 'department';
create unique index if not exists dler_gp_daily_fac_uniq on public.dler_gp_entries(entry_date, factory_id) where period_type = 'daily' and target_type = 'factory';

-- Useful query indexes
create index if not exists dler_people_type_dept_idx on public.dler_people(person_type, department_id);
create index if not exists dler_people_reports_to_idx on public.dler_people(reports_to_id);
create index if not exists dler_alloc_proj_idx on public.dler_project_allocations(project_id);
create index if not exists dler_monthly_pay_month_idx on public.dler_monthly_pay(month);
create index if not exists dler_daily_ot_date_idx on public.dler_daily_ot(work_date);
create index if not exists dler_daily_m3_date_idx on public.dler_daily_m3(entry_date);
create index if not exists dler_gp_entries_month_idx on public.dler_gp_entries(month);

-- ============================================================================
-- 4. Row Level Security (Strict Role & Salary Isolation)
-- ============================================================================
alter table public.dler_settings enable row level security;
alter table public.dler_holidays enable row level security;
alter table public.dler_factories enable row level security;
alter table public.dler_departments enable row level security;
alter table public.dler_projects enable row level security;
alter table public.dler_people enable row level security;
alter table public.dler_project_allocations enable row level security;
alter table public.dler_monthly_pay enable row level security;
alter table public.dler_daily_ot enable row level security;
alter table public.dler_daily_m3 enable row level security;
alter table public.dler_gp_entries enable row level security;

-- Reference tables
drop policy if exists "dler_settings_select" on public.dler_settings;
create policy "dler_settings_select" on public.dler_settings for select using (has_dept_access('dler'));
drop policy if exists "dler_settings_admin" on public.dler_settings;
create policy "dler_settings_admin" on public.dler_settings for all using (dler_my_role() = 'admin') with check (dler_my_role() = 'admin');

drop policy if exists "dler_holidays_select" on public.dler_holidays;
create policy "dler_holidays_select" on public.dler_holidays for select using (has_dept_access('dler'));
drop policy if exists "dler_holidays_admin" on public.dler_holidays;
create policy "dler_holidays_admin" on public.dler_holidays for all using (dler_my_role() = 'admin') with check (dler_my_role() = 'admin');

drop policy if exists "dler_factories_select" on public.dler_factories;
create policy "dler_factories_select" on public.dler_factories for select using (has_dept_access('dler'));
drop policy if exists "dler_factories_admin" on public.dler_factories;
create policy "dler_factories_admin" on public.dler_factories for all using (dler_my_role() = 'admin') with check (dler_my_role() = 'admin');

drop policy if exists "dler_departments_select" on public.dler_departments;
create policy "dler_departments_select" on public.dler_departments for select using (has_dept_access('dler'));
drop policy if exists "dler_departments_admin" on public.dler_departments;
create policy "dler_departments_admin" on public.dler_departments for all using (dler_my_role() = 'admin') with check (dler_my_role() = 'admin');

drop policy if exists "dler_projects_select" on public.dler_projects;
create policy "dler_projects_select" on public.dler_projects for select using (has_dept_access('dler'));
drop policy if exists "dler_projects_admin" on public.dler_projects;
create policy "dler_projects_admin" on public.dler_projects for all using (dler_my_role() = 'admin') with check (dler_my_role() = 'admin');

-- People (Org Chart & Project %): readable by admin, viewer, hr_worker, hr_staff; writable by admin or matching HR tier
drop policy if exists "dler_people_select" on public.dler_people;
create policy "dler_people_select" on public.dler_people for select
  using (dler_my_role() in ('admin', 'viewer', 'hr_worker', 'hr_staff'));

drop policy if exists "dler_people_insert" on public.dler_people;
create policy "dler_people_insert" on public.dler_people for insert
  with check (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and person_type = 'WORKER')
    or (dler_my_role() = 'hr_staff' and person_type = 'STAFF')
  );

drop policy if exists "dler_people_update" on public.dler_people;
create policy "dler_people_update" on public.dler_people for update
  using (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and person_type = 'WORKER')
    or (dler_my_role() = 'hr_staff' and person_type = 'STAFF')
  )
  with check (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and person_type = 'WORKER')
    or (dler_my_role() = 'hr_staff' and person_type = 'STAFF')
  );

drop policy if exists "dler_people_delete" on public.dler_people;
create policy "dler_people_delete" on public.dler_people for delete
  using (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and person_type = 'WORKER')
    or (dler_my_role() = 'hr_staff' and person_type = 'STAFF')
  );

-- Project % Allocations
drop policy if exists "dler_alloc_select" on public.dler_project_allocations;
create policy "dler_alloc_select" on public.dler_project_allocations for select
  using (dler_my_role() in ('admin', 'viewer', 'hr_worker', 'hr_staff'));

drop policy if exists "dler_alloc_write" on public.dler_project_allocations;
create policy "dler_alloc_write" on public.dler_project_allocations for all
  using (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'WORKER'))
    or (dler_my_role() = 'hr_staff' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'STAFF'))
  )
  with check (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'WORKER'))
    or (dler_my_role() = 'hr_staff' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'STAFF'))
  );

-- Monthly Pay (STRICT salary isolation: hr_worker sees WORKER only, hr_staff sees STAFF only, admin sees all)
drop policy if exists "dler_monthly_pay_isolation" on public.dler_monthly_pay;
create policy "dler_monthly_pay_isolation" on public.dler_monthly_pay for all
  using (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'WORKER'))
    or (dler_my_role() = 'hr_staff' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'STAFF'))
  )
  with check (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'WORKER'))
    or (dler_my_role() = 'hr_staff' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'STAFF'))
  );

-- Daily OT (STRICT isolation matching monthly pay)
drop policy if exists "dler_daily_ot_isolation" on public.dler_daily_ot;
create policy "dler_daily_ot_isolation" on public.dler_daily_ot for all
  using (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'WORKER'))
    or (dler_my_role() = 'hr_staff' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'STAFF'))
  )
  with check (
    dler_my_role() = 'admin'
    or (dler_my_role() = 'hr_worker' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'WORKER'))
    or (dler_my_role() = 'hr_staff' and exists (select 1 from public.dler_people p where p.id = person_id and p.person_type = 'STAFF'))
  );

-- Daily m3 (David + Admin write; Viewer reads)
drop policy if exists "dler_daily_m3_select" on public.dler_daily_m3;
create policy "dler_daily_m3_select" on public.dler_daily_m3 for select
  using (dler_my_role() in ('admin', 'viewer', 'm3_input'));

drop policy if exists "dler_daily_m3_write" on public.dler_daily_m3;
create policy "dler_daily_m3_write" on public.dler_daily_m3 for all
  using (dler_my_role() in ('admin', 'm3_input'))
  with check (dler_my_role() in ('admin', 'm3_input'));

-- Gross Profit (Khai + Admin write; Viewer reads)
drop policy if exists "dler_gp_select" on public.dler_gp_entries;
create policy "dler_gp_select" on public.dler_gp_entries for select
  using (dler_my_role() in ('admin', 'viewer', 'gp_input'));

drop policy if exists "dler_gp_write" on public.dler_gp_entries;
create policy "dler_gp_write" on public.dler_gp_entries for all
  using (dler_my_role() in ('admin', 'gp_input'))
  with check (dler_my_role() in ('admin', 'gp_input'));

-- ============================================================================
-- 5. Seed Initial Data (Holidays, Factory, Departments, Projects, Workers, GP)
-- ============================================================================

-- 5a. Holidays from plantpro_holidays
insert into public.dler_holidays (date, label)
select date, label from public.plantpro_holidays
on conflict (date) do nothing;

-- 5b. Default Factory
insert into public.dler_factories (name) values ('Factory')
on conflict (name) do nothing;

-- 5c. Departments (production & support from standalone Dler)
do $$
declare
  v_factory_id bigint;
  v_dept_building bigint;
  v_dept_tunnel bigint;
  v_dept_sbg bigint;
  v_dept_bp68 bigint;
  v_dept_bp79 bigint;
  v_dept_rebar bigint;
  v_dept_maint bigint;
  v_dept_log bigint;
  v_dept_qaqc bigint;
begin
  select id into v_factory_id from public.dler_factories where name = 'Factory' limit 1;

  insert into public.dler_departments (name, factory_id, kind, sort_order) values
    ('Building',           v_factory_id, 'production', 1),
    ('Tunnel',             v_factory_id, 'production', 2),
    ('SBG',                v_factory_id, 'production', 3),
    ('BP 68',              v_factory_id, 'production', 4),
    ('BP 79',              v_factory_id, 'production', 5),
    ('Rebar',              v_factory_id, 'support',    6),
    ('Mould Fabrication',  v_factory_id, 'support',    7),
    ('Mould Modification', v_factory_id, 'support',    8),
    ('QAQC',               v_factory_id, 'support',    9),
    ('Maintenance',        v_factory_id, 'support',   10),
    ('Logistic',           v_factory_id, 'support',   11),
    ('Lab',                v_factory_id, 'support',   12),
    ('HR',                 v_factory_id, 'support',   13),
    ('Security',           v_factory_id, 'support',   14),
    ('Factory',            v_factory_id, 'support',   15)
  on conflict (name, factory_id) do nothing;

  select id into v_dept_building from public.dler_departments where name = 'Building' and factory_id = v_factory_id;
  select id into v_dept_tunnel   from public.dler_departments where name = 'Tunnel' and factory_id = v_factory_id;
  select id into v_dept_sbg      from public.dler_departments where name = 'SBG' and factory_id = v_factory_id;
  select id into v_dept_bp68     from public.dler_departments where name = 'BP 68' and factory_id = v_factory_id;
  select id into v_dept_bp79     from public.dler_departments where name = 'BP 79' and factory_id = v_factory_id;
  select id into v_dept_rebar    from public.dler_departments where name = 'Rebar' and factory_id = v_factory_id;
  select id into v_dept_maint    from public.dler_departments where name = 'Maintenance' and factory_id = v_factory_id;
  select id into v_dept_log      from public.dler_departments where name = 'Logistic' and factory_id = v_factory_id;
  select id into v_dept_qaqc     from public.dler_departments where name = 'QAQC' and factory_id = v_factory_id;

  -- 5d. Projects (from standalone Dler & plantpro_projects)
  insert into public.dler_projects (name, factory_id, department_id, plantpro_project_id, status) values
    ('BZ',           v_factory_id, v_dept_building, (select id from public.plantpro_projects where name = 'BZ' limit 1), 'Active'),
    ('BU',           v_factory_id, v_dept_building, (select id from public.plantpro_projects where name = 'BU' limit 1), 'Active'),
    ('KWC61&62',     v_factory_id, v_dept_building, (select id from public.plantpro_projects where name = 'KWC61&62' limit 1), 'Active'),
    ('J112',         v_factory_id, v_dept_building, (select id from public.plantpro_projects where name = 'J112 Beam & Plank' limit 1), 'Active'),
    ('N111 Beam',    v_factory_id, v_dept_building, (select id from public.plantpro_projects where name = 'N111 Beam & Plank' limit 1), 'Active'),
    ('N111 Parapet', v_factory_id, v_dept_building, (select id from public.plantpro_projects where name = 'N111 Parapet' limit 1), 'Active'),
    ('RR',           v_factory_id, v_dept_building, (select id from public.plantpro_projects where name = 'RR' limit 1), 'Active'),
    ('N101',         v_factory_id, v_dept_building, (select id from public.plantpro_projects where name = 'N101' limit 1), 'Active'),
    ('CR202',        v_factory_id, v_dept_tunnel,   null, 'Active'),
    ('CR108',        v_factory_id, v_dept_tunnel,   (select id from public.plantpro_projects where name = 'CR108' limit 1), 'Active'),
    ('CR210',        v_factory_id, v_dept_tunnel,   (select id from public.plantpro_projects where name = 'CR210' limit 1), 'Active'),
    ('CR206',        v_factory_id, v_dept_tunnel,   (select id from public.plantpro_projects where name = 'CR206' limit 1), 'Active'),
    ('N111',         v_factory_id, v_dept_sbg,      (select id from public.plantpro_projects where name = 'N111' limit 1), 'Active'),
    ('N113 & N115',  v_factory_id, v_dept_sbg,      null, 'Active'),
    ('N115',         v_factory_id, v_dept_sbg,      (select id from public.plantpro_projects where name = 'N115' limit 1), 'Active')
  on conflict (name, factory_id) do nothing;

  -- 5e. Seed Staff from plantpro_supervisors (so Org Chart has immediate hierarchy)
  insert into public.dler_people (person_type, emp_no, name, designation, status)
  select 'STAFF', 'SUP-' || s.id::text, s.name, 'Supervisor', s.status
  from public.plantpro_supervisors s
  on conflict (person_type, emp_no) do nothing;

  -- 5f. Seed all 156 Workers from plantpro_workers
  insert into public.dler_people (
    person_type, emp_no, name, designation, department_id, reports_to_id, status, plantpro_worker_id, remarks
  )
  select
    'WORKER',
    w.worker_no,
    w.name,
    coalesce(w.designation, nullif(trim(w.line), '')),
    case
      when w.line ilike '%BU SENGKANG%' or w.line ilike '%BZ1A%' or w.line ilike '%J112%' then v_dept_building
      when w.line ilike '%CR108%' or w.line ilike '%CR210%' then v_dept_tunnel
      when w.line ilike '%N115%' or w.line ilike '%N111%' then v_dept_sbg
      when w.line ilike '%BATCHING%' then v_dept_bp68
      when w.line ilike '%REBAR%' then v_dept_rebar
      when w.line ilike '%MAINTENANCE%' then v_dept_maint
      when w.line ilike '%DRIVER%' or w.line ilike '%FORKLIFT%' then v_dept_log
      else null
    end,
    (select dp.id from public.dler_people dp where dp.person_type = 'STAFF' and dp.emp_no = 'SUP-' || w.supervisor_id::text limit 1),
    w.status,
    w.id,
    case when w.line is not null and trim(w.line) <> '' then 'HR Line: ' || trim(w.line) else null end
  from public.plantpro_workers w
  on conflict (person_type, emp_no) do nothing;

  -- 5g. Seed 2026-09 GP entries migrated from Dler SQLite backup
  insert into public.dler_gp_entries (entry_key, period_type, month, target_type, project_id, gross_profit, source)
  select
    'monthly:project:2026-09:' || p.id::text,
    'monthly',
    '2026-09',
    'project',
    p.id,
    v.gp,
    'manual'
  from (values
    ('BU', -3000),
    ('BZ', -15000),
    ('CR108', 20000),
    ('CR202', 3000),
    ('CR206', 0),
    ('CR210', 50000),
    ('J112', 120000),
    ('KWC61&62', -15000),
    ('N111', 200000),
    ('N111 Beam', 14000),
    ('N111 Parapet', 10000),
    ('N113 & N115', 300000),
    ('RR', 20000)
  ) as v(proj_name, gp)
  join public.dler_projects p on p.name = v.proj_name and p.factory_id = v_factory_id
  on conflict (entry_key) do nothing;

  insert into public.dler_gp_entries (entry_key, period_type, month, target_type, department_id, gross_profit, source)
  select
    'monthly:department:2026-09:' || d.id::text,
    'monthly',
    '2026-09',
    'department',
    d.id,
    v.gp,
    'manual'
  from (values
    ('Rebar', 40000),
    ('BP 68', 40000),
    ('BP 79', 40000)
  ) as v(dept_name, gp)
  join public.dler_departments d on d.name = v.dept_name and d.factory_id = v_factory_id
  on conflict (entry_key) do nothing;
end $$;

-- ============================================================================
-- 6. Access Control & Nav Permissions
-- ============================================================================

-- Grant 'admin' in 'dler' to all existing department admins
insert into public.user_department_access (user_id, department, role)
select distinct user_id, 'dler', 'admin'
from public.user_department_access
where role = 'admin'
on conflict (user_id, department) do nothing;

-- Ensure primary admin davidthen4285@gmail.com is always 'admin' in 'dler'
insert into public.user_department_access (user_id, department, role) values
  ('217806c8-a2d0-468d-bb95-9227e724353b', 'dler', 'admin')
on conflict (user_id, department) do update set role = excluded.role;

-- Grant specific DLER roles to Anim, Laily, David, and Khai
insert into public.user_department_access (user_id, department, role) values
  ('1af09fd2-54fe-455f-bb70-f5be578146f3', 'dler', 'hr_worker'), -- Anim Misri (Worker Pay & OT + Worker Org Chart)
  ('a80ec11d-59e5-4639-b661-8d946a915e05', 'dler', 'hr_staff'),  -- Noor Laily Lastery (Staff Pay & OT + Staff Org Chart)
  ('861c963b-fc3e-4032-b242-8478db3da5c7', 'dler', 'm3_input'),  -- David Then (lophiuss@gmail.com -> Daily m3 Input)
  ('f921f487-c12e-46c4-842f-6091951d27f4', 'dler', 'gp_input')   -- Khai Lui (GP Input)
on conflict (user_id, department) do nothing;

-- Seed department_nav_permissions for DLER roles
insert into public.department_nav_permissions (department, role, nav_key) values
  ('dler', 'admin',     '/dler/dashboard'),
  ('dler', 'admin',     '/dler/org-chart'),
  ('dler', 'admin',     '/dler/workers'),
  ('dler', 'admin',     '/dler/staff'),
  ('dler', 'admin',     '/dler/m3'),
  ('dler', 'admin',     '/dler/gp'),
  ('dler', 'admin',     '/dler/config'),
  ('dler', 'viewer',    '/dler/dashboard'),
  ('dler', 'viewer',    '/dler/org-chart'),
  ('dler', 'hr_worker', '/dler/workers'),
  ('dler', 'hr_worker', '/dler/org-chart'),
  ('dler', 'hr_staff',  '/dler/staff'),
  ('dler', 'hr_staff',  '/dler/org-chart'),
  ('dler', 'm3_input',  '/dler/m3'),
  ('dler', 'gp_input',  '/dler/gp')
on conflict do nothing;
