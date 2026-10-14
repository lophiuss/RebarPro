-- v45: Meetings department (7th department) — schema.
--
-- Weekly leadership meetings (L10-style): agenda, headlines, to-dos, issues
-- (O&O list), quarterly priorities, KPIs, live run with timer, wrap-up ratings,
-- concluded-meeting summaries.
-- Additive only: new mtg_* tables, plus widening the same three department
-- CHECK constraints (user_department_access, department_nav_permissions,
-- shoutouts) to accept 'meetings' — no existing row, column, or policy is touched.
--
-- Design notes:
--   * RLS follows the codebase-wide pattern: has_dept_access('meetings') for ALL
--     roles (role restriction is nav-hiding, not RLS; see v23's comment).
--   * Users are public.profiles (uuid). Attendees/owners/leaders reference it.
--   * A "run" is one live session of a meeting. Concluding a run snapshots the
--     meeting's state into mtg_summaries and archives completed to-dos/headlines.
--   * Live sync (current page, tangent alerts) uses Supabase Realtime broadcast
--     from the client; mtg_runs.current_page is the persisted source of truth for
--     anyone joining late.

alter table public.user_department_access drop constraint user_department_access_department_check;
alter table public.user_department_access add constraint user_department_access_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro','meetings']));

alter table public.department_nav_permissions drop constraint department_nav_permissions_department_check;
alter table public.department_nav_permissions add constraint department_nav_permissions_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro','meetings']));

alter table public.shoutouts drop constraint shoutouts_department_check;
alter table public.shoutouts add constraint shoutouts_department_check
  check (department = any (array['rebar','cement','security','maintenance','mould','plantpro','meetings']));

-- Default nav permissions. AppNavigation only shows a page to a non-admin role
-- when a department_nav_permissions row allows it (admins always see all) —
-- seeded here the first time so nobody lands on an empty sidebar (cf. v25).
insert into public.department_nav_permissions (department, role, nav_key) values
  ('meetings', 'manager', '/meetings'),
  ('meetings', 'member',  '/meetings')
on conflict do nothing;

-- Singleton settings: the default agenda copied into every new meeting.
create table public.mtg_settings (
  id int primary key default 1 check (id = 1),
  default_agenda jsonb not null default '[
    {"page_type":"CHECK_IN","title":"Check-in","minutes":5},
    {"page_type":"GOALS","title":"Quarterly Priorities","minutes":5},
    {"page_type":"METRICS","title":"KPIs","minutes":5},
    {"page_type":"HEADLINES","title":"Headlines","minutes":5},
    {"page_type":"TODOS","title":"To-dos","minutes":5},
    {"page_type":"ISSUES","title":"Issues","minutes":60},
    {"page_type":"WRAP_UP","title":"Wrap-up","minutes":5}
  ]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.mtg_settings (id) values (1);

create table public.mtg_meetings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  leader_id uuid references public.profiles(id) on delete set null,
  is_archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.mtg_attendees (
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_favourite boolean not null default false,
  primary key (meeting_id, user_id)
);

create table public.mtg_agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  page_type text not null check (page_type in ('CHECK_IN','GOALS','METRICS','HEADLINES','TODOS','ISSUES','WRAP_UP')),
  title text not null,
  minutes int not null default 5 check (minutes >= 0),
  position int not null default 0
);

-- One live session of a meeting. ended_at null = in progress.
create table public.mtg_runs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  leader_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  current_page text not null default 'CHECK_IN',
  page_seconds jsonb not null default '{}'::jsonb,
  notes text not null default '',
  ratings_revealed boolean not null default false
);
-- At most one in-progress run per meeting.
create unique index mtg_runs_one_active_idx on public.mtg_runs(meeting_id) where ended_at is null;

create table public.mtg_ratings (
  run_id uuid not null references public.mtg_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating int check (rating between 1 and 10),
  feedback text,
  primary key (run_id, user_id)
);

create table public.mtg_headlines (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mtg_todos (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  run_id uuid references public.mtg_runs(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  due_date date,
  done_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.mtg_issues (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  details text,
  status text not null default 'short_term' check (status in ('short_term','parking_lot','solved','sent')),
  solved_run_id uuid references public.mtg_runs(id) on delete set null,
  solved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Quarterly priorities.
create table public.mtg_goals (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  status text not null default 'on' check (status in ('on','off','done')),
  due_date date,
  milestones jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.mtg_kpis (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  cadence text not null default 'weekly' check (cadence in ('daily','weekly','monthly','quarterly')),
  target numeric,
  unit text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.mtg_kpi_values (
  kpi_id uuid not null references public.mtg_kpis(id) on delete cascade,
  period_start date not null,
  value numeric,
  primary key (kpi_id, period_start)
);

-- Snapshot written when a run is concluded.
create table public.mtg_summaries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.mtg_runs(id) on delete cascade,
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  average_rating numeric,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS: has_dept_access('meetings') everywhere, same accepted pattern as every
-- other department.
alter table public.mtg_settings enable row level security;
alter table public.mtg_meetings enable row level security;
alter table public.mtg_attendees enable row level security;
alter table public.mtg_agenda_items enable row level security;
alter table public.mtg_runs enable row level security;
alter table public.mtg_ratings enable row level security;
alter table public.mtg_headlines enable row level security;
alter table public.mtg_todos enable row level security;
alter table public.mtg_issues enable row level security;
alter table public.mtg_goals enable row level security;
alter table public.mtg_kpis enable row level security;
alter table public.mtg_kpi_values enable row level security;
alter table public.mtg_summaries enable row level security;

create policy "mtg_all_access" on public.mtg_settings for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_meetings for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_attendees for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_agenda_items for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_runs for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_ratings for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_headlines for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_todos for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_issues for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_goals for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_kpis for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_kpi_values for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_summaries for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));

create index mtg_attendees_user_idx on public.mtg_attendees(user_id);
create index mtg_agenda_meeting_idx on public.mtg_agenda_items(meeting_id, position);
create index mtg_runs_meeting_idx on public.mtg_runs(meeting_id, started_at desc);
create index mtg_headlines_meeting_idx on public.mtg_headlines(meeting_id);
create index mtg_todos_meeting_idx on public.mtg_todos(meeting_id);
create index mtg_todos_owner_idx on public.mtg_todos(owner_id);
create index mtg_issues_meeting_idx on public.mtg_issues(meeting_id, status);
create index mtg_goals_meeting_idx on public.mtg_goals(meeting_id);
create index mtg_kpis_meeting_idx on public.mtg_kpis(meeting_id, position);
create index mtg_summaries_meeting_idx on public.mtg_summaries(meeting_id, created_at desc);
