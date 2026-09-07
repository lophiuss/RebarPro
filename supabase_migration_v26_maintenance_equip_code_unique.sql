-- v26: unique constraint on maintenance_equipment.equip_code. Standard SQL
-- unique constraints already treat multiple NULLs as non-conflicting, so
-- equipment added by hand through the Settings page without a code is
-- unaffected — a plain constraint (not a partial index) is used because
-- PostgREST's on_conflict= upsert can only target a real constraint, not a
-- filtered/partial index.
--
-- Needed for the historical-data migration (INVENTORY.xlsx/ASSET
-- OWNERSHIP.xlsx/2026 PM SCHEDULE.xlsx -> maintenance_equipment) to upsert
-- on equip_code idempotently — v23 created the column without a uniqueness
-- constraint, which "on conflict" needs. (A first attempt used a partial
-- unique index, which Postgres's ON CONFLICT inference rejected — see the
-- migration history for the follow-up fix, folded into this file.)
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v25 convention.

alter table public.maintenance_equipment
  add constraint maintenance_equipment_equip_code_key unique (equip_code);
