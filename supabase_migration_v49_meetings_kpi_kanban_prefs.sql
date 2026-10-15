-- v49: Meetings — KPI goal criteria, to-do board status, saved attendance,
-- per-user workspace layout.
--
-- Additive only. Nothing existing is dropped or rewritten; the old KPI columns
-- (target, unit) stay and are copied into the new goal columns once.
--
--   * mtg_kpis           goal_rule / goal_value / goal_value_max / unit_type / details
--                        (Bloom-style criteria: =, >, >=, <, <=, between)
--   * mtg_kpi_goals      per-period "custom goals" that override a KPI's goal
--   * mtg_kpi_meetings   a KPI can be attached to several meetings
--   * mtg_todos.status   todo | in_progress | blocked | done  (kanban board)
--   * mtg_runs.attendance  who was present in a live meeting
--   * mtg_user_prefs     each person's own settings (workspace layout, lock)

-- ------------------------------------------------------------ KPI criteria
alter table public.mtg_kpis
  add column if not exists unit_type text not null default 'number'
    check (unit_type in ('number','percent','dollars','euros','pesos','yen','pounds','inr','rand','aed','xcg','yesno')),
  add column if not exists goal_rule text not null default 'gte'
    check (goal_rule in ('eq','gt','gte','lt','lte','between')),
  add column if not exists goal_value numeric,
  add column if not exists goal_value_max numeric,
  add column if not exists details text;

-- One-time copy of the old single "target" into the new goal.
update public.mtg_kpis
set goal_value = target,
    unit_type = case when unit = '%' then 'percent' else 'number' end
where goal_value is null and target is not null;

create table public.mtg_kpi_goals (
  kpi_id uuid not null references public.mtg_kpis(id) on delete cascade,
  period_start date not null,
  goal_rule text not null check (goal_rule in ('eq','gt','gte','lt','lte','between')),
  goal_value numeric,
  goal_value_max numeric,
  primary key (kpi_id, period_start)
);

create table public.mtg_kpi_meetings (
  kpi_id uuid not null references public.mtg_kpis(id) on delete cascade,
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  primary key (kpi_id, meeting_id)
);
insert into public.mtg_kpi_meetings (kpi_id, meeting_id)
select id, meeting_id from public.mtg_kpis
on conflict do nothing;
create index mtg_kpi_meetings_meeting_idx on public.mtg_kpi_meetings(meeting_id);

alter table public.mtg_kpi_goals enable row level security;
alter table public.mtg_kpi_meetings enable row level security;
create policy "mtg_all_access" on public.mtg_kpi_goals for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_kpi_meetings for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));

-- ------------------------------------------------------------ To-do board
alter table public.mtg_todos
  add column if not exists status text not null default 'todo'
    check (status in ('todo','in_progress','blocked','done'));
-- Already-completed to-dos land in the Done column.
update public.mtg_todos set status = 'done' where done_at is not null and status <> 'done';

-- ------------------------------------------------------------ Attendance
-- { "<user id>": true | false } for people ticked present in the live run.
alter table public.mtg_runs add column if not exists attendance jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------ Personal prefs
create table public.mtg_user_prefs (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.mtg_user_prefs enable row level security;
-- Own rows only.
create policy "mtg_user_prefs_own" on public.mtg_user_prefs for all
  using (user_id = auth.uid() and has_dept_access('meetings'))
  with check (user_id = auth.uid() and has_dept_access('meetings'));
