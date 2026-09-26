-- v42: salary/wage data is HR + admin only (PlantPro).
--
-- * plantpro_can_see_wages() previously admitted 'manager' as well; now
--   only 'admin' and 'hr'. It gates SELECT on plantpro_worker_pay_values
--   (and therefore every page and the AI Helper, which all read through the
--   caller's own RLS).
-- * INSERT/UPDATE/DELETE on plantpro_worker_pay_values were open to any
--   plantpro member (a supervisor could have altered salaries by calling the
--   API directly, even though no page exposes it). Now the same function.
-- * Managers lose the HR pay database and Import (salary Excel) nav entries.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. Local record, as v2..v41.

create or replace function public.plantpro_can_see_wages()
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.user_department_access uda
    where uda.user_id = auth.uid()
      and uda.department = 'plantpro'
      and uda.role in ('admin', 'hr')
  );
$$;

drop policy "plantpro members write pay values" on public.plantpro_worker_pay_values;
drop policy "plantpro members update pay values" on public.plantpro_worker_pay_values;
drop policy "plantpro members delete pay values" on public.plantpro_worker_pay_values;
create policy "plantpro wage roles insert pay values" on public.plantpro_worker_pay_values for insert with check (public.plantpro_can_see_wages());
create policy "plantpro wage roles update pay values" on public.plantpro_worker_pay_values for update using (public.plantpro_can_see_wages()) with check (public.plantpro_can_see_wages());
create policy "plantpro wage roles delete pay values" on public.plantpro_worker_pay_values for delete using (public.plantpro_can_see_wages());

delete from public.department_nav_permissions where department = 'plantpro' and role = 'manager' and nav_key in ('/plantpro/hr', '/plantpro/import');
