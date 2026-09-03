-- v12: combined daily+monthly variance report, sent once a day by cron
-- instead of once per stock-take save.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local record
-- of that state, matching the v2..v11 convention.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.cement_alert_settings add column if not exists monthly_variance_threshold_pct numeric default 5;
alter table public.cement_alert_log add column if not exists alert_type text not null default 'daily' check (alert_type in ('daily','monthly'));

-- See migration cement_alert_revamp_monthly_and_combined_report for the full
-- body: computes daily per-silo variance (same logic cement_process_daily_closing
-- used to run on every save) plus month-to-date cumulative variance, inserts
-- only the *new* breaches into cement_alert_log, and returns them so the
-- caller can send one combined email. Locked to postgres/service_role only —
-- revoked from public/anon/authenticated (see lock_down_cement_daily_alert_job).
--
-- create or replace function public.cement_daily_alert_job(report_date date) ...

-- Wraps the above + the HTTP call to send-variance-alerts. Reads the shared
-- secret from Supabase Vault (name 'cement_cron_shared_secret') rather than
-- embedding it here — see setup note below.
create or replace function public.cement_run_daily_alert_job()
returns void
language plpgsql
security definer
set search_path to 'public'
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
    body := jsonb_build_object('alerts', v_alerts)
  );
end;
$$;

revoke execute on function public.cement_run_daily_alert_job() from public, anon, authenticated;
grant execute on function public.cement_run_daily_alert_job() to postgres;

-- 02:00 UTC = 10:00 Malaysia Time (UTC+8, no DST).
select cron.schedule(
  'cement-daily-alert-report',
  '0 2 * * *',
  $$select public.cement_run_daily_alert_job();$$
);

-- One-time manual setup this migration depends on (not run here — no tool
-- can set Edge Function secrets remotely):
--   1. Store the shared secret in Vault:
--      select vault.create_secret('<random-secret>', 'cement_cron_shared_secret', '...');
--   2. Set the same value as the send-variance-alerts Edge Function's
--      CRON_SHARED_SECRET secret (Dashboard, or `supabase secrets set
--      CRON_SHARED_SECRET=<random-secret>` after `supabase link`).
-- The Edge Function (supabase/functions/send-variance-alerts/index.ts) checks
-- an incoming x-cron-secret header against CRON_SHARED_SECRET as one of two
-- valid callers (the other being a signed-in cement admin/manager's own
-- session, for manual testing) — see that file's top-of-file comment. It's
-- deployed with verify_jwt: false because of this dual-caller design.
