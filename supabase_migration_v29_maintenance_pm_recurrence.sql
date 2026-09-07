-- v29: recurring PM scheduling. Previously maintenance_pm_schedule cells
-- could only be hand-ticked one week at a time. This adds:
--   - maintenance_pm_schedule.assigned_to (who's responsible for that week's
--     PM — used for the "auto remind" in-app banner on the Dashboard)
--   - maintenance_pm_recurrence: a rule (equipment, every N weeks, starting
--     from a date, assigned to someone) that the Schedule page's "New
--     Recurring Schedule" form uses to bulk-generate maintenance_pm_schedule
--     rows going forward (currently a ~2-year horizon per rule — see
--     schedule/page.tsx's generateRecurrence()).
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v28 convention.

alter table public.maintenance_pm_schedule add column assigned_to text;

create table public.maintenance_pm_recurrence (
  id bigint generated always as identity primary key,
  equipment_id bigint not null references public.maintenance_equipment(id) on delete cascade,
  frequency_weeks int not null check (frequency_weeks > 0),
  start_date date not null,
  assigned_to text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.maintenance_pm_recurrence enable row level security;
create policy "maintenance_all_access" on public.maintenance_pm_recurrence for all using (has_dept_access('maintenance')) with check (has_dept_access('maintenance'));
create index maintenance_pm_recurrence_equipment_idx on public.maintenance_pm_recurrence(equipment_id);
