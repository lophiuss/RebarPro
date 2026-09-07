-- v27: Job Reports drop manual "Downtime (hours)"/"Repair Time (hours)"
-- number entry. reported_at is stamped when the report is logged and
-- resolved_at when someone marks it resolved; downtime_hours/
-- repair_time_hours (kept — the Dashboard KPIs already read them) are now
-- computed from the elapsed time between the two, both set to the same
-- value (report -> resolved), same simplification Work Requests already
-- use rather than distinguishing "downtime" from "hands-on repair time".
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v26 convention.

alter table public.maintenance_job_reports
  add column reported_at timestamptz not null default now(),
  add column resolved_at timestamptz;
