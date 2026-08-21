-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Drop existing tables/triggers to ensure a clean slate for this project
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user cascade;
drop table if exists public.stock_takes cascade;
drop table if exists public.transactions cascade;
drop table if exists public.targets cascade;
drop table if exists public.rebar_sizes cascade;
drop table if exists public.projects cascade;
drop table if exists public.profiles cascade;

-- 1. Profiles Table
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  full_name text,
  role text check (role in ('admin', 'manager', 'user')) default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Projects Table
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  type text not null, -- e.g., Tunnel, Building, SBG, Other
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Rebar Sizes Table
create table public.rebar_sizes (
  id uuid default uuid_generate_v4() primary key,
  size text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Pre-populate common sizes
insert into public.rebar_sizes (size) values 
('H6'), ('H8'), ('H10'), ('H12'), ('H13'), ('H16'), ('H20'), ('H25'), ('H28'), ('H32'), ('H40')
on conflict (size) do nothing;

-- 4. Targets Table (By Project and Size)
create table public.targets (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  size_id uuid references public.rebar_sizes(id) on delete cascade not null,
  target_daily_usage numeric default 0,
  target_incoming numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (project_id, size_id)
);

-- 5. Transactions Table
create table public.transactions (
  id uuid default uuid_generate_v4() primary key,
  transaction_date date not null default current_date,
  project_id uuid references public.projects(id) on delete cascade not null,
  size_id uuid references public.rebar_sizes(id) on delete cascade not null,
  type text not null check (type in ('ordering', 'incoming', 'usage', 'outgoing', 'transfer', 'suspended', 'wastage', 'variance')),
  quantity numeric not null,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Stock Takes Table (Monthly)
create table public.stock_takes (
  id uuid default uuid_generate_v4() primary key,
  stock_take_date date not null default current_date,
  project_id uuid references public.projects(id) on delete cascade not null,
  size_id uuid references public.rebar_sizes(id) on delete cascade not null,
  physical_count numeric not null,
  system_balance numeric not null,
  variance numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.rebar_sizes enable row level security;
alter table public.targets enable row level security;
alter table public.transactions enable row level security;
alter table public.stock_takes enable row level security;

-- Create policies (simplistic for now: authenticated users can read/write everything, but profiles are secure)
create policy "Public profiles are viewable by everyone." on public.profiles for select using ( true );
create policy "Users can insert their own profile." on public.profiles for insert with check ( auth.uid() = id );
create policy "Users can update own profile." on public.profiles for update using ( auth.uid() = id );

create policy "Authenticated users can read projects" on public.projects for select using ( auth.role() = 'authenticated' );
create policy "Authenticated users can insert projects" on public.projects for insert with check ( auth.role() = 'authenticated' );
create policy "Authenticated users can update projects" on public.projects for update using ( auth.role() = 'authenticated' );

create policy "Authenticated users can read rebar_sizes" on public.rebar_sizes for select using ( auth.role() = 'authenticated' );
create policy "Authenticated users can insert rebar_sizes" on public.rebar_sizes for insert with check ( auth.role() = 'authenticated' );

create policy "Authenticated users can read targets" on public.targets for select using ( auth.role() = 'authenticated' );
create policy "Authenticated users can insert targets" on public.targets for insert with check ( auth.role() = 'authenticated' );
create policy "Authenticated users can update targets" on public.targets for update using ( auth.role() = 'authenticated' );

create policy "Authenticated users can read transactions" on public.transactions for select using ( auth.role() = 'authenticated' );
create policy "Authenticated users can insert transactions" on public.transactions for insert with check ( auth.role() = 'authenticated' );

create policy "Authenticated users can read stock_takes" on public.stock_takes for select using ( auth.role() = 'authenticated' );
create policy "Authenticated users can insert stock_takes" on public.stock_takes for insert with check ( auth.role() = 'authenticated' );

-- Function to handle new user signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'user');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
