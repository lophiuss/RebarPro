-- v46: Meetings — workspace + growth plan + summary email support.
--
-- Additive only:
--   * mtg_settings.core_values  — org-wide core values shown on the Workspace
--     and Growth Plan pages (edited by Meetings admins in Settings).
--   * mtg_private_notes         — each user's own notes. Unlike every other mtg_*
--     table this one is row-private: a user can only see/change their own rows.
--   * mtg_summaries.emailed_at  — set by the send-meeting-summary edge function.
--   * nav permissions for the two new pages (/meetings/workspace, /meetings/todos).

alter table public.mtg_settings
  add column if not exists core_values jsonb not null default '[]'::jsonb;

alter table public.mtg_summaries
  add column if not exists emailed_at timestamptz;

create table public.mtg_private_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mtg_private_notes enable row level security;

-- Own rows only, and only for people who still have Meetings access.
create policy "mtg_private_notes_own" on public.mtg_private_notes
  for all
  using (user_id = auth.uid() and has_dept_access('meetings'))
  with check (user_id = auth.uid() and has_dept_access('meetings'));

create index mtg_private_notes_user_idx on public.mtg_private_notes(user_id, updated_at desc);

insert into public.department_nav_permissions (department, role, nav_key) values
  ('meetings', 'manager', '/meetings/workspace'),
  ('meetings', 'manager', '/meetings/todos'),
  ('meetings', 'member',  '/meetings/workspace'),
  ('meetings', 'member',  '/meetings/todos')
on conflict do nothing;
