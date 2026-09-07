-- v28: adds a location field to Spare Parts requests, picked from a
-- dropdown of the locations already in use on maintenance_equipment (same
-- vocabulary, no new location list to maintain).
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v27 convention.

alter table public.maintenance_spare_parts_requests add column location text;
