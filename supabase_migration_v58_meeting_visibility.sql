-- v58: Meetings — a person sees a meeting only if they are in it (attendee, leader or creator),
-- unless they are a Meetings admin. Everything that belongs to a meeting follows it.
--
-- Before: anyone with Meetings access could open every meeting. Now:
--   * mtg_meetings                       visible to its attendees, leader, creator, and Meetings admins
--   * rows with a meeting_id             (headlines, to-dos, issues, priorities, agenda, runs, summaries,
--                                         documents, whiteboards, contacts, prep sessions) follow the meeting
--   * to-dos / issues / priorities / headlines / KPIs  are also visible to their owner, so "my to-dos"
--     still lists what is assigned to me even from a meeting I am not in
--   * KPIs and their numbers / goals / notes follow the meetings the KPI is linked to
--   * rows with no meeting (general documents, etc.) stay visible to everyone with Meetings access

create or replace function public.mtg_can_see_meeting(mid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_dept_access('meetings') and (
    public.is_dept_admin('meetings')
    or exists (select 1 from public.mtg_attendees a where a.meeting_id = mid and a.user_id = auth.uid())
    or exists (select 1 from public.mtg_meetings m where m.id = mid and (m.leader_id = auth.uid() or m.created_by = auth.uid()))
  );
$$;

create or replace function public.mtg_can_see_kpi(kid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_dept_access('meetings') and (
    public.is_dept_admin('meetings')
    or exists (select 1 from public.mtg_kpis k where k.id = kid and (k.owner_id = auth.uid() or (k.meeting_id is not null and public.mtg_can_see_meeting(k.meeting_id))))
    or exists (select 1 from public.mtg_kpi_meetings km where km.kpi_id = kid and public.mtg_can_see_meeting(km.meeting_id))
  );
$$;

create or replace function public.mtg_can_see_run(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.mtg_runs r where r.id = rid and public.mtg_can_see_meeting(r.meeting_id));
$$;

revoke execute on function public.mtg_can_see_meeting(uuid), public.mtg_can_see_kpi(uuid), public.mtg_can_see_run(uuid) from public, anon;
grant execute on function public.mtg_can_see_meeting(uuid), public.mtg_can_see_kpi(uuid), public.mtg_can_see_run(uuid) to authenticated;

-- ---------------------------------------------------------------- the meetings themselves
drop policy if exists "mtg_all_access" on public.mtg_meetings;
create policy "mtg_meeting_visibility" on public.mtg_meetings
  for all
  using (public.mtg_can_see_meeting(id) or (public.has_dept_access('meetings') and (created_by = auth.uid() or leader_id = auth.uid())))
  with check (
    public.has_dept_access('meetings')
    and (public.is_dept_admin('meetings') or created_by = auth.uid() or leader_id = auth.uid())
  );

-- ---------------------------------------------------------------- things that hang off one meeting
do $$
declare t text;
begin
  foreach t in array array['mtg_agenda_items','mtg_attendees','mtg_meeting_contacts','mtg_runs','mtg_summaries'] loop
    execute format('drop policy if exists "mtg_all_access" on public.%I', t);
    execute format('create policy "mtg_follows_meeting" on public.%I for all using (public.mtg_can_see_meeting(meeting_id)) with check (public.mtg_can_see_meeting(meeting_id))', t);
  end loop;
  -- optional meeting: rows with no meeting stay open to everyone with Meetings access
  foreach t in array array['mtg_documents','mtg_whiteboards','mtg_prep_sessions'] loop
    execute format('drop policy if exists "mtg_all_access" on public.%I', t);
    execute format($f$create policy "mtg_follows_meeting" on public.%I for all
      using ((meeting_id is null and public.has_dept_access('meetings')) or (meeting_id is not null and public.mtg_can_see_meeting(meeting_id)))
      with check ((meeting_id is null and public.has_dept_access('meetings')) or (meeting_id is not null and public.mtg_can_see_meeting(meeting_id)))$f$, t);
  end loop;
  -- also visible to the person who owns the item
  foreach t in array array['mtg_headlines','mtg_todos','mtg_issues','mtg_goals'] loop
    execute format('drop policy if exists "mtg_all_access" on public.%I', t);
    execute format('create policy "mtg_follows_meeting" on public.%I for all using (public.mtg_can_see_meeting(meeting_id) or (owner_id = auth.uid() and public.has_dept_access(''meetings''))) with check (public.mtg_can_see_meeting(meeting_id) or (owner_id = auth.uid() and public.has_dept_access(''meetings'')))', t);
  end loop;
end $$;

-- ratings follow the meeting run
drop policy if exists "mtg_all_access" on public.mtg_ratings;
create policy "mtg_follows_meeting" on public.mtg_ratings
  for all using (public.mtg_can_see_run(run_id)) with check (public.mtg_can_see_run(run_id));

-- ---------------------------------------------------------------- KPIs
drop policy if exists "mtg_all_access" on public.mtg_kpis;
create policy "mtg_kpi_visibility" on public.mtg_kpis
  for all
  using (public.mtg_can_see_kpi(id) or (public.has_dept_access('meetings') and owner_id = auth.uid()))
  with check (
    public.has_dept_access('meetings')
    and (public.is_dept_admin('meetings') or owner_id = auth.uid() or (meeting_id is not null and public.mtg_can_see_meeting(meeting_id)))
  );

drop policy if exists "mtg_all_access" on public.mtg_kpi_meetings;
create policy "mtg_kpi_meetings_visibility" on public.mtg_kpi_meetings
  for all
  using (public.mtg_can_see_meeting(meeting_id) or public.mtg_can_see_kpi(kpi_id))
  with check (public.mtg_can_see_meeting(meeting_id));

do $$
declare t text;
begin
  foreach t in array array['mtg_kpi_values','mtg_kpi_goals','mtg_kpi_notes'] loop
    execute format('drop policy if exists "mtg_all_access" on public.%I', t);
    execute format('create policy "mtg_follows_kpi" on public.%I for all using (public.mtg_can_see_kpi(kpi_id)) with check (public.mtg_can_see_kpi(kpi_id))', t);
  end loop;
end $$;
