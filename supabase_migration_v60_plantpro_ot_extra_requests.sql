-- PlantPro: Additional OT requests.
-- After a month's OT sheet is Pending/Approved (locked), supervisors raise
-- separate "additional OT" requests per worker/date. Each needs manager/admin
-- approval; approved hours are added on top of the month's OT totals.

create or replace function public.plantpro_is_ot_approver()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_department_access uda
    where uda.user_id = auth.uid()
      and uda.department = 'plantpro'
      and uda.role in ('admin', 'manager')
  );
$$;
grant execute on function public.plantpro_is_ot_approver() to authenticated;

create table public.plantpro_ot_extra_requests (
  id bigint generated always as identity primary key,
  month text not null,                                  -- YYYY-MM, derived from work_date
  work_date date not null,
  worker_id bigint not null references public.plantpro_workers(id) on delete cascade,
  supervisor_id bigint references public.plantpro_supervisors(id) on delete set null,
  hours numeric not null check (hours > 0 and hours <= 24),
  reason text not null,
  -- [{ "project_id": 1, "percentage": 60 }, ...]; empty = use worker's monthly allocation
  allocations jsonb not null default '[]'::jsonb,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text
);

create index plantpro_ot_extra_requests_month_idx on public.plantpro_ot_extra_requests(month);
create index plantpro_ot_extra_requests_worker_idx on public.plantpro_ot_extra_requests(worker_id);

alter table public.plantpro_ot_extra_requests enable row level security;

create policy "plantpro_extra_select" on public.plantpro_ot_extra_requests
  for select using (has_dept_access('plantpro'));

-- Anyone in the department can raise a request, but only as Pending.
create policy "plantpro_extra_insert" on public.plantpro_ot_extra_requests
  for insert with check (has_dept_access('plantpro') and status = 'Pending');

-- Only managers/admins can approve or reject.
create policy "plantpro_extra_update" on public.plantpro_ot_extra_requests
  for update using (plantpro_is_ot_approver()) with check (plantpro_is_ot_approver());

-- Requester may withdraw while still Pending; approvers may delete any.
create policy "plantpro_extra_delete" on public.plantpro_ot_extra_requests
  for delete using (
    plantpro_is_ot_approver()
    or (has_dept_access('plantpro') and status = 'Pending' and requested_by = auth.uid())
  );
