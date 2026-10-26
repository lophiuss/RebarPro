-- v61: QAQC Module — schema & permissions.
--
-- Cross-department tracking of QAQC test execution, Purchasing PO issuance,
-- and Account invoicing & payment status, with monthly/yearly executive dashboard.
--
-- 1. Widen department check constraints to accept 'qaqc'.
alter table public.user_department_access drop constraint user_department_access_department_check;
alter table public.user_department_access add constraint user_department_access_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro','meetings','qaqc']));

alter table public.department_nav_permissions drop constraint department_nav_permissions_department_check;
alter table public.department_nav_permissions add constraint department_nav_permissions_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro','meetings','qaqc']));

alter table public.shoutouts drop constraint shoutouts_department_check;
alter table public.shoutouts add constraint shoutouts_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro','meetings','qaqc']));

-- 2. Seed default nav permissions for QAQC roles.
insert into public.department_nav_permissions (department, role, nav_key) values
  ('qaqc', 'admin',     '/qaqc/dashboard'),
  ('qaqc', 'admin',     '/qaqc/records'),
  ('qaqc', 'admin',     '/qaqc/targets'),
  ('qaqc', 'admin',     '/qaqc/settings'),
  ('qaqc', 'manager',   '/qaqc/dashboard'),
  ('qaqc', 'manager',   '/qaqc/records'),
  ('qaqc', 'manager',   '/qaqc/targets'),
  ('qaqc', 'manager',   '/qaqc/settings'),
  ('qaqc', 'qaqc',      '/qaqc/dashboard'),
  ('qaqc', 'qaqc',      '/qaqc/records'),
  ('qaqc', 'purchaser', '/qaqc/dashboard'),
  ('qaqc', 'purchaser', '/qaqc/records'),
  ('qaqc', 'account',   '/qaqc/dashboard'),
  ('qaqc', 'account',   '/qaqc/records')
on conflict do nothing;

-- 2b. Bootstrap admin access: grant 'admin' role in 'qaqc' to all existing department admins
-- so the QAQC button immediately appears in their department switcher and Access Control.
insert into public.user_department_access (user_id, department, role)
select distinct user_id, 'qaqc', 'admin'
from public.user_department_access
where role = 'admin'
on conflict (user_id, department) do nothing;

-- 3. Running number counter and generator function
create table if not exists public.qaqc_counters (
  year int primary key,
  last_val int not null default 0
);

create or replace function public.qaqc_next_running_no(p_year int default null)
returns text language plpgsql security definer as $$
declare
  v_year int := coalesce(p_year, extract(year from current_date)::int);
  v_val int;
begin
  insert into public.qaqc_counters (year, last_val)
  values (v_year, 1)
  on conflict (year) do update
  set last_val = qaqc_counters.last_val + 1
  returning last_val into v_val;

  return 'QAQC-' || v_year::text || '-' || lpad(v_val::text, 4, '0');
end;
$$;
grant execute on function public.qaqc_next_running_no(int) to authenticated;

-- 4. Main QAQC Test Records table
create table if not exists public.qaqc_tests (
  id bigint generated always as identity primary key,
  running_no text not null unique,
  project text not null,
  supplier text not null,
  marking text,
  test_type text not null,
  date_cast date,
  date_test date not null,
  report_no text,
  email_date date,
  qaqc_remarks text,

  -- Purchaser fields
  po_no text,
  po_date date,
  po_amount numeric check (po_amount is null or po_amount >= 0),
  purchaser_remarks text,

  -- Account fields
  invoice_no text,
  invoice_date date,
  invoice_amount numeric check (invoice_amount is null or invoice_amount >= 0),
  payment_status text not null default 'Pending' check (payment_status in ('Pending', 'Paid', 'Partially Paid', 'Void')),
  payment_date date,
  account_remarks text,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qaqc_tests_date_test_idx on public.qaqc_tests(date_test);
create index if not exists qaqc_tests_project_idx on public.qaqc_tests(project);
create index if not exists qaqc_tests_test_type_idx on public.qaqc_tests(test_type);
create index if not exists qaqc_tests_supplier_idx on public.qaqc_tests(supplier);
create index if not exists qaqc_tests_payment_status_idx on public.qaqc_tests(payment_status);

-- 5. QAQC Test Types Directory (Dynamic, users can add more anytime)
create table if not exists public.qaqc_test_types (
  id bigint generated always as identity primary key,
  name text not null unique,
  category text default 'General',
  standard_cost numeric default 0,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  sort_order int default 0,
  created_at timestamptz not null default now()
);

insert into public.qaqc_test_types (name, category, sort_order) values
  ('Concrete Compression Cube Test (7 Days)', 'Concrete', 1),
  ('Concrete Compression Cube Test (28 Days)', 'Concrete', 2),
  ('Steel Rebar Tensile & Elongation Test', 'Steel', 3),
  ('Rebar Coupler Tensile Test', 'Steel', 4),
  ('Chemical Analysis Test', 'Material', 5),
  ('Ultrasonic Pulse Velocity (UPV) Test', 'Nondestructive', 6),
  ('Core Sampling & Compression Test', 'Concrete', 7)
on conflict (name) do nothing;

-- 6. Suppliers / Testing Laboratories Directory
create table if not exists public.qaqc_suppliers (
  id bigint generated always as identity primary key,
  name text not null unique,
  contact_person text,
  phone text,
  email text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now()
);

-- 7. Monthly Testing Targets / Budgets by Project
create table if not exists public.qaqc_targets (
  id bigint generated always as identity primary key,
  project text not null,
  month text not null, -- YYYY-MM
  test_count_target int default 0,
  spend_target numeric default 0,
  unique (project, month)
);

-- 8. Row Level Security (RLS)
alter table public.qaqc_counters enable row level security;
alter table public.qaqc_tests enable row level security;
alter table public.qaqc_test_types enable row level security;
alter table public.qaqc_suppliers enable row level security;
alter table public.qaqc_targets enable row level security;

create policy "qaqc_counters_all" on public.qaqc_counters for all using (has_dept_access('qaqc')) with check (has_dept_access('qaqc'));
create policy "qaqc_tests_all" on public.qaqc_tests for all using (has_dept_access('qaqc')) with check (has_dept_access('qaqc'));
create policy "qaqc_test_types_all" on public.qaqc_test_types for all using (has_dept_access('qaqc')) with check (has_dept_access('qaqc'));
create policy "qaqc_suppliers_all" on public.qaqc_suppliers for all using (has_dept_access('qaqc')) with check (has_dept_access('qaqc'));
create policy "qaqc_targets_all" on public.qaqc_targets for all using (has_dept_access('qaqc')) with check (has_dept_access('qaqc'));
