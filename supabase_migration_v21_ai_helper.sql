-- v21: AI Helper — a cross-department assistant grounded in the app's own
-- live data. It never invents numbers: the Server Action
-- (src/app/(app)/ai-helper/actions.ts) builds a real data snapshot from
-- Supabase and feeds it to the model with an instruction to only use what's
-- in that snapshot. Configurable model / effort / system instructions, and
-- an access allow-list on top of "admin anywhere" (is_admin_anywhere()).
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v20 convention.

create or replace function public.is_admin_anywhere()
returns boolean
language sql stable security definer set search_path = 'public'
as $$
  select exists (
    select 1 from public.user_department_access uda
    where uda.user_id = auth.uid() and uda.role = 'admin'
  );
$$;

-- Model default is a "-latest" alias rather than a pinned version — this
-- Gemini account had several dated models (2.5-flash, 2.5-flash-lite, etc.)
-- already deprecated for it at build time, so pinning a specific version is
-- exactly the kind of thing that silently breaks later. See gemini.ts.
create table public.ai_helper_settings (
  id int primary key default 1 check (id = 1),
  model text not null default 'gemini-flash-latest',
  effort text not null default 'medium' check (effort in ('low','medium','high')),
  system_instructions text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.ai_helper_settings (id) values (1);

create table public.ai_helper_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by text,
  created_at timestamptz not null default now()
);

create or replace function public.can_use_ai_helper()
returns boolean
language sql stable security definer set search_path = 'public'
as $$
  select public.is_admin_anywhere() or exists (
    select 1 from public.ai_helper_access a where a.user_id = auth.uid()
  );
$$;

alter table public.ai_helper_settings enable row level security;
alter table public.ai_helper_access enable row level security;

create policy "ai_helper_settings_select" on public.ai_helper_settings
  for select using (public.can_use_ai_helper());
create policy "ai_helper_settings_update" on public.ai_helper_settings
  for update using (public.is_admin_anywhere());

create policy "ai_helper_access_select" on public.ai_helper_access
  for select using (public.is_admin_anywhere() or user_id = auth.uid());
create policy "ai_helper_access_insert" on public.ai_helper_access
  for insert with check (public.is_admin_anywhere());
create policy "ai_helper_access_delete" on public.ai_helper_access
  for delete using (public.is_admin_anywhere());
