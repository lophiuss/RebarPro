-- v22: restrict AI Helper management to a super-admin, not every dept admin.
--
-- Bug: managing AI Helper (model/effort/instructions, and the who-can-use-it
-- allow-list) was gated on is_admin_anywhere() — since every department has
-- its own separate admin account(s) (rebar admin, cement admin, security
-- admin), that meant any one of them could change the shared AI
-- configuration or grant/revoke anyone's access to it. Reported as "seems
-- everyone can use it to assign user".
--
-- Fix: a new app_super_admins table (no API access at all — membership is
-- managed directly against the database, never through an in-app UI) and
-- is_super_admin() function now gate management. Using the chat itself is
-- unaffected — still admin-anywhere OR allow-listed via ai_helper_access.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v21 convention.

create table public.app_super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_super_admins enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = 'public'
as $$
  select exists (select 1 from public.app_super_admins a where a.user_id = auth.uid());
$$;

insert into public.app_super_admins (user_id) values ('217806c8-a2d0-468d-bb95-9227e724353b'); -- davidthen4285@gmail.com

drop policy "ai_helper_settings_update" on public.ai_helper_settings;
create policy "ai_helper_settings_update" on public.ai_helper_settings
  for update using (public.is_super_admin());

drop policy "ai_helper_access_select" on public.ai_helper_access;
create policy "ai_helper_access_select" on public.ai_helper_access
  for select using (public.is_super_admin() or user_id = auth.uid());

drop policy "ai_helper_access_insert" on public.ai_helper_access;
create policy "ai_helper_access_insert" on public.ai_helper_access
  for insert with check (public.is_super_admin());

drop policy "ai_helper_access_delete" on public.ai_helper_access;
create policy "ai_helper_access_delete" on public.ai_helper_access
  for delete using (public.is_super_admin());
