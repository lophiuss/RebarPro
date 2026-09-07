-- v33: nav permission seed for the new Job History page (manager +
-- technician — same visibility as Work Requests' My Tasks, everyone in the
-- department can see completed/approved history, not just managers).
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v32 convention.

insert into public.department_nav_permissions (department, role, nav_key) values
  ('maintenance', 'manager', '/maintenance/job-history'),
  ('maintenance', 'technician', '/maintenance/job-history')
on conflict do nothing;
