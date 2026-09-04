-- v18: two additive changes.
--
-- 1) The visitor-checkin kiosk QR form is now used by visitors, drivers, and
--    in-house staff alike — the person filling it in no longer picks a
--    category themselves; a guard assigns Visitor / Delivery / In-House when
--    reviewing and approving the pending row (see src/app/(app)/security/
--    entries/page.tsx). That means the initial insert has no category yet,
--    so `category` must accept NULL until approval sets a real value.
--
-- 2) Access Control gets an employment status per account (profiles.is_active).
--    An inactive account is blocked from signing in via a Supabase Auth ban
--    (src/app/(app)/admin/access/actions.ts) and, belt-and-suspenders, a
--    proxy.ts check that signs out an already-active session immediately.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v17 convention.

ALTER TABLE public.security_entries ALTER COLUMN category DROP NOT NULL;
ALTER TABLE public.security_entries DROP CONSTRAINT security_entries_category_check;
ALTER TABLE public.security_entries ADD CONSTRAINT security_entries_category_check
  CHECK (category IS NULL OR category = ANY (ARRAY['visitor'::text, 'delivery'::text, 'inhouse'::text, 'security_event'::text]));

ALTER TABLE public.profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
