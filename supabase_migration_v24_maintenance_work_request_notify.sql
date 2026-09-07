-- v24: Work Request notifications — fires immediately on every insert.
--
-- Reuses the exact secret/email infrastructure already set up for Cement's
-- variance alerts (cement_cron_shared_secret in Vault, ALERT_EMAIL_USER/
-- ALERT_EMAIL_PASS Edge Function secrets are project-wide, so no new manual
-- setup was needed) — just a new AFTER INSERT trigger instead of a cron
-- schedule, since "every time a work request is filed" is event-driven, not
-- periodic. Paired with the send-maintenance-work-request-alert Edge
-- Function (deployed via MCP, not tracked in this repo — see
-- supabase/functions/ conventions).
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v23 convention.

alter table public.maintenance_settings add column if not exists manager_email text;

create or replace function public.maintenance_notify_new_work_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'cement_cron_shared_secret';

  if v_secret is null then
    raise warning 'maintenance_notify_new_work_request: cement_cron_shared_secret not found in Vault, skipping email send';
    return new;
  end if;

  perform net.http_post(
    url := 'https://jiltqrunlpewqkofzulz.supabase.co/functions/v1/send-maintenance-work-request-alert',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object(
      'id', new.id,
      'requester_name', new.requester_name,
      'requester_contact', new.requester_contact,
      'location', new.location,
      'issue_description', new.issue_description,
      'created_at', new.created_at
    )
  );
  return new;
end;
$$;

revoke execute on function public.maintenance_notify_new_work_request() from public, anon, authenticated;

create trigger maintenance_work_request_notify
  after insert on public.maintenance_work_requests
  for each row execute function public.maintenance_notify_new_work_request();

-- Verified end-to-end: inserted a test row with no manager_email configured
-- yet, confirmed via net._http_response that the Edge Function was called
-- and replied {"sent":0,"reason":"no manager_email configured..."} — proves
-- the trigger -> HTTP call -> function wiring works without sending an
-- unsolicited real email. Configure the real recipient(s) in
-- Maintenance > Settings > Work Request Notifications.
