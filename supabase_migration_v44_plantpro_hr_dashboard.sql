-- v44: HR dashboard support.
--
-- plantpro_month_hours(p_month) returns, per active worker, that month's
-- actual hours split by day type (normal / Sunday / public holiday) plus the
-- supervisor-planned ("forecast") OT. Same rules as the Timesheet page:
-- a day with no timesheet row counts 8 basic hours on a normal day and 0 on
-- Sundays/holidays; a holiday beats a Sunday. SECURITY INVOKER, so RLS of the
-- caller applies. Salary itself is computed in the app from these hours and
-- the (HR/admin-only) pay values.
--
-- Also gives the 'hr' role the /plantpro/dashboard nav entry (managers
-- deliberately don't get it — it shows salary totals; admin sees everything).
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. Local record, as v2..v43.

create or replace function public.plantpro_month_hours(p_month text)
returns table (
  worker_id bigint, line text,
  basic_normal numeric, ot_normal numeric, basic_sunday numeric, ot_sunday numeric,
  basic_holiday numeric, ot_holiday numeric, planned_ot numeric
)
language sql stable security invoker set search_path to 'public' as $$
  with days as (
    select d::date as dt, to_char(d, 'DD') as dd,
      case when exists (select 1 from plantpro_holidays h where h.date = d::date) then 'holiday'
           when extract(dow from d) = 0 then 'sunday' else 'normal' end as dtype
    from generate_series((p_month || '-01')::date, ((p_month || '-01')::date + interval '1 month - 1 day')::date, interval '1 day') d
  ),
  w as (select id, line from plantpro_workers where status <> 'Inactive'),
  ts as (
    select w.id as wid, w.line, days.dtype,
      coalesce(t.basic, case when days.dtype = 'normal' then 8 else 0 end) as basic,
      coalesce(t.ot, 0) as ot
    from w cross join days
    left join plantpro_timesheet_days t on t.worker_id = w.id and t.month = p_month and t.day = days.dd
  ),
  agg as (
    select wid, line,
      coalesce(sum(basic) filter (where dtype = 'normal'), 0) as bn, coalesce(sum(ot) filter (where dtype = 'normal'), 0) as otn,
      coalesce(sum(basic) filter (where dtype = 'sunday'), 0) as bs, coalesce(sum(ot) filter (where dtype = 'sunday'), 0) as os,
      coalesce(sum(basic) filter (where dtype = 'holiday'), 0) as bh, coalesce(sum(ot) filter (where dtype = 'holiday'), 0) as oh
    from ts group by wid, line
  ),
  planned as (
    select m.worker_id as wid, sum(od.ot) as pot
    from plantpro_ot_months m join plantpro_ot_days od on od.ot_month_id = m.id
    where m.month = p_month group by m.worker_id
  )
  select agg.wid, agg.line, agg.bn, agg.otn, agg.bs, agg.os, agg.bh, agg.oh, coalesce(planned.pot, 0)
  from agg left join planned on planned.wid = agg.wid;
$$;

insert into public.department_nav_permissions (department, role, nav_key) values ('plantpro', 'hr', '/plantpro/dashboard');
