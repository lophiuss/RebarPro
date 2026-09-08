-- Adds a per-item "type" to maintenance_checklist_items so a checklist
-- template can mix different kinds of checks, not just OK/Fault:
--   ok_fault (default) - existing OK/Fault + remark behaviour
--   yes_no             - Yes/No buttons + remark
--   numeric             - a numeric reading, no OK/Fault buttons
--   text                - a free-text/remark-only entry, no OK/Fault buttons
-- Applied live via the Supabase MCP apply_migration tool; this file is the
-- local record, per this repo's migration convention.

alter table maintenance_checklist_items
  add column if not exists item_type text not null default 'ok_fault';

alter table maintenance_checklist_items
  add constraint maintenance_checklist_items_item_type_check
  check (item_type in ('ok_fault', 'yes_no', 'numeric', 'text'));
