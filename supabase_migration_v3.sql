-- 1. Reload the schema cache to fix the 'do_number' error
NOTIFY pgrst, 'reload schema';

-- 2. Add 'unit' to rebar_sizes
alter table public.rebar_sizes add column if not exists unit text default 'Tons';

-- 3. Create global_settings table for target coverage days
create table if not exists public.global_settings (
  id integer primary key default 1 check (id = 1),
  target_coverage_days numeric default 14,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.global_settings (id, target_coverage_days) values (1, 14) on conflict (id) do nothing;

alter table public.global_settings enable row level security;
create policy "Public read access to global_settings" on public.global_settings for select using ( true );
create policy "Authenticated users can update global_settings" on public.global_settings for update using ( auth.role() = 'authenticated' );
create policy "Authenticated users can insert global_settings" on public.global_settings for insert with check ( auth.role() = 'authenticated' );
