-- v25: seed default department_nav_permissions for Maintenance's
-- manager/technician roles.
--
-- Bug: the original v23 migration created the maintenance department but
-- never seeded any nav permissions for it (the PRD called for this but it
-- was missed). Since AppNavigation only shows a page to a non-admin role
-- when a department_nav_permissions row explicitly allows it, a manager or
-- technician granted 'maintenance' access saw a completely empty sidebar
-- until an admin manually checked boxes in Access Control.
--
-- manager: everything except Settings (equipment master + checklist
-- template editing stays admin-only, per PRD's role table).
-- technician: Dashboard, Equipment (view), Jobs, Schedule & Checklists,
-- Work Requests (My Tasks) — not Spare Parts/Critical Issues/Settings.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v24 convention.

insert into public.department_nav_permissions (department, role, nav_key) values
  ('maintenance', 'manager', '/maintenance'),
  ('maintenance', 'manager', '/maintenance/equipment'),
  ('maintenance', 'manager', '/maintenance/jobs'),
  ('maintenance', 'manager', '/maintenance/schedule'),
  ('maintenance', 'manager', '/maintenance/work-requests'),
  ('maintenance', 'manager', '/maintenance/spare-parts'),
  ('maintenance', 'manager', '/maintenance/critical-issues'),
  ('maintenance', 'technician', '/maintenance'),
  ('maintenance', 'technician', '/maintenance/equipment'),
  ('maintenance', 'technician', '/maintenance/jobs'),
  ('maintenance', 'technician', '/maintenance/schedule'),
  ('maintenance', 'technician', '/maintenance/work-requests')
on conflict do nothing;
