-- 1. Create Audit Log Table (if not exists)
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

-- 2. Create Project Types table
create table if not exists public.project_types (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique
);
alter table public.project_types enable row level security;
create policy "Public read access to project_types" on public.project_types for select using ( true );
create policy "Authenticated users can insert project_types" on public.project_types for insert with check ( auth.role() = 'authenticated' );
create policy "Authenticated users can update project_types" on public.project_types for update using ( auth.role() = 'authenticated' );
create policy "Authenticated users can delete project_types" on public.project_types for delete using ( auth.role() = 'authenticated' );

-- Insert default project types
insert into public.project_types (name) values ('Building'), ('Tunnel'), ('SBG'), ('Other') on conflict do nothing;

-- 3. Update Transactions table for do_number, notes, and project_type_id
alter table public.transactions add column if not exists do_number text;
alter table public.transactions add column if not exists notes text;
alter table public.transactions add column if not exists project_type_id uuid references public.project_types(id);
alter table public.transactions alter column project_id drop not null;

-- Update RLS for transactions
create policy "Authenticated users can update transactions" on public.transactions for update using ( auth.role() = 'authenticated' );
create policy "Authenticated users can delete transactions" on public.transactions for delete using ( auth.role() = 'authenticated' );

-- 4. Update Projects table to use project_type_id
alter table public.projects add column if not exists project_type_id uuid references public.project_types(id);
update public.projects set project_type_id = pt.id from public.project_types pt where public.projects.type = pt.name;

create policy "Authenticated users can delete projects" on public.projects for delete using ( auth.role() = 'authenticated' );

-- 5. Update Stock Takes table to use project_type_id
alter table public.stock_takes add column if not exists project_type_id uuid references public.project_types(id);
update public.stock_takes set project_type_id = pt.id from public.project_types pt where public.stock_takes.project_type = pt.name;

create policy "Authenticated users can update stock_takes" on public.stock_takes for update using ( auth.role() = 'authenticated' );
create policy "Authenticated users can delete stock_takes" on public.stock_takes for delete using ( auth.role() = 'authenticated' );

-- 6. Fix cascading deletes for Projects -> Transactions
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_project_id_fkey;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.stock_takes DROP CONSTRAINT IF EXISTS stock_takes_project_id_fkey;
ALTER TABLE public.stock_takes ADD CONSTRAINT stock_takes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- 7. Update Rebar Sizes RLS
create policy "Authenticated users can update rebar_sizes" on public.rebar_sizes for update using ( auth.role() = 'authenticated' );
create policy "Authenticated users can delete rebar_sizes" on public.rebar_sizes for delete using ( auth.role() = 'authenticated' );

-- 8. Reload Schema Cache for PostgREST
NOTIFY pgrst, 'reload schema';