-- Alter stock_takes to use project_type instead of project_id
alter table public.stock_takes add column if not exists project_type text;
alter table public.stock_takes drop constraint if exists stock_takes_project_id_fkey;
alter table public.stock_takes alter column project_id drop not null;
