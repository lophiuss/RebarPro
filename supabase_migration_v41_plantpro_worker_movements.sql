-- v41: plantpro_worker_movements — a full history of which supervisor and
-- department each worker was under, and when it changed. Written by the
-- OT-page Transfer action AND by HR-page edits to a worker's Supervisor /
-- Line (previously only the OT Transfer path was logged, and nothing read
-- that log). Read by the HR page's "Supervisor Movement" tab.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v40 convention.

create table public.plantpro_worker_movements (
  id bigint generated always as identity primary key,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  effective_date date not null,
  from_supervisor_id bigint references public.plantpro_supervisors(id) on delete set null,
  to_supervisor_id bigint references public.plantpro_supervisors(id) on delete set null,
  from_line text,
  to_line text,
  changed_by text,
  created_at timestamptz not null default now()
);
create index plantpro_worker_movements_worker_date_idx on public.plantpro_worker_movements (worker_id, effective_date);
alter table public.plantpro_worker_movements enable row level security;
create policy "plantpro_all_access" on public.plantpro_worker_movements for all using (has_dept_access('plantpro')) with check (has_dept_access('plantpro'));

-- Backfill from the existing OT-transfer log (previous supervisor/department unknown for those).
insert into public.plantpro_worker_movements (worker_id, effective_date, to_supervisor_id, from_line, to_line, changed_by, created_at)
select t.worker_id, (t.month || '-' || t.day)::date, t.to_supervisor_id, w.line, w.line, 'backfill from OT transfer log', t.created_at
from public.plantpro_worker_transfers t join public.plantpro_workers w on w.id = t.worker_id;
