-- v20: shoutouts table — a simple team-recognition feed per department.
--
-- A manager/admin can leave a one-line thank-you visible to everyone in
-- their department (see src/components/ShoutoutBoard.tsx). Posting is gated
-- in the UI by role (same nav-hiding pattern used everywhere else in this
-- app — not RLS-enforced), while RLS itself only requires department
-- access, same as most other write paths here. Names are free text
-- (to_name/from_name), matching the existing convention (security_entries.
-- created_by, security_post_logs.guard_name, etc.) rather than an FK to a
-- specific user row.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v19 convention.

create table public.shoutouts (
  id bigint generated always as identity primary key,
  department text not null check (department in ('rebar','cement','security')),
  to_name text not null,
  message text not null,
  from_name text not null,
  from_user uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.shoutouts enable row level security;

create policy "shoutouts_select" on public.shoutouts
  for select using (has_dept_access(department));

create policy "shoutouts_insert" on public.shoutouts
  for insert with check (has_dept_access(department));

create index shoutouts_department_created_at_idx on public.shoutouts (department, created_at desc);
