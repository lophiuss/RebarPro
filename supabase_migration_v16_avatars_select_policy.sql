-- v16: fixes "new row violates row-level security policy" on the new
-- self-service /profile page's avatar save.
--
-- Root cause: the avatars bucket had INSERT/UPDATE/DELETE policies but no
-- SELECT policy at all. supabase-js's upload(..., { upsert: true }) does an
-- existence check under the hood that needs SELECT — with none granted,
-- that check failed under RLS and surfaced as a generic policy violation on
-- the whole upload call.
--
-- Also widens the three write policies (written before the security
-- department existed) to include is_dept_admin('security'), matching
-- rebar/cement.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v15 convention.

create policy "authenticated users can view avatars"
on storage.objects for select to authenticated
using (bucket_id = 'avatars');

drop policy "self or dept admin can upload avatar" on storage.objects;
create policy "self or dept admin can upload avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (
  (storage.foldername(name))[1] = auth.uid()::text
  or is_dept_admin('rebar') or is_dept_admin('cement') or is_dept_admin('security')
));

drop policy "self or dept admin can replace avatar" on storage.objects;
create policy "self or dept admin can replace avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (
  (storage.foldername(name))[1] = auth.uid()::text
  or is_dept_admin('rebar') or is_dept_admin('cement') or is_dept_admin('security')
));

drop policy "self or dept admin can delete avatar" on storage.objects;
create policy "self or dept admin can delete avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (
  (storage.foldername(name))[1] = auth.uid()::text
  or is_dept_admin('rebar') or is_dept_admin('cement') or is_dept_admin('security')
));
