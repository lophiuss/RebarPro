-- ============================================================================
-- Migration v64: Cross-department read access for Projects, Workers & Supervisors
-- Allows Mould and QAQC department users to query plantpro_projects,
-- and Mould users to query plantpro_workers & plantpro_supervisors.
-- ============================================================================

-- 1. plantpro_projects: allow mould and qaqc users to view projects
drop policy if exists "plantpro_all_access" on public.plantpro_projects;
drop policy if exists "plantpro_projects_select" on public.plantpro_projects;
drop policy if exists "plantpro_projects_modify" on public.plantpro_projects;

create policy "plantpro_projects_select" on public.plantpro_projects
  for select
  using (
    has_dept_access('plantpro') or
    has_dept_access('mould') or
    has_dept_access('qaqc')
  );

create policy "plantpro_projects_modify" on public.plantpro_projects
  for all
  using (has_dept_access('plantpro'))
  with check (has_dept_access('plantpro'));

-- 2. plantpro_workers: allow mould users to view active workers roster
drop policy if exists "plantpro_all_access" on public.plantpro_workers;
drop policy if exists "plantpro_workers_select" on public.plantpro_workers;
drop policy if exists "plantpro_workers_modify" on public.plantpro_workers;

create policy "plantpro_workers_select" on public.plantpro_workers
  for select
  using (
    has_dept_access('plantpro') or
    has_dept_access('mould')
  );

create policy "plantpro_workers_modify" on public.plantpro_workers
  for all
  using (has_dept_access('plantpro'))
  with check (has_dept_access('plantpro'));

-- 3. plantpro_supervisors: allow mould users to resolve supervisor ID
drop policy if exists "plantpro_all_access" on public.plantpro_supervisors;
drop policy if exists "plantpro_supervisors_select" on public.plantpro_supervisors;
drop policy if exists "plantpro_supervisors_modify" on public.plantpro_supervisors;

create policy "plantpro_supervisors_select" on public.plantpro_supervisors
  for select
  using (
    has_dept_access('plantpro') or
    has_dept_access('mould')
  );

create policy "plantpro_supervisors_modify" on public.plantpro_supervisors
  for all
  using (has_dept_access('plantpro'))
  with check (has_dept_access('plantpro'));
