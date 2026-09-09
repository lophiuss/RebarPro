-- v37: shoutouts archive — lets a manager/admin archive an old shoutout
-- (hide it from the active feed without deleting it) and still browse
-- archived ones separately (see src/components/ShoutoutBoard.tsx).
-- Archiving is gated in the UI by the same admin/manager role check
-- already used for posting (v20) — RLS itself only requires department
-- access, matching that same convention, not a specific role.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v36 convention.

alter table public.shoutouts add column archived boolean not null default false;

create policy "shoutouts_update" on public.shoutouts
  for update using (has_dept_access(department)) with check (has_dept_access(department));

create index shoutouts_department_archived_created_at_idx on public.shoutouts (department, archived, created_at desc);
