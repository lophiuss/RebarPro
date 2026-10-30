-- v65: Meetings — allow archiving KPIs as Achieved / Retired.
-- Preserves all historical values and notes, removes from active scorecard.

alter table public.mtg_kpis
  add column if not exists archived_at timestamptz;

create index if not exists mtg_kpis_archived_at_idx on public.mtg_kpis(meeting_id, archived_at);
