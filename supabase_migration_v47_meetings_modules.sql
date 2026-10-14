-- v47: Meetings — remaining modules.
--
-- Additive only. Adds tables for:
--   * Growth Plan          (mtg_growth_plan, singleton jsonb document)
--   * Organizational Chart (mtg_seats, mtg_seat_people)
--   * Quarterly 1:1        (mtg_one_on_ones)       — private to manager + report
--   * Right Person Right Seat (mtg_rprs)           — private to assessor (+ admins)
--   * Session prep         (mtg_prep_docs, mtg_prep_sessions, mtg_prep_responses)
--   * Documents            (mtg_documents)
-- and small column additions:
--   * mtg_meetings.meeting_type   weekly | quarterly_alignment
--   * mtg_goals.completed_at      set when a priority is marked done (progress charts)
--
-- RLS follows the department-wide pattern (has_dept_access('meetings')); the two
-- sensitive tables (1:1s, RPRS) are additionally restricted to their participants
-- and Meetings admins.

alter table public.mtg_meetings
  add column if not exists meeting_type text not null default 'weekly'
  check (meeting_type in ('weekly','quarterly_alignment'));

alter table public.mtg_goals
  add column if not exists completed_at timestamptz;

-- ---------------------------------------------------------------- Growth Plan
-- One document for the whole organisation. Shape (all optional):
--   { what, how, why, five_year_vision,
--     marketing: { ideal_client, differentiators[], proven_process, guarantee },
--     three_year: { date, goals[], possibilities[] },
--     one_year:   { date, goals[], annual_goals[] },
--     ninety_day: { date, goals[] } }
create table public.mtg_growth_plan (
  id int primary key default 1 check (id = 1),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.mtg_growth_plan (id) values (1);

-- ---------------------------------------------------------------- Org chart
create table public.mtg_seats (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.mtg_seats(id) on delete cascade,
  title text not null,
  subtitle text,
  roles jsonb not null default '[]'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.mtg_seat_people (
  seat_id uuid not null references public.mtg_seats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (seat_id, user_id)
);

-- ---------------------------------------------------------------- Quarterly 1:1
create table public.mtg_one_on_ones (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid not null references public.profiles(id) on delete cascade,
  quarter text not null check (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manager_id, report_id, quarter)
);

-- ---------------------------------------------------------------- RPRS
-- core_values: { "<core value text>": "plus" | "plus_minus" | "minus" }
-- gwc:         { gets_it, wants_it, capacity: true | false | null }
create table public.mtg_rprs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.profiles(id) on delete cascade,
  assessor_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  assessed_on date not null default current_date,
  core_values jsonb not null default '{}'::jsonb,
  gwc jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Session prep
-- questions: [{ "id": "q1", "label": "...", "type": "text" | "rating" }]
create table public.mtg_prep_docs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  questions jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.mtg_prep_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  doc_id uuid not null references public.mtg_prep_docs(id) on delete restrict,
  due_date date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.mtg_prep_responses (
  session_id uuid not null references public.mtg_prep_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  primary key (session_id, user_id)
);

insert into public.mtg_prep_docs (name, questions) values
  ('Weekly check-in prep', '[
    {"id":"good_news","label":"Good news from the last 7 days (one personal, one business)","type":"text"},
    {"id":"priorities","label":"What are your top priorities this week?","type":"text"},
    {"id":"issues","label":"What issues do you want to discuss?","type":"text"},
    {"id":"rating","label":"How is your week going? (1-10)","type":"rating"}
  ]'::jsonb),
  ('Quarterly alignment prep', '[
    {"id":"wins","label":"What were your biggest wins last quarter?","type":"text"},
    {"id":"misses","label":"What did not go as planned, and why?","type":"text"},
    {"id":"next","label":"What are your priorities for the next 90 days?","type":"text"},
    {"id":"support","label":"What support do you need?","type":"text"},
    {"id":"rating","label":"How aligned do you feel with the company direction? (1-10)","type":"rating"}
  ]'::jsonb);

-- ---------------------------------------------------------------- Documents
create table public.mtg_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  url text,
  category text,
  meeting_id uuid references public.mtg_meetings(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.mtg_growth_plan enable row level security;
alter table public.mtg_seats enable row level security;
alter table public.mtg_seat_people enable row level security;
alter table public.mtg_one_on_ones enable row level security;
alter table public.mtg_rprs enable row level security;
alter table public.mtg_prep_docs enable row level security;
alter table public.mtg_prep_sessions enable row level security;
alter table public.mtg_prep_responses enable row level security;
alter table public.mtg_documents enable row level security;

create policy "mtg_all_access" on public.mtg_growth_plan for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_seats for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_seat_people for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_prep_docs for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_prep_sessions for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_prep_responses for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_documents for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));

-- 1:1s: only the two people involved, plus Meetings admins. Both participants
-- may write (each fills in their own side; the server action enforces which).
create policy "mtg_one_on_ones_participants" on public.mtg_one_on_ones for all
  using (has_dept_access('meetings') and (manager_id = auth.uid() or report_id = auth.uid() or is_dept_admin('meetings')))
  with check (has_dept_access('meetings') and (manager_id = auth.uid() or report_id = auth.uid() or is_dept_admin('meetings')));

-- RPRS: only whoever assessed, plus Meetings admins.
create policy "mtg_rprs_assessor" on public.mtg_rprs for all
  using (has_dept_access('meetings') and (assessor_id = auth.uid() or is_dept_admin('meetings')))
  with check (has_dept_access('meetings') and (assessor_id = auth.uid() or is_dept_admin('meetings')));

-- ---------------------------------------------------------------- Indexes
create index mtg_seats_parent_idx on public.mtg_seats(parent_id, position);
create index mtg_seat_people_user_idx on public.mtg_seat_people(user_id);
create index mtg_one_on_ones_report_idx on public.mtg_one_on_ones(report_id);
create index mtg_rprs_person_idx on public.mtg_rprs(person_id, assessed_on desc);
create index mtg_prep_sessions_meeting_idx on public.mtg_prep_sessions(meeting_id);
create index mtg_documents_meeting_idx on public.mtg_documents(meeting_id);

-- ---------------------------------------------------------------- Nav permissions
-- Everyone in Meetings gets the shared pages; the leadership tools (RPRS,
-- Quarterly 1:1) are manager-only by default. Admins always see everything.
insert into public.department_nav_permissions (department, role, nav_key) values
  ('meetings', 'manager', '/meetings/growth-plan'),
  ('meetings', 'manager', '/meetings/org-chart'),
  ('meetings', 'manager', '/meetings/direct-reports'),
  ('meetings', 'manager', '/meetings/one-on-one'),
  ('meetings', 'manager', '/meetings/rprs'),
  ('meetings', 'manager', '/meetings/session-prep'),
  ('meetings', 'manager', '/meetings/documents'),
  ('meetings', 'manager', '/meetings/resources'),
  ('meetings', 'member',  '/meetings/growth-plan'),
  ('meetings', 'member',  '/meetings/org-chart'),
  ('meetings', 'member',  '/meetings/one-on-one'),
  ('meetings', 'member',  '/meetings/session-prep'),
  ('meetings', 'member',  '/meetings/documents'),
  ('meetings', 'member',  '/meetings/resources')
on conflict do nothing;
