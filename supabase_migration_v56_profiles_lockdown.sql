-- v56: security — stop exposing staff to the public, and stop people editing their own privileges.
--
--   * profiles could be read by anyone holding the public (anon) key. Now signed-in users only.
--   * profiles' update policy let a person change ANY of their own columns, including is_active and
--     role. A trigger now rejects those two changes unless they come from the server's service key
--     (which is how Access Control changes them; auth.uid() is null for it).

drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
create policy "profiles_read_signed_in" on public.profiles
  for select to authenticated using (true);

create or replace function public.profiles_protect_privileged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.is_active is distinct from old.is_active or new.role is distinct from old.role) then
    raise exception 'That field can only be changed by an administrator through Access Control';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.profiles_protect_privileged();

revoke execute on function public.profiles_protect_privileged() from public, anon, authenticated;
