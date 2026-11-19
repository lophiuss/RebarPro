-- v70: Link DLER people to AlphaVision logins (profiles).
-- Every login/access person appears in the DLER Org Chart as STAFF; people added
-- manually (no login yet) can be linked to a login later via profile_id.

alter table public.dler_people
  add column if not exists profile_id uuid unique references public.profiles(id) on delete set null;

-- Seed one STAFF row per login that is not linked yet.
insert into public.dler_people (person_type, emp_no, name, designation, status, profile_id)
select
  'STAFF',
  'USR-' || substr(p.id::text, 1, 8),
  coalesce(nullif(trim(p.full_name), ''), nullif(trim(u.email), ''), 'USR-' || substr(p.id::text, 1, 8)),
  null,
  case when p.is_active then 'Active' else 'Inactive' end,
  p.id
from public.profiles p
left join auth.users u on u.id = p.id
where not exists (select 1 from public.dler_people dp where dp.profile_id = p.id)
on conflict (person_type, emp_no) do nothing;
