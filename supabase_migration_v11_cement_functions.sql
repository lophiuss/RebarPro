-- v11: cement report/dashboard functions + weighbridge photo storage bucket
--
-- Applied live to jiltqrunlpewqkofzulz via MCP during the cement-merge session
-- (as separate migrations: cement_silo_stock_function, cement_uploads_bucket,
-- cement_report_functions, cement_variance_alert_function_fix2). This file is
-- the local record of that already-applied state, matching the v2..v10
-- convention of keeping a paper trail of schema changes in this repo.
--
-- All four functions are `security definer` and self-gate on
-- has_dept_access('cement') so PostgREST's default 1000-row cap can't
-- silently truncate aggregate queries computed client-side.

-- Current silo stock, driven off the last stock take + everything after it.
create or replace function public.cement_silo_stock()
returns table(
  plant text, silo_id integer, silo text, material text,
  capacity numeric, display_order integer, bg_color text, current_stock numeric
)
language sql stable security definer set search_path to 'public'
as $$
  with last_closing as (
    select silo_id, take_date as closing_date, actual_stock as closing_stock
    from (
      select dst.silo_id, dst.take_date, dst.actual_stock,
             row_number() over (partition by dst.silo_id order by dst.take_date desc) as rn
      from cement_daily_stock_take dst
      where dst.take_date <= current_date
    ) x
    where rn = 1
  ),
  incoming_after as (
    select wi.silo_id, sum(wi.weight_in - wi.weight_out) as incoming
    from cement_weight_in wi
    left join last_closing lc on lc.silo_id = wi.silo_id
    where wi.weight_out is not null
      and (lc.closing_date is null or wi.weigh_date > lc.closing_date)
    group by wi.silo_id
  ),
  usage_after as (
    select du.silo_id, sum(du.usage) as usage
    from cement_daily_usage du
    left join last_closing lc on lc.silo_id = du.silo_id
    where lc.closing_date is null or du.usage_date > lc.closing_date
    group by du.silo_id
  ),
  transfer_out as (
    select t.from_silo_id as silo_id, sum(t.quantity) as transfer_out
    from cement_transfers t
    left join last_closing lc on lc.silo_id = t.from_silo_id
    where lc.closing_date is null or t.transfer_date > lc.closing_date
    group by t.from_silo_id
  ),
  transfer_in as (
    select t.to_silo_id as silo_id, sum(t.quantity) as transfer_in
    from cement_transfers t
    left join last_closing lc on lc.silo_id = t.to_silo_id
    where lc.closing_date is null or t.transfer_date > lc.closing_date
    group by t.to_silo_id
  )
  select
    p.name as plant, s.id as silo_id, s.name as silo, m.name as material, s.capacity,
    s.display_order, s.bg_color,
    round(
      coalesce(lc.closing_stock, 0) + coalesce(i.incoming, 0) - coalesce(u.usage, 0)
      - coalesce(t_out.transfer_out, 0) + coalesce(t_in.transfer_in, 0)
    , 2) as current_stock
  from cement_silos s
  join cement_plants p on p.id = s.plant_id
  left join cement_silo_materials sm on sm.silo_id = s.id
  left join cement_materials m on m.id = sm.material_id
  left join last_closing lc on lc.silo_id = s.id
  left join incoming_after i on i.silo_id = s.id
  left join usage_after u on u.silo_id = s.id
  left join transfer_out t_out on t_out.silo_id = s.id
  left join transfer_in t_in on t_in.silo_id = s.id
  where s.is_active = true and (select public.has_dept_access('cement'))
  order by s.display_order asc, p.name asc, s.name asc;
$$;

-- Day-by-day theoretical-vs-actual report.
create or replace function public.cement_daily_report(from_date date, to_date date)
returns table(
  report_date date, plant_name text, silo_id integer, silo_name text, material_name text,
  unit_name text, incoming numeric, usage numeric, transfer_in numeric, transfer_out numeric,
  actual_stock numeric, yesterday_actual numeric, theoretical numeric, variance numeric,
  variance_pct numeric, status text
)
language sql stable security definer set search_path to 'public'
as $$
  with dates as (
    select take_date as d from cement_daily_stock_take where take_date between from_date and to_date
    union
    select usage_date from cement_daily_usage where usage_date between from_date and to_date
    union
    select weigh_date from cement_weight_in where weight_out is not null and weigh_date between from_date and to_date
    union
    select transfer_date from cement_transfers where transfer_date between from_date and to_date
  ),
  base as (
    select
      d.d as report_date,
      p.name as plant_name,
      s.id as silo_id,
      s.name as silo_name,
      m.name as material_name,
      un.name as unit_name,
      coalesce(sum(wi.weight_in - wi.weight_out), 0) as incoming,
      coalesce(max(du.usage), 0) as usage,
      coalesce(max(tin.val), 0) as transfer_in,
      coalesce(max(tout.val), 0) as transfer_out,
      max(dst.actual_stock) as actual_stock,
      (
        select dst2.actual_stock from cement_daily_stock_take dst2
        where dst2.silo_id = s.id and dst2.take_date < d.d
        order by dst2.take_date desc limit 1
      ) as yesterday_actual
    from dates d
    cross join cement_silos s
    join cement_plants p on p.id = s.plant_id
    left join cement_silo_material_history smh on smh.silo_id = s.id
      and smh.effective_from = (
        select max(smh2.effective_from) from cement_silo_material_history smh2
        where smh2.silo_id = s.id and smh2.effective_from <= d.d
      )
    left join cement_materials m on m.id = smh.material_id
    left join cement_units un on un.id = m.unit_id
    left join cement_weight_in wi on wi.silo_id = s.id and wi.weigh_date = d.d and wi.weight_out is not null
    left join cement_daily_usage du on du.silo_id = s.id and du.usage_date = d.d
    left join cement_daily_stock_take dst on dst.silo_id = s.id and dst.take_date = d.d
    left join (select transfer_date, to_silo_id, sum(quantity) val from cement_transfers group by transfer_date, to_silo_id) tin
      on tin.transfer_date = d.d and tin.to_silo_id = s.id
    left join (select transfer_date, from_silo_id, sum(quantity) val from cement_transfers group by transfer_date, from_silo_id) tout
      on tout.transfer_date = d.d and tout.from_silo_id = s.id
    where s.is_active = true and (select public.has_dept_access('cement'))
    group by d.d, p.name, s.id, s.name, m.name, un.name
  ),
  calc as (
    select *,
      case when yesterday_actual is null then null
           else greatest(yesterday_actual + incoming - usage + transfer_in - transfer_out, 0)
      end as raw_theoretical,
      case when yesterday_actual is not null and (yesterday_actual + incoming - usage + transfer_in - transfer_out) < 0
           then 'OVER USAGE' else 'OK' end as status
    from base
  )
  select
    report_date, plant_name, silo_id, silo_name, material_name, unit_name,
    incoming, usage, transfer_in, transfer_out, actual_stock, yesterday_actual,
    raw_theoretical as theoretical,
    case when status = 'OVER USAGE' or raw_theoretical is null or actual_stock is null then null
         else raw_theoretical - actual_stock end as variance,
    case when status = 'OVER USAGE' or raw_theoretical is null or actual_stock is null then null
         when raw_theoretical > 0 then (raw_theoretical - actual_stock) / raw_theoretical * 100
         when (raw_theoretical - actual_stock) <> 0 then null
         else 0 end as variance_pct,
    status
  from calc
  order by report_date desc, plant_name, silo_name;
$$;

-- Month-by-month rollup of the same theoretical-vs-actual comparison.
create or replace function public.cement_monthly_report(from_date date, to_date date)
returns table(
  report_month text, plant_name text, silo_id integer, silo_name text, material_name text,
  unit_name text, incoming numeric, usage numeric, actual_stock numeric, yesterday_actual numeric,
  theoretical numeric, variance numeric, variance_pct numeric
)
language sql stable security definer set search_path to 'public'
as $$
  with range_dates as (
    select take_date as d from cement_daily_stock_take where take_date between from_date and to_date
    union
    select usage_date from cement_daily_usage where usage_date between from_date and to_date
    union
    select weigh_date from cement_weight_in where weight_out is not null and weigh_date between from_date and to_date
  ),
  months as (
    select distinct to_char(d, 'YYYY-MM') as month from range_dates
  ),
  monthly_incoming as (
    select to_char(weigh_date,'YYYY-MM') as month, silo_id, sum(weight_in - weight_out) as incoming
    from cement_weight_in where weight_out is not null and weigh_date between from_date and to_date
    group by 1,2
  ),
  monthly_usage as (
    select to_char(usage_date,'YYYY-MM') as month, silo_id, sum(usage) as usage
    from cement_daily_usage where usage_date between from_date and to_date
    group by 1,2
  ),
  monthly_closing as (
    select distinct on (to_char(dst.take_date,'YYYY-MM'), dst.silo_id)
      to_char(dst.take_date,'YYYY-MM') as month, dst.silo_id, dst.actual_stock
    from cement_daily_stock_take dst
    where dst.take_date between from_date and to_date
    order by to_char(dst.take_date,'YYYY-MM'), dst.silo_id, dst.take_date desc
  ),
  base as (
    select
      m.month as report_month,
      p.name as plant_name,
      s.id as silo_id,
      s.name as silo_name,
      mat.name as material_name,
      u.name as unit_name,
      coalesce(inc.incoming,0) as incoming,
      coalesce(usg.usage,0) as usage,
      mc.actual_stock,
      (
        select dst2.actual_stock from cement_daily_stock_take dst2
        where dst2.silo_id = s.id and to_char(dst2.take_date,'YYYY-MM') < m.month
        order by dst2.take_date desc limit 1
      ) as yesterday_actual
    from months m
    cross join cement_silos s
    join cement_plants p on p.id = s.plant_id
    left join cement_silo_material_history smh on smh.silo_id = s.id
      and smh.effective_from = (
        select max(smh2.effective_from) from cement_silo_material_history smh2
        where smh2.silo_id = s.id and smh2.effective_from <= (m.month || '-28')::date
      )
    left join cement_materials mat on mat.id = smh.material_id
    left join cement_units u on u.id = mat.unit_id
    left join monthly_incoming inc on inc.silo_id = s.id and inc.month = m.month
    left join monthly_usage usg on usg.silo_id = s.id and usg.month = m.month
    left join monthly_closing mc on mc.silo_id = s.id and mc.month = m.month
    where s.is_active = true and (select public.has_dept_access('cement'))
  ),
  calc as (
    select *,
      case when yesterday_actual is null then null
           else yesterday_actual + incoming - usage end as theoretical
    from base
  )
  select
    report_month, plant_name, silo_id, silo_name, material_name, unit_name,
    incoming, usage, actual_stock, yesterday_actual, theoretical,
    case when theoretical is null or actual_stock is null then null else theoretical - actual_stock end as variance,
    case when theoretical is null or actual_stock is null then null
         when theoretical > 0 then (theoretical - actual_stock) / theoretical * 100
         when (theoretical - actual_stock) <> 0 then null
         else 0 end as variance_pct
  from calc
  order by report_month desc, plant_name, silo_name;
$$;

-- Called once per day (after all silos are closed) to detect variance breaches
-- and record new alert rows; the Edge Function `send-variance-alerts` emails
-- whatever this returns.
create or replace function public.cement_process_daily_closing(check_date date)
returns table(plant_name text, material_name text, variance_pct numeric)
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_threshold numeric;
  v_manager_email text;
  v_all_closed boolean;
begin
  if not public.has_dept_access('cement') then
    return;
  end if;

  select variance_threshold_pct, manager_email into v_threshold, v_manager_email
  from cement_alert_settings where id = 1;

  if v_manager_email is null then
    return;
  end if;

  select not exists (
    select 1 from cement_silos s
    where s.is_active = true
      and not exists (
        select 1 from cement_daily_stock_take dst where dst.silo_id = s.id and dst.take_date = check_date
      )
  ) into v_all_closed;

  if not v_all_closed then
    return;
  end if;

  return query
  with per_silo as (
    select
      s.id as silo_id,
      p.name as psn_plant_name,
      m.name as psn_material_name,
      dst.actual_stock as psn_actual_stock,
      (
        select dst2.actual_stock from cement_daily_stock_take dst2
        where dst2.silo_id = s.id and dst2.take_date < check_date
        order by dst2.take_date desc limit 1
      ) as psn_yesterday_actual,
      coalesce(du.usage, 0) as psn_usage,
      coalesce(sum(wi.weight_in - wi.weight_out), 0) as psn_incoming
    from cement_silos s
    join cement_plants p on p.id = s.plant_id
    left join cement_silo_materials sm on sm.silo_id = s.id
    left join cement_materials m on m.id = sm.material_id
    left join cement_daily_stock_take dst on dst.silo_id = s.id and dst.take_date = check_date
    left join cement_daily_usage du on du.silo_id = s.id and du.usage_date = check_date
    left join cement_weight_in wi on wi.silo_id = s.id and wi.weigh_date = check_date and wi.weight_out is not null
    where s.is_active = true
    group by s.id, p.name, m.name, dst.actual_stock, du.usage
  ),
  calc as (
    select ps.*, (ps.psn_yesterday_actual + ps.psn_incoming - ps.psn_usage) as psn_theoretical
    from per_silo ps
    where ps.psn_material_name is not null and ps.psn_yesterday_actual is not null and ps.psn_actual_stock is not null
  ),
  flagged as (
    select c.psn_plant_name, c.psn_material_name,
      abs((c.psn_theoretical - c.psn_actual_stock) / c.psn_theoretical * 100) as psn_variance_pct
    from calc c
    where c.psn_theoretical > 0
  ),
  over_threshold as (
    select * from flagged f where f.psn_variance_pct > v_threshold
  ),
  new_alerts as (
    select distinct ot.psn_plant_name, ot.psn_material_name, ot.psn_variance_pct from over_threshold ot
    where not exists (
      select 1 from cement_alert_log al
      where al.alert_date = check_date and al.plant_name = ot.psn_plant_name and al.material_name = ot.psn_material_name
    )
  )
  insert into cement_alert_log (alert_date, plant_name, material_name, variance_pct)
  select check_date, na.psn_plant_name, na.psn_material_name, round(na.psn_variance_pct, 2) from new_alerts na
  returning cement_alert_log.plant_name, cement_alert_log.material_name, cement_alert_log.variance_pct;
end;
$$;

-- Private storage bucket for weighbridge photos, scoped to cement members.
insert into storage.buckets (id, name, public)
values ('cement-uploads', 'cement-uploads', false)
on conflict (id) do nothing;

create policy "cement members can upload weighbridge photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'cement-uploads' and has_dept_access('cement'));

create policy "cement members can view weighbridge photos"
on storage.objects for select to authenticated
using (bucket_id = 'cement-uploads' and has_dept_access('cement'));
