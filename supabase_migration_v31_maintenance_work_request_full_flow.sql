-- v31: full Work Request flow, per the user's explicit walkthrough —
-- submit -> notify manager -> manager reviews/edits -> assign -> technician
-- accepts -> technician completes (with evidence) -> manager approves ->
-- done. Previously "assigned" jumped straight to "completed" with no
-- acknowledgement step and no manager sign-off on the finished work.
--
-- New statuses: 'accepted' (technician has acknowledged the assignment,
-- work-requests/page.tsx's My Tasks only allows marking complete once
-- accepted) and 'approved' (manager confirms — this is what work-requests/
-- page.tsx now treats as truly "done"; the previous meaning of 'completed'
-- becomes an in-between "submitted, awaiting approval" state). A manager
-- rejecting completed work sends status back to 'accepted' with
-- rejection_reason set, for the technician to redo — no separate
-- 'rejected' status, to keep the state machine linear.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v30 convention.

alter table public.maintenance_work_requests drop constraint if exists maintenance_work_requests_status_check;
alter table public.maintenance_work_requests
  add constraint maintenance_work_requests_status_check
  check (status in ('pending', 'assigned', 'accepted', 'completed', 'approved', 'cancelled'));

alter table public.maintenance_work_requests
  add column accepted_at timestamptz,
  add column approved_at timestamptz,
  add column approved_by text,
  add column rejection_reason text;
