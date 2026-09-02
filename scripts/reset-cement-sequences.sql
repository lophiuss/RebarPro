-- Run once after scripts/migrate-cement.mjs: bump each identity sequence past
-- the migrated ids so new INSERTs from the app don't collide with them.
select setval(pg_get_serial_sequence('public.cement_units', 'id'), coalesce((select max(id) from public.cement_units), 1));
select setval(pg_get_serial_sequence('public.cement_plants', 'id'), coalesce((select max(id) from public.cement_plants), 1));
select setval(pg_get_serial_sequence('public.cement_suppliers', 'id'), coalesce((select max(id) from public.cement_suppliers), 1));
select setval(pg_get_serial_sequence('public.cement_materials', 'id'), coalesce((select max(id) from public.cement_materials), 1));
select setval(pg_get_serial_sequence('public.cement_silos', 'id'), coalesce((select max(id) from public.cement_silos), 1));
select setval(pg_get_serial_sequence('public.cement_silo_materials', 'id'), coalesce((select max(id) from public.cement_silo_materials), 1));
select setval(pg_get_serial_sequence('public.cement_silo_material_history', 'id'), coalesce((select max(id) from public.cement_silo_material_history), 1));
select setval(pg_get_serial_sequence('public.cement_weight_in', 'id'), coalesce((select max(id) from public.cement_weight_in), 1));
select setval(pg_get_serial_sequence('public.cement_daily_stock_take', 'id'), coalesce((select max(id) from public.cement_daily_stock_take), 1));
select setval(pg_get_serial_sequence('public.cement_daily_usage', 'id'), coalesce((select max(id) from public.cement_daily_usage), 1));
select setval(pg_get_serial_sequence('public.cement_transfers', 'id'), coalesce((select max(id) from public.cement_transfers), 1));
select setval(pg_get_serial_sequence('public.cement_alert_log', 'id'), coalesce((select max(id) from public.cement_alert_log), 1));
