alter table public.rebar_sizes add column if not exists target_daily_usage numeric default 0;

-- Migrate data from targets table if any exists
update public.rebar_sizes rs
set target_daily_usage = t.target_daily_usage
from public.targets t
where rs.id = t.size_id;

NOTIFY pgrst, 'reload schema';
