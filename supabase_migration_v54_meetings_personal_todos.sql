-- v54: Meetings — personal to-dos on My Workspace.
--
-- A to-do that belongs to one person and to no meeting. Row-private, like
-- mtg_private_notes: you can only see and change your own, and only while you
-- still have Meetings access. Additive only.

create table public.mtg_personal_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null,
  due_date date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.mtg_personal_todos enable row level security;

create policy "mtg_personal_todos_own" on public.mtg_personal_todos
  for all
  using (user_id = auth.uid() and has_dept_access('meetings'))
  with check (user_id = auth.uid() and has_dept_access('meetings'));

create index mtg_personal_todos_user_idx on public.mtg_personal_todos(user_id, created_at desc);
