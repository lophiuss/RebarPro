-- v15: layout image moved to Supabase Storage (public, low-sensitivity —
-- just a site map, unlike per-person entry/incident photos) for a faster
-- plain <img> load with no auth round trip; plus schema for the visitor
-- self-check-in kiosk (QR code -> public form -> guard approval).
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v14 convention.

alter table public.security_layout add column if not exists photo_url text;
alter table public.security_layout alter column photo_drive_id drop not null;

insert into storage.buckets (id, name, public)
values ('security-layout', 'security-layout', true)
on conflict (id) do nothing;

create policy "security dept can upload layout"
on storage.objects for insert to authenticated
with check (bucket_id = 'security-layout' and has_dept_access('security'));

create policy "security dept can replace layout"
on storage.objects for update to authenticated
using (bucket_id = 'security-layout' and has_dept_access('security'));

create policy "security dept can delete layout"
on storage.objects for delete to authenticated
using (bucket_id = 'security-layout' and has_dept_access('security'));

-- Visitor self-check-in: a visitor scans a QR code to a public,
-- unauthenticated page (src/app/visitor-checkin) and submits their own name/
-- company/purpose/looking-for, landing as 'pending' until a guard adds a
-- photo and approves them in (see src/app/(app)/security/entries/page.tsx).
-- The public submission goes through a Server Action using the service-role
-- client (src/app/visitor-checkin/actions.ts) rather than an RLS policy for
-- the anon role, so the insert is limited to exactly these fixed fields —
-- no RLS widening on security_entries itself.
alter table public.security_entries add column if not exists looking_for text;

alter table public.security_entries drop constraint security_entries_status_check;
alter table public.security_entries add constraint security_entries_status_check
  check (status in ('pending','in','out'));
