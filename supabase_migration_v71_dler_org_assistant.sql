-- v71: Support Assistant (side-branch) seats in DLER Org Chart
alter table public.dler_people
  add column if not exists is_assistant boolean not null default false;
