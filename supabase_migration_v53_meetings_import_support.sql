-- v53: Meetings — support for importing existing data (e.g. from Bloom Growth).
--
-- Additive only.
--   * owner_name        who an item belongs to when that person has no login here
--   * external_id       the id in the system the row was imported from (keeps re-runs from duplicating)
--   * mtg_contacts      people from the import who have no login (name, optional email)
--   * mtg_seat_contacts / mtg_meeting_contacts   where those people sit / which meetings they attend

alter table public.mtg_todos     add column if not exists owner_name text, add column if not exists external_id text;
alter table public.mtg_issues    add column if not exists owner_name text, add column if not exists external_id text;
alter table public.mtg_headlines add column if not exists owner_name text, add column if not exists external_id text;
alter table public.mtg_goals     add column if not exists owner_name text, add column if not exists external_id text;
alter table public.mtg_kpis      add column if not exists owner_name text, add column if not exists external_id text;
alter table public.mtg_meetings  add column if not exists external_id text;
alter table public.mtg_seats     add column if not exists external_id text;
alter table public.mtg_runs      add column if not exists external_id text;

create unique index if not exists mtg_todos_external_uq     on public.mtg_todos(external_id)     where external_id is not null;
create unique index if not exists mtg_issues_external_uq    on public.mtg_issues(external_id)    where external_id is not null;
create unique index if not exists mtg_headlines_external_uq on public.mtg_headlines(external_id) where external_id is not null;
create unique index if not exists mtg_goals_external_uq     on public.mtg_goals(external_id)     where external_id is not null;
create unique index if not exists mtg_kpis_external_uq      on public.mtg_kpis(external_id)      where external_id is not null;
create unique index if not exists mtg_meetings_external_uq  on public.mtg_meetings(external_id)  where external_id is not null;
create unique index if not exists mtg_seats_external_uq     on public.mtg_seats(external_id)     where external_id is not null;
create unique index if not exists mtg_runs_external_uq      on public.mtg_runs(external_id)      where external_id is not null;

create table public.mtg_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  user_id uuid references auth.users(id) on delete set null,
  external_id text unique,
  created_at timestamptz not null default now()
);
create table public.mtg_seat_contacts (
  seat_id uuid not null references public.mtg_seats(id) on delete cascade,
  contact_id uuid not null references public.mtg_contacts(id) on delete cascade,
  primary key (seat_id, contact_id)
);
create table public.mtg_meeting_contacts (
  meeting_id uuid not null references public.mtg_meetings(id) on delete cascade,
  contact_id uuid not null references public.mtg_contacts(id) on delete cascade,
  primary key (meeting_id, contact_id)
);
alter table public.mtg_contacts enable row level security;
alter table public.mtg_seat_contacts enable row level security;
alter table public.mtg_meeting_contacts enable row level security;
create policy "mtg_all_access" on public.mtg_contacts for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_seat_contacts for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
create policy "mtg_all_access" on public.mtg_meeting_contacts for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
