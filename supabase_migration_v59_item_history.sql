-- v59: Meetings — edit history for headlines, to-dos, issues, priorities and KPIs.
-- One row per saved edit (title + details text, who, when). Append-only: people can add rows and read
-- the ones they may see, nobody can change or delete them. Visibility follows v58 (the meeting, or the KPI).

create table if not exists public.mtg_item_history (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('headline', 'todo', 'issue', 'goal', 'kpi')),
  item_id uuid not null,
  meeting_id uuid references public.mtg_meetings(id) on delete cascade,
  title text,
  details text,
  editor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mtg_item_history_item_idx on public.mtg_item_history (item_id, created_at desc);

alter table public.mtg_item_history enable row level security;

drop policy if exists "mtg_history_read" on public.mtg_item_history;
create policy "mtg_history_read" on public.mtg_item_history for select
  using (
    (kind = 'kpi' and public.mtg_can_see_kpi(item_id))
    or (kind <> 'kpi' and meeting_id is not null and public.mtg_can_see_meeting(meeting_id))
  );

drop policy if exists "mtg_history_add" on public.mtg_item_history;
create policy "mtg_history_add" on public.mtg_item_history for insert
  with check (
    (editor_id is null or editor_id = auth.uid())
    and (
      (kind = 'kpi' and public.mtg_can_see_kpi(item_id))
      or (kind <> 'kpi' and meeting_id is not null and public.mtg_can_see_meeting(meeting_id))
    )
  );
