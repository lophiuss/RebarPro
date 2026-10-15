-- v50: Meetings — document uploads, whiteboards, calendar data, headline links.
--
-- Additive only; nothing existing is dropped or rewritten.
--
--   * mtg_documents      file upload columns + private storage bucket `meeting-docs`
--   * mtg_todos/issues   source_headline_id  (item was created from a headline)
--   * mtg_issues         due_date            (so issues can appear on the calendar)
--   * mtg_meetings       schedule            (weekly days / time, for the calendar)
--   * mtg_whiteboards    Coach whiteboards (drawing data as JSON)

-- ------------------------------------------------------------ documents
alter table public.mtg_documents
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('meeting-docs', 'meeting-docs', false, 26214400)
on conflict (id) do nothing;

create policy "meeting_docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'meeting-docs' and has_dept_access('meetings'));
create policy "meeting_docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'meeting-docs' and has_dept_access('meetings'));
create policy "meeting_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'meeting-docs' and has_dept_access('meetings'));

-- ------------------------------------------------------------ headline links
alter table public.mtg_todos
  add column if not exists source_headline_id uuid references public.mtg_headlines(id) on delete set null;
alter table public.mtg_issues
  add column if not exists source_headline_id uuid references public.mtg_headlines(id) on delete set null,
  add column if not exists due_date date;

-- ------------------------------------------------------------ calendar
-- { "days": [1,3], "time": "09:00", "every": 1 }   days 0=Sun..6=Sat, every = weeks
alter table public.mtg_meetings add column if not exists schedule jsonb;

-- ------------------------------------------------------------ whiteboards
create table public.mtg_whiteboards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_id uuid references public.mtg_meetings(id) on delete set null,
  data jsonb not null default '{"items":[]}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mtg_whiteboards_meeting_idx on public.mtg_whiteboards(meeting_id);
alter table public.mtg_whiteboards enable row level security;
create policy "mtg_all_access" on public.mtg_whiteboards for all
  using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
