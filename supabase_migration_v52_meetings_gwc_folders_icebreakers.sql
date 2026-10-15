-- v52: Meetings — scored Right Person Right Seat, document folders, icebreaker notepad.
--
-- Additive only.
--   * mtg_gwc_criteria     what "Gets it / Wants it / Capacity" means for a seat
--                          (written by the person's superior), scored good(2) / so-so(1) / no(0)
--   * mtg_seats.gwc_pass_score   the total score a person must reach for the seat to pass
--   * mtg_documents.department   documents are filed automatically by department or meeting
--   * mtg_meetings.icebreaker_notes   the meeting's own icebreaker ideas, one per line

create table public.mtg_gwc_criteria (
  id uuid primary key default gen_random_uuid(),
  seat_id uuid not null references public.mtg_seats(id) on delete cascade,
  dimension text not null check (dimension in ('gets_it', 'wants_it', 'capacity')),
  label text not null,
  position int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index mtg_gwc_criteria_seat_idx on public.mtg_gwc_criteria(seat_id);
alter table public.mtg_gwc_criteria enable row level security;
create policy "mtg_all_access" on public.mtg_gwc_criteria for all
  using (has_dept_access('meetings')) with check (has_dept_access('meetings'));

alter table public.mtg_seats add column if not exists gwc_pass_score int check (gwc_pass_score is null or gwc_pass_score >= 0);
alter table public.mtg_documents add column if not exists department text;
alter table public.mtg_meetings add column if not exists icebreaker_notes text;
