-- Run once after scripts/migrate-security.mjs: bump each identity sequence past
-- the migrated ids so new INSERTs from the app don't collide with them.
select setval(pg_get_serial_sequence('public.security_guard_posts', 'id'), coalesce((select max(id) from public.security_guard_posts), 1));
select setval(pg_get_serial_sequence('public.security_gates', 'id'), coalesce((select max(id) from public.security_gates), 1));
select setval(pg_get_serial_sequence('public.security_gate_events', 'id'), coalesce((select max(id) from public.security_gate_events), 1));
select setval(pg_get_serial_sequence('public.security_keys', 'id'), coalesce((select max(id) from public.security_keys), 1));
select setval(pg_get_serial_sequence('public.security_key_logs', 'id'), coalesce((select max(id) from public.security_key_logs), 1));
select setval(pg_get_serial_sequence('public.security_post_logs', 'id'), coalesce((select max(id) from public.security_post_logs), 1));
select setval(pg_get_serial_sequence('public.security_panic_logs', 'id'), coalesce((select max(id) from public.security_panic_logs), 1));
select setval(pg_get_serial_sequence('public.security_entries', 'id'), coalesce((select max(id) from public.security_entries), 1));
select setval(pg_get_serial_sequence('public.security_incidents', 'id'), coalesce((select max(id) from public.security_incidents), 1));
select setval(pg_get_serial_sequence('public.security_layout', 'id'), coalesce((select max(id) from public.security_layout), 1));
