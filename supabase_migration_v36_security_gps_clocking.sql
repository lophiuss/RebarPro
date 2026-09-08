-- GPS Clocking for Security: geofenced checkpoints a guard clocks in at,
-- with a suggested (not enforced) patrol sequence, a required photo, and an
-- optional remark. Applied live via the Supabase MCP apply_migration tool;
-- this file is the local record, per this repo's migration convention.

create table if not exists security_checkpoints (
  id bigint generated always as identity primary key,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 50,
  sequence_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- checkpoint_name is a snapshot (not just checkpoint_id) so a clocking
-- record still reads sensibly in history/audit even if the checkpoint is
-- later renamed or deleted.
create table if not exists security_clocking_records (
  id bigint generated always as identity primary key,
  checkpoint_id bigint references security_checkpoints(id) on delete set null,
  checkpoint_name text not null,
  guard_name text not null,
  clocked_at timestamptz not null default now(),
  latitude double precision not null,
  longitude double precision not null,
  distance_meters numeric not null,
  photo_drive_id text not null,
  remark text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table security_checkpoints enable row level security;
alter table security_clocking_records enable row level security;

create policy "security dept can select" on security_checkpoints for select using (has_dept_access('security'));
create policy "security dept can insert" on security_checkpoints for insert with check (has_dept_access('security'));
create policy "security dept can update" on security_checkpoints for update using (has_dept_access('security'));
create policy "security dept can delete" on security_checkpoints for delete using (has_dept_access('security'));

create policy "security dept can select" on security_clocking_records for select using (has_dept_access('security'));
create policy "security dept can insert" on security_clocking_records for insert with check (has_dept_access('security'));
create policy "security dept can update" on security_clocking_records for update using (has_dept_access('security'));
create policy "security dept can delete" on security_clocking_records for delete using (has_dept_access('security'));

create index if not exists security_clocking_records_clocked_at_idx on security_clocking_records (clocked_at);
create index if not exists security_checkpoints_sequence_idx on security_checkpoints (sequence_order);
