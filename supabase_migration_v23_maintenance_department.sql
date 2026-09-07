-- v23: Maintenance department (4th department) — schema.
--
-- See PRD.md at the project root for full context, data-model rationale,
-- and the confirmed KPI formulas. Additive only: new maintenance_* tables,
-- plus widening three existing department CHECK constraints
-- (user_department_access, department_nav_permissions, shoutouts) to
-- accept 'maintenance' — no existing rebar/cement/security row, column, or
-- policy is touched. Confirmed via get_advisors after applying: no new
-- security gaps introduced.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v22 convention.

alter table public.user_department_access drop constraint user_department_access_department_check;
alter table public.user_department_access add constraint user_department_access_department_check
  check (department = any (array['rebar','cement','security','maintenance']));

alter table public.department_nav_permissions drop constraint department_nav_permissions_department_check;
alter table public.department_nav_permissions add constraint department_nav_permissions_department_check
  check (department = any (array['rebar','cement','security','maintenance']));

alter table public.shoutouts drop constraint shoutouts_department_check;
alter table public.shoutouts add constraint shoutouts_department_check
  check (department = any (array['rebar','cement','security','maintenance']));

-- Singleton settings row (mirrors global_settings / cement_alert_settings).
create table public.maintenance_settings (
  id int primary key default 1 check (id = 1),
  default_target_repair_hours numeric not null default 4,
  updated_at timestamptz not null default now()
);
insert into public.maintenance_settings (id) values (1);

create table public.maintenance_checklist_templates (
  id bigint generated always as identity primary key,
  name text not null,
  scope text not null check (scope in ('single_equipment','section_list')),
  frequency text,
  form_code text,
  created_at timestamptz not null default now()
);

create table public.maintenance_checklist_items (
  id bigint generated always as identity primary key,
  template_id bigint not null references public.maintenance_checklist_templates(id) on delete cascade,
  section_label text,
  item_no int,
  description text not null
);

create table public.maintenance_equipment (
  id bigint generated always as identity primary key,
  equip_code text,
  name text not null,
  category text,
  brand text,
  purpose text,
  location text,
  condition text check (condition in ('good','fair','poor','spoil')),
  manager text,
  supervisor text,
  pic_day text,
  pic_night text,
  manual_drive_id text,
  pm_checklist_template_id bigint references public.maintenance_checklist_templates(id),
  target_repair_hours numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.maintenance_inspections (
  id bigint generated always as identity primary key,
  equipment_id bigint references public.maintenance_equipment(id) on delete set null,
  inspected_by text,
  inspection_date date,
  condition text,
  remarks text,
  preventive_action_recommendation text,
  created_at timestamptz not null default now()
);

create table public.maintenance_job_reports (
  id bigint generated always as identity primary key,
  equipment_id bigint references public.maintenance_equipment(id) on delete set null,
  category text,
  report_date date not null default current_date,
  reported_by text,
  issue_description text,
  downtime_hours numeric default 0,
  repair_time_hours numeric,
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  photo_drive_id text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.maintenance_critical_issues (
  id bigint generated always as identity primary key,
  equipment_id bigint references public.maintenance_equipment(id) on delete set null,
  equipment_label text,
  issue text not null,
  lead_time_note text,
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.maintenance_pm_schedule (
  id bigint generated always as identity primary key,
  equipment_id bigint not null references public.maintenance_equipment(id) on delete cascade,
  year int not null,
  week_number int not null check (week_number between 1 and 53),
  planned boolean not null default true,
  completed_at timestamptz,
  unique (equipment_id, year, week_number)
);

create table public.maintenance_checklist_submissions (
  id bigint generated always as identity primary key,
  template_id bigint not null references public.maintenance_checklist_templates(id),
  equipment_id bigint references public.maintenance_equipment(id) on delete set null,
  submission_date date not null default current_date,
  done_by text,
  verified_by text,
  created_at timestamptz not null default now()
);

create table public.maintenance_checklist_submission_items (
  id bigint generated always as identity primary key,
  submission_id bigint not null references public.maintenance_checklist_submissions(id) on delete cascade,
  checklist_item_id bigint references public.maintenance_checklist_items(id),
  result text check (result in ('ok','fault')),
  qty numeric,
  remark text,
  photo_drive_id text
);

create table public.maintenance_spare_parts_requests (
  id bigint generated always as identity primary key,
  part_name text not null,
  equipment_id bigint references public.maintenance_equipment(id) on delete set null,
  quantity_requested numeric,
  quantity_received numeric default 0,
  request_date date,
  received_date date,
  created_at timestamptz not null default now()
);

create table public.maintenance_work_requests (
  id bigint generated always as identity primary key,
  requester_name text not null,
  requester_contact text,
  location text,
  equipment_id bigint references public.maintenance_equipment(id) on delete set null,
  issue_description text not null,
  photo_drive_id text,
  status text not null default 'pending' check (status in ('pending','assigned','completed','cancelled')),
  assigned_to text,
  assigned_at timestamptz,
  completed_at timestamptz,
  resolution_photo_drive_id text,
  created_at timestamptz not null default now()
);

-- RLS: has_dept_access('maintenance') everywhere, same accepted pattern as
-- every other department (role restriction is nav-hiding, not RLS). Public
-- work-request submission goes through a service-role Server Action (like
-- visitor-checkin), so no anon/public insert policy is needed here.
alter table public.maintenance_settings enable row level security;
alter table public.maintenance_checklist_templates enable row level security;
alter table public.maintenance_checklist_items enable row level security;
alter table public.maintenance_equipment enable row level security;
alter table public.maintenance_inspections enable row level security;
alter table public.maintenance_job_reports enable row level security;
alter table public.maintenance_critical_issues enable row level security;
alter table public.maintenance_pm_schedule enable row level security;
alter table public.maintenance_checklist_submissions enable row level security;
alter table public.maintenance_checklist_submission_items enable row level security;
alter table public.maintenance_spare_parts_requests enable row level security;
alter table public.maintenance_work_requests enable row level security;

create policy "maintenance_all_access" on public.maintenance_settings for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_checklist_templates for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_checklist_items for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_equipment for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_inspections for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_job_reports for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_critical_issues for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_pm_schedule for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_checklist_submissions for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_checklist_submission_items for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_spare_parts_requests for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create policy "maintenance_all_access" on public.maintenance_work_requests for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));

create index maintenance_job_reports_equipment_idx on public.maintenance_job_reports(equipment_id);
create index maintenance_inspections_equipment_idx on public.maintenance_inspections(equipment_id);
create index maintenance_pm_schedule_equipment_idx on public.maintenance_pm_schedule(equipment_id);
create index maintenance_work_requests_status_idx on public.maintenance_work_requests(status);
create index maintenance_checklist_submissions_date_idx on public.maintenance_checklist_submissions(submission_date);
