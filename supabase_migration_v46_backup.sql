-- v46: support for the daily Google Drive backup (/api/cron/backup).
--
-- backup_list_tables / backup_dump_table / backup_auth_users are callable by the
-- service role only (the cron route uses the secret key). They are SECURITY DEFINER
-- so the export sees every row regardless of RLS; the grants below are what keep
-- them away from signed-in users and the anon key.
-- backup_runs is a small log of each run (RLS on, no policies = service role only).

create table if not exists public.backup_runs (
  id bigint generated always as identity primary key,
  run_at timestamptz not null default now(),
  ok boolean not null,
  file_name text,
  size_bytes bigint,
  tables int,
  rows bigint,
  pruned int,
  error text
);
alter table public.backup_runs enable row level security;

create or replace function public.backup_list_tables()
returns setof text
language sql
security definer
set search_path = public, pg_temp
as $$
  select tablename::text from pg_tables where schemaname = 'public' order by tablename;
$$;

create or replace function public.backup_dump_table(p_table text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p_table) then
    raise exception 'unknown table %', p_table;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', p_table) into result;
  return result;
end;
$$;

-- Login accounts without password hashes: enough to know who existed and re-invite them.
create or replace function public.backup_auth_users()
returns jsonb
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'email', email, 'created_at', created_at, 'last_sign_in_at', last_sign_in_at,
    'banned_until', banned_until, 'app_metadata', raw_app_meta_data, 'user_metadata', raw_user_meta_data)), '[]'::jsonb)
  from auth.users;
$$;

revoke all on function public.backup_list_tables() from public, anon, authenticated;
revoke all on function public.backup_dump_table(text) from public, anon, authenticated;
revoke all on function public.backup_auth_users() from public, anon, authenticated;
grant execute on function public.backup_list_tables() to service_role;
grant execute on function public.backup_dump_table(text) to service_role;
grant execute on function public.backup_auth_users() to service_role;
