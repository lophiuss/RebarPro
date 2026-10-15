-- v48: Meetings — free-text details on to-dos, headlines and priorities.
-- (mtg_issues.details already exists from v45.) Additive only.

alter table public.mtg_todos add column if not exists details text;
alter table public.mtg_headlines add column if not exists details text;
alter table public.mtg_goals add column if not exists details text;
