-- v55: Meetings — personal to-dos can sit in any board column (To do / In progress / Blocked / Done).
-- Additive only.

alter table public.mtg_personal_todos
  add column if not exists status text not null default 'todo'
  check (status in ('todo', 'in_progress', 'blocked', 'done'));

update public.mtg_personal_todos set status = 'done' where done_at is not null and status <> 'done';
