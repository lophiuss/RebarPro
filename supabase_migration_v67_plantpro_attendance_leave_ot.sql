-- v67: Workforce Attendance, BLE & GPS Geofence Clocking, Leave Application,
-- KomotApp-grade OT Planning, Cap Control, 2-Tier Approvals, Manhour & Wage Analytics,
-- Worker Movement / Transfers, and Notifications.

-- 1. Extensions to plantpro_workers
alter table public.plantpro_workers
  add column if not exists linked_user_id uuid unique references public.profiles(id) on delete set null,
  add column if not exists clock_pin_hash text,
  add column if not exists default_project_id bigint references public.plantpro_projects(id) on delete set null,
  add column if not exists shift_profile_id bigint;

-- 2. Extensions to plantpro_worker_movements
alter table public.plantpro_worker_movements
  add column if not exists reason text,
  add column if not exists transfer_type text default 'permanent' check (transfer_type in ('permanent','temporary')),
  add column if not exists end_date date,
  add column if not exists initiated_by uuid references public.profiles(id) on delete set null;

-- 3. Helper Functions
create or replace function public.plantpro_is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_department_access uda
    where uda.user_id = auth.uid()
      and uda.department = 'plantpro'
      and uda.role in ('admin', 'manager', 'hr', 'supervisor')
  );
$$;
grant execute on function public.plantpro_is_staff() to authenticated;

create or replace function public.plantpro_my_worker_id()
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.plantpro_workers
  where linked_user_id = auth.uid()
  limit 1;
$$;
grant execute on function public.plantpro_my_worker_id() to authenticated;

-- 4. Shift Profiles
create table if not exists public.plantpro_shift_profiles (
  id bigint generated always as identity primary key,
  name text not null unique,
  start_time time not null default '08:00',
  end_time time not null default '17:00',
  break_minutes int not null default 60,
  standard_hours numeric not null default 8,
  late_grace_minutes int not null default 10,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- 5. Clock Sites & BLE Beacons
create table if not exists public.plantpro_clock_sites (
  id bigint generated always as identity primary key,
  name text not null unique,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters int not null default 100,
  default_project_id bigint references public.plantpro_projects(id) on delete set null,
  kiosk_secret text not null default encode(gen_random_bytes(16), 'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.plantpro_ble_beacons (
  id bigint generated always as identity primary key,
  site_id bigint not null references public.plantpro_clock_sites(id) on delete cascade,
  label text not null,
  service_uuid text not null,
  device_name_prefix text,
  minor_major_hint text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6. Attendance Sessions & Project Splits
create table if not exists public.plantpro_attendance_sessions (
  id bigint generated always as identity primary key,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  work_date date not null,
  shift_profile_id bigint references public.plantpro_shift_profiles(id) on delete set null,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  entry_mode text not null default 'self_phone' check (entry_mode in ('self_phone','kiosk','supervisor_assisted')),
  in_method text not null check (in_method in ('ble_beacon','gps_geofence','kiosk_qr','outstation','manual_adjustment')),
  out_method text check (out_method in ('ble_beacon','gps_geofence','kiosk_qr','outstation','manual_adjustment')),
  site_id bigint references public.plantpro_clock_sites(id) on delete set null,
  beacon_id bigint references public.plantpro_ble_beacons(id) on delete set null,
  in_lat double precision,
  in_lng double precision,
  in_accuracy_m numeric,
  in_distance_m numeric,
  out_lat double precision,
  out_lng double precision,
  is_outstation boolean not null default false,
  outstation_location text,
  outstation_reason text,
  outstation_status text not null default 'not_applicable' check (outstation_status in ('not_applicable','pending','approved','rejected')),
  outstation_reviewed_by uuid references public.profiles(id) on delete set null,
  in_photo_drive_id text,
  out_photo_drive_id text,
  break_minutes int not null default 60,
  worked_minutes int not null default 0,
  basic_hours_credited numeric not null default 0,
  exception_flags text[] not null default '{}',
  recorded_by uuid references public.profiles(id) on delete set null,
  adjusted_by uuid references public.profiles(id) on delete set null,
  adjustment_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.plantpro_attendance_project_splits (
  id bigint generated always as identity primary key,
  attendance_id bigint not null references public.plantpro_attendance_sessions(id) on delete cascade,
  project_id bigint not null references public.plantpro_projects(id) on delete restrict,
  minutes int not null default 0,
  percentage numeric not null default 100,
  task_note text
);

-- 7. OT Policy & Task Types
create table if not exists public.plantpro_ot_policies (
  id int primary key default 1 check (id = 1),
  monthly_cap_hours numeric not null default 104,
  warning_hours numeric not null default 94,
  critical_hours numeric not null default 100,
  daily_ot_cap_hours numeric not null default 4,
  allowed_start_time time not null default '17:00',
  eligibility_threshold_minutes int not null default 60,
  eligibility_method text not null default 'minimum_only' check (eligibility_method in ('minimum_only','deduct_threshold')),
  allow_overnight boolean not null default true,
  allow_unplanned_ot boolean not null default false,
  rounding_step_minutes int not null default 15,
  updated_at timestamptz not null default now()
);

create table if not exists public.plantpro_ot_task_types (
  id bigint generated always as identity primary key,
  name text not null unique,
  category text not null default 'General' check (category in ('General','Production','Delivery','Maintenance','Urgent')),
  requires_start_photo boolean not null default false,
  requires_finish_photo boolean not null default false,
  allow_camera_exception boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 8. OT Plans & OT Sessions
create table if not exists public.plantpro_ot_plans (
  id bigint generated always as identity primary key,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  supervisor_id bigint references public.plantpro_supervisors(id) on delete set null,
  project_id bigint references public.plantpro_projects(id) on delete set null,
  task_type_id bigint not null references public.plantpro_ot_task_types(id) on delete restrict,
  work_date date not null,
  planned_start_time time,
  planned_end_time time,
  planned_minutes int not null default 120,
  instructions text,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled')),
  cap_override_reason text,
  allocated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (worker_id, work_date, task_type_id)
);

create table if not exists public.plantpro_ot_sessions (
  id bigint generated always as identity primary key,
  plan_id bigint references public.plantpro_ot_plans(id) on delete set null,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  supervisor_id bigint references public.plantpro_supervisors(id) on delete set null,
  project_id bigint references public.plantpro_projects(id) on delete set null,
  task_type_id bigint not null references public.plantpro_ot_task_types(id) on delete restrict,
  work_date date not null,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  entry_mode text not null default 'self_phone' check (entry_mode in ('self_phone','kiosk','supervisor_assisted')),
  in_method text not null check (in_method in ('ble_beacon','gps_geofence','kiosk_qr','outstation','manual_adjustment')),
  out_method text check (out_method in ('ble_beacon','gps_geofence','kiosk_qr','outstation','manual_adjustment')),
  in_lat double precision,
  in_lng double precision,
  in_accuracy_m numeric,
  out_lat double precision,
  out_lng double precision,
  is_outstation boolean not null default false,
  outstation_location text,
  raw_minutes int not null default 0,
  eligible_minutes int not null default 0,
  confirmed_minutes int,
  approved_minutes int,
  completion_notes text,
  camera_exception_reason text,
  exception_flags text[] not null default '{}',
  status text not null default 'active' check (status in ('active','pending_supervisor','pending_manager','returned','approved','rejected')),
  submission_count int not null default 1,
  worker_clarification_note text,
  supervisor_reviewed_by uuid references public.profiles(id) on delete set null,
  supervisor_reviewed_at timestamptz,
  supervisor_remarks text,
  manager_reviewed_by uuid references public.profiles(id) on delete set null,
  manager_reviewed_at timestamptz,
  manager_remarks text,
  created_at timestamptz not null default now()
);

create table if not exists public.plantpro_ot_evidence (
  id bigint generated always as identity primary key,
  ot_session_id bigint not null references public.plantpro_ot_sessions(id) on delete cascade,
  stage text not null check (stage in ('start','finish','supporting')),
  photo_drive_id text not null,
  captured_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  uploaded_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.plantpro_ot_cap_acknowledgements (
  id bigint generated always as identity primary key,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  month text not null,
  tier text not null check (tier in ('warning_94','critical_100','cap_104')),
  total_hours_at_trigger numeric not null,
  corrective_action text not null,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz not null default now()
);

-- 9. Leave Management
create table if not exists public.plantpro_leave_types (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null unique,
  is_paid boolean not null default true,
  default_days_per_year numeric not null default 0,
  requires_attachment boolean not null default false,
  color text not null default '#3b82f6',
  sort_order int not null default 0
);

create table if not exists public.plantpro_leave_balances (
  id bigint generated always as identity primary key,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  leave_type_id bigint not null references public.plantpro_leave_types(id) on delete restrict,
  year int not null,
  entitled_days numeric not null default 0,
  carried_forward_days numeric not null default 0,
  adjustment_days numeric not null default 0,
  unique (worker_id, leave_type_id, year)
);

create table if not exists public.plantpro_leave_requests (
  id bigint generated always as identity primary key,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  supervisor_id bigint references public.plantpro_supervisors(id) on delete set null,
  leave_type_id bigint not null references public.plantpro_leave_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  duration_mode text not null default 'full_day' check (duration_mode in ('full_day','half_am','half_pm')),
  days_count numeric not null default 1,
  reason text not null,
  attachment_drive_id text,
  attachment_name text,
  status text not null default 'pending_supervisor' check (status in ('pending_supervisor','pending_hr_manager','approved','rejected','cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  supervisor_by uuid references public.profiles(id) on delete set null,
  supervisor_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

-- 10. Notifications & Immutable Audit Log
create table if not exists public.plantpro_notifications (
  id bigint generated always as identity primary key,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  worker_id bigint references public.plantpro_workers(id) on delete set null,
  category text not null check (category in ('leave','ot_plan','ot_review','ot_cap','outstation','attendance','transfer')),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null,
  body text not null,
  action_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.plantpro_audit_logs (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id bigint not null,
  action text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

-- 11. Initial Data Seeds
insert into public.plantpro_shift_profiles (name, start_time, end_time, break_minutes, standard_hours, late_grace_minutes, is_default)
values ('Standard Factory Shift', '08:00', '17:00', 60, 8, 10, true)
on conflict (name) do nothing;

insert into public.plantpro_clock_sites (name, latitude, longitude, radius_meters, is_active)
values ('Main Plant & Yard', 1.4927, 103.7414, 150, true)
on conflict (name) do nothing;

insert into public.plantpro_ot_policies (id)
values (1)
on conflict (id) do nothing;

insert into public.plantpro_ot_task_types (name, category, requires_start_photo, requires_finish_photo, allow_camera_exception) values
  ('Fabrication & Welding', 'Production', false, false, true),
  ('Rebar Bending & Cutting', 'Production', false, false, true),
  ('Mould Assembly / Precast', 'Production', false, false, true),
  ('Site Delivery & Offloading', 'Delivery', false, false, true),
  ('Equipment Maintenance & Repair', 'Maintenance', false, false, true),
  ('Urgent Batch Dispatch', 'Urgent', false, false, true),
  ('General Workshop Clean-up', 'General', false, false, true)
on conflict (name) do nothing;

insert into public.plantpro_leave_types (code, name, is_paid, default_days_per_year, requires_attachment, color, sort_order) values
  ('AL', 'Annual Leave', true, 14, false, '#3b82f6', 1),
  ('MC', 'Medical Leave (MC)', true, 14, true, '#ef4444', 2),
  ('EL', 'Emergency Leave', true, 3, false, '#f97316', 3),
  ('HL', 'Hospitalisation Leave', true, 60, true, '#a855f7', 4),
  ('CL', 'Compassionate Leave', true, 3, false, '#64748b', 5),
  ('ML', 'Maternity Leave', true, 98, true, '#ec4899', 6),
  ('PL', 'Paternity Leave', true, 7, true, '#06b6d4', 7),
  ('UL', 'Unpaid Leave', false, 0, false, '#6b7280', 8)
on conflict (code) do nothing;

-- 12. Enable Row Level Security (RLS)
alter table public.plantpro_shift_profiles enable row level security;
alter table public.plantpro_clock_sites enable row level security;
alter table public.plantpro_ble_beacons enable row level security;
alter table public.plantpro_attendance_sessions enable row level security;
alter table public.plantpro_attendance_project_splits enable row level security;
alter table public.plantpro_ot_policies enable row level security;
alter table public.plantpro_ot_task_types enable row level security;
alter table public.plantpro_ot_plans enable row level security;
alter table public.plantpro_ot_sessions enable row level security;
alter table public.plantpro_ot_evidence enable row level security;
alter table public.plantpro_ot_cap_acknowledgements enable row level security;
alter table public.plantpro_leave_types enable row level security;
alter table public.plantpro_leave_balances enable row level security;
alter table public.plantpro_leave_requests enable row level security;
alter table public.plantpro_notifications enable row level security;
alter table public.plantpro_audit_logs enable row level security;

-- 13. RLS Policies
-- Read-only references: accessible to anyone with plantpro access (staff + workers)
create policy "plantpro_read_shift_profiles" on public.plantpro_shift_profiles for select using (has_dept_access('plantpro'));
create policy "plantpro_staff_manage_shift_profiles" on public.plantpro_shift_profiles for all using (plantpro_is_staff()) with check (plantpro_is_staff());

create policy "plantpro_read_clock_sites" on public.plantpro_clock_sites for select using (has_dept_access('plantpro'));
create policy "plantpro_staff_manage_clock_sites" on public.plantpro_clock_sites for all using (plantpro_is_staff()) with check (plantpro_is_staff());

create policy "plantpro_read_ble_beacons" on public.plantpro_ble_beacons for select using (has_dept_access('plantpro'));
create policy "plantpro_staff_manage_ble_beacons" on public.plantpro_ble_beacons for all using (plantpro_is_staff()) with check (plantpro_is_staff());

create policy "plantpro_read_ot_policies" on public.plantpro_ot_policies for select using (has_dept_access('plantpro'));
create policy "plantpro_staff_manage_ot_policies" on public.plantpro_ot_policies for all using (plantpro_is_staff()) with check (plantpro_is_staff());

create policy "plantpro_read_ot_task_types" on public.plantpro_ot_task_types for select using (has_dept_access('plantpro'));
create policy "plantpro_staff_manage_ot_task_types" on public.plantpro_ot_task_types for all using (plantpro_is_staff()) with check (plantpro_is_staff());

create policy "plantpro_read_leave_types" on public.plantpro_leave_types for select using (has_dept_access('plantpro'));
create policy "plantpro_staff_manage_leave_types" on public.plantpro_leave_types for all using (plantpro_is_staff()) with check (plantpro_is_staff());

-- Attendance Sessions: staff can access all, workers can access own
create policy "plantpro_attendance_select" on public.plantpro_attendance_sessions
  for select using (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_attendance_insert" on public.plantpro_attendance_sessions
  for insert with check (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_attendance_update" on public.plantpro_attendance_sessions
  for update using (plantpro_is_staff() or (worker_id = plantpro_my_worker_id() and clock_out_at is null))
  with check (plantpro_is_staff() or (worker_id = plantpro_my_worker_id()));

create policy "plantpro_attendance_splits_all" on public.plantpro_attendance_project_splits
  for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));

-- OT Plans
create policy "plantpro_ot_plans_select" on public.plantpro_ot_plans
  for select using (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_ot_plans_staff_manage" on public.plantpro_ot_plans
  for all using (plantpro_is_staff()) with check (plantpro_is_staff());

-- OT Sessions & Evidence
create policy "plantpro_ot_sessions_select" on public.plantpro_ot_sessions
  for select using (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_ot_sessions_insert" on public.plantpro_ot_sessions
  for insert with check (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_ot_sessions_update" on public.plantpro_ot_sessions
  for update using (plantpro_is_staff() or worker_id = plantpro_my_worker_id())
  with check (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_ot_evidence_select" on public.plantpro_ot_evidence
  for select using (
    plantpro_is_staff() or exists (
      select 1 from public.plantpro_ot_sessions s
      where s.id = ot_session_id and s.worker_id = plantpro_my_worker_id()
    )
  );

create policy "plantpro_ot_evidence_insert" on public.plantpro_ot_evidence
  for insert with check (
    plantpro_is_staff() or exists (
      select 1 from public.plantpro_ot_sessions s
      where s.id = ot_session_id and s.worker_id = plantpro_my_worker_id()
    )
  );

create policy "plantpro_cap_ack_select" on public.plantpro_ot_cap_acknowledgements
  for select using (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_cap_ack_manage" on public.plantpro_ot_cap_acknowledgements
  for all using (plantpro_is_staff()) with check (plantpro_is_staff());

-- Leave Balances & Requests
create policy "plantpro_leave_balances_select" on public.plantpro_leave_balances
  for select using (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_leave_balances_staff_manage" on public.plantpro_leave_balances
  for all using (plantpro_is_staff()) with check (plantpro_is_staff());

create policy "plantpro_leave_requests_select" on public.plantpro_leave_requests
  for select using (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_leave_requests_insert" on public.plantpro_leave_requests
  for insert with check (plantpro_is_staff() or worker_id = plantpro_my_worker_id());

create policy "plantpro_leave_requests_update" on public.plantpro_leave_requests
  for update using (plantpro_is_staff() or (worker_id = plantpro_my_worker_id() and status = 'pending_supervisor'))
  with check (plantpro_is_staff() or (worker_id = plantpro_my_worker_id()));

-- Notifications: user sees strictly their own
create policy "plantpro_notifications_self" on public.plantpro_notifications
  for all using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

-- Audit Logs: staff can view, any plantpro member can insert (append-only)
create policy "plantpro_audit_select" on public.plantpro_audit_logs
  for select using (plantpro_is_staff());

create policy "plantpro_audit_insert" on public.plantpro_audit_logs
  for insert with check (has_dept_access('plantpro'));

-- 14. Indexes
create index if not exists plantpro_attendance_worker_date_idx on public.plantpro_attendance_sessions(worker_id, work_date);
create index if not exists plantpro_attendance_site_idx on public.plantpro_attendance_sessions(site_id);
create index if not exists plantpro_ot_plans_worker_date_idx on public.plantpro_ot_plans(worker_id, work_date);
create index if not exists plantpro_ot_sessions_worker_date_idx on public.plantpro_ot_sessions(worker_id, work_date);
create index if not exists plantpro_ot_sessions_status_idx on public.plantpro_ot_sessions(status);
create index if not exists plantpro_leave_req_worker_date_idx on public.plantpro_leave_requests(worker_id, start_date, end_date);
create index if not exists plantpro_notifications_user_unread_idx on public.plantpro_notifications(recipient_user_id, is_read);
create index if not exists plantpro_audit_entity_idx on public.plantpro_audit_logs(entity_type, entity_id);

-- 15. Nav Permissions Seed
insert into public.department_nav_permissions (department, role, nav_key) values
  ('plantpro', 'admin', '/plantpro/clock'),
  ('plantpro', 'admin', '/plantpro/ot-live'),
  ('plantpro', 'admin', '/plantpro/leave'),
  ('plantpro', 'admin', '/plantpro/workforce-analytics'),
  ('plantpro', 'admin', '/plantpro/transfers'),
  ('plantpro', 'manager', '/plantpro/clock'),
  ('plantpro', 'manager', '/plantpro/ot-live'),
  ('plantpro', 'manager', '/plantpro/leave'),
  ('plantpro', 'manager', '/plantpro/workforce-analytics'),
  ('plantpro', 'manager', '/plantpro/transfers'),
  ('plantpro', 'hr', '/plantpro/clock'),
  ('plantpro', 'hr', '/plantpro/ot-live'),
  ('plantpro', 'hr', '/plantpro/leave'),
  ('plantpro', 'hr', '/plantpro/workforce-analytics'),
  ('plantpro', 'hr', '/plantpro/transfers'),
  ('plantpro', 'supervisor', '/plantpro/clock'),
  ('plantpro', 'supervisor', '/plantpro/ot-live'),
  ('plantpro', 'supervisor', '/plantpro/leave'),
  ('plantpro', 'supervisor', '/plantpro/workforce-analytics'),
  ('plantpro', 'worker', '/plantpro/clock'),
  ('plantpro', 'worker', '/plantpro/ot-live'),
  ('plantpro', 'worker', '/plantpro/leave')
on conflict do nothing;
