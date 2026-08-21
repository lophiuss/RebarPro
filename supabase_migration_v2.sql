-- Add DO number column to transactions
alter table public.transactions add column if not exists do_number text;

-- Create Audit Log Table
create table if not exists public.audit_log (
  id uuid default uuid_generate_v4() primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references auth.users(id),
  changed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.audit_log enable row level security;
create policy "Authenticated users can read audit_log" on public.audit_log for select using ( auth.role() = 'authenticated' );
create policy "Authenticated users can insert audit_log" on public.audit_log for insert with check ( auth.role() = 'authenticated' );

-- Allow authenticated users to update and delete transactions
create policy "Authenticated users can update transactions" on public.transactions for update using ( auth.role() = 'authenticated' );
create policy "Authenticated users can delete transactions" on public.transactions for delete using ( auth.role() = 'authenticated' );

-- Allow authenticated users to update and delete stock_takes
create policy "Authenticated users can update stock_takes" on public.stock_takes for update using ( auth.role() = 'authenticated' );
create policy "Authenticated users can delete stock_takes" on public.stock_takes for delete using ( auth.role() = 'authenticated' );

-- Allow authenticated users to update and delete projects
create policy "Authenticated users can delete projects" on public.projects for delete using ( auth.role() = 'authenticated' );

-- Allow update/delete on rebar_sizes
create policy "Authenticated users can update rebar_sizes" on public.rebar_sizes for update using ( auth.role() = 'authenticated' );
create policy "Authenticated users can delete rebar_sizes" on public.rebar_sizes for delete using ( auth.role() = 'authenticated' );
