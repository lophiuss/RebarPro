-- v47: restore side of the Drive backup (scripts/restore-backup.mjs).
--
-- backup_restore_table(table, rows, mode) loads rows from a backup file back into one
-- public table. Service role only (same grants as the v46 backup functions).
--   mode 'missing'   : insert rows whose key does not exist yet, leave existing rows alone (default, safe)
--   mode 'overwrite' : insert, and update rows that already exist (matched on the primary key)
-- Foreign keys and triggers are switched off for the call (session_replication_role = replica) so tables can
-- be loaded in any order and history/audit triggers do not fire for restored rows. Identity/serial sequences
-- are moved past the highest restored id afterwards.

create or replace function public.backup_restore_table(p_table text, p_rows jsonb, p_mode text default 'missing')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rel regclass;
  cols text;
  pk text;
  setlist text;
  stmt text;
  n bigint;
  col record;
  seq regclass;
  maxv bigint;
begin
  if p_mode not in ('missing', 'overwrite') then raise exception 'unknown mode %', p_mode; end if;
  if p_table = 'backup_runs' or not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p_table) then
    raise exception 'unknown table %', p_table;
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a JSON array'; end if;
  if jsonb_array_length(p_rows) = 0 then return jsonb_build_object('rows', 0); end if;

  rel := format('public.%I', p_table)::regclass;
  perform set_config('session_replication_role', 'replica', true);

  -- generated columns cannot be written; everything else can
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute where attrelid = rel and attnum > 0 and not attisdropped and attgenerated = '';

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into pk
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = rel and i.indisprimary;

  stmt := format('insert into %s (%s) overriding system value select %s from jsonb_populate_recordset(null::%s, $1)', rel, cols, cols, rel);

  if p_mode = 'missing' then
    stmt := stmt || ' on conflict do nothing';
  else
    if pk is null then raise exception 'table % has no primary key; overwrite mode is not possible', p_table; end if;
    select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ') into setlist
      from pg_attribute a where a.attrelid = rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and not exists (select 1 from pg_index i where i.indrelid = rel and i.indisprimary and a.attnum = any (i.indkey));
    stmt := stmt || format(' on conflict (%s) ', pk) || case when setlist is null then 'do nothing' else 'do update set ' || setlist end;
  end if;

  execute stmt using p_rows;
  get diagnostics n = row_count;

  -- move id sequences past the restored data (never backwards)
  for col in select attname from pg_attribute where attrelid = rel and attnum > 0 and not attisdropped loop
    seq := pg_get_serial_sequence(rel::text, col.attname)::regclass;
    if seq is not null then
      execute format('select max(%I) from %s', col.attname, rel) into maxv;
      if maxv is not null and maxv > coalesce(pg_sequence_last_value(seq), 0) then perform setval(seq, maxv); end if;
    end if;
  end loop;

  return jsonb_build_object('rows', n);
end;
$$;

revoke all on function public.backup_restore_table(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.backup_restore_table(text, jsonb, text) to service_role;
