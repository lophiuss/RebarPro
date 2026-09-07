-- v30: checklist submissions gain a manager-approval workflow and an
-- optional evidence photo, per the user's request that a filled-in
-- checklist "auto mark done" (the PM schedule week) only once a manager
-- has approved it — not the moment the technician submits it.
--
-- status defaults to 'pending'; schedule/page.tsx's approveSubmission()
-- sets it to 'approved' (or 'rejected', with rejection_reason) and, for a
-- single_equipment submission, also stamps the matching
-- maintenance_pm_schedule row's completed_at — that's the "auto mark done".
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v29 convention.

alter table public.maintenance_checklist_submissions
  add column status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  add column approved_by text,
  add column approved_at timestamptz,
  add column photo_drive_id text,
  add column rejection_reason text;
