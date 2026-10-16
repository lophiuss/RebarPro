-- v57: Meetings — a note on any KPI number (one note per KPI per period). Additive only.

create table public.mtg_kpi_notes (
  kpi_id uuid not null references public.mtg_kpis(id) on delete cascade,
  period_start date not null,
  note text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (kpi_id, period_start)
);

alter table public.mtg_kpi_notes enable row level security;

create policy "mtg_all_access" on public.mtg_kpi_notes
  for all using (has_dept_access('meetings')) with check (has_dept_access('meetings'));
