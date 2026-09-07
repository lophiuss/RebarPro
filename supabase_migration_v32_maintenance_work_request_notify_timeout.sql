-- v32: fixes the Work Request email notification actually sending.
--
-- With ALERT_EMAIL_USER/ALERT_EMAIL_PASS now set (the user configured them
-- after v30/v31), the trigger's net.http_post to the Edge Function was
-- still failing — not with the function's own error response, but with
-- pg_net's own request timing out: "Timeout of 5000 ms reached." pg_net
-- defaults to a 5-second timeout, and the Gmail SMTP handshake + send via
-- nodemailer routinely takes longer than that (cold start + SMTP round
-- trip), so the trigger's call was killed before the function could ever
-- respond — even though sending the email itself would likely have
-- succeeded given more time.
--
-- Fix: pass timeout_milliseconds := 15000 to net.http_post. Verified live —
-- a test insert got back {"sent":1,...} within the new timeout, versus the
-- prior timeout error.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v31 convention.

create or replace function public.maintenance_notify_new_work_request()
returns trigger
language plpgsql
security definer
set search_path = public
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
    ),
    timeout_milliseconds := 15000
  );
  return new;
end;
$$;

-- Same fix applied to Cement's daily alert job — it hits the exact same
-- Edge Function pattern (nodemailer + Gmail) with the exact same missing
-- timeout, so it was equally broken now that the shared secrets are set.
create or replace function public.cement_run_daily_alert_job()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerts jsonb;
  v_secret text;
  v_report_date date := (current_date - 1);
begin
  select jsonb_agg(row_to_json(t)) into v_alerts
  from public.cement_daily_alert_job(v_report_date) t;

  if v_alerts is null or jsonb_array_length(v_alerts) = 0 then
    return;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'cement_cron_shared_secret';

  if v_secret is null then
    raise warning 'cement_run_daily_alert_job: cement_cron_shared_secret not found in Vault, skipping email send';
    return;
  end if;

  perform net.http_post(
    url := 'https://jiltqrunlpewqkofzulz.supabase.co/functions/v1/send-variance-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('alerts', v_alerts),
    timeout_milliseconds := 15000
  );
end;
$$;
