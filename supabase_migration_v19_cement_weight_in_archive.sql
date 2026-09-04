-- v19: archive column for cement_weight_in.
--
-- Some deliveries get stuck mid-pipeline (DO entered but never unloaded, or
-- unloaded but Weight Out never recorded) and clutter the Unloading In
-- Progress / Weight Out operational queues indefinitely. Archiving hides a
-- load from those two queues (see src/app/(app)/cement/unloading/page.tsx and
-- .../weight-out/page.tsx) without deleting it — reversible via "Unarchive".
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v18 convention.

ALTER TABLE public.cement_weight_in ADD COLUMN archived_at timestamptz;
ALTER TABLE public.cement_weight_in ADD COLUMN archived_by text;
