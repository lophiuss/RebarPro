-- v13: profile pictures + admin-created accounts for Access Control.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local record
-- of that state, matching the v2..v12 convention.

alter table public.profiles add column if not exists avatar_url text;

-- Public bucket: object bytes are served without RLS via the public URL, but
-- writes still go through the authenticated API and are RLS-checked. Anyone
-- can upload only into their own folder (avatars/<their-user-id>/...); a
-- department admin can additionally upload into anyone's folder (managing a
-- person's picture from Access Control).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "self or dept admin can upload avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_dept_admin('rebar')
    or public.is_dept_admin('cement')
  )
);

create policy "self or dept admin can replace avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_dept_admin('rebar')
    or public.is_dept_admin('cement')
  )
);

create policy "self or dept admin can delete avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_dept_admin('rebar')
    or public.is_dept_admin('cement')
  )
);

-- No schema change needed for "add user" / "reset password" / "edit name" —
-- those go through the Admin API via src/app/(app)/admin/access/actions.ts
-- (createPerson, resetPersonPassword, updatePersonProfile), all gated behind
-- requireDeptAdmin() re-checked server-side on every call.
