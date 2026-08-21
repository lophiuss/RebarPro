-- Migration V7: Allow overall wastage (nullable size_id in transactions) & clean orphaned stock takes

-- 1. Make size_id optional in transactions (for overall combined wastage)
alter table public.transactions alter column size_id drop not null;

-- 2. Clean up any orphaned stock takes that have no project_type_id
delete from public.stock_takes where project_type_id is null;

-- 3. Reload schema cache
NOTIFY pgrst, 'reload schema';
