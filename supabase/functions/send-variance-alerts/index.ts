// Deployed to jiltqrunlpewqkofzulz as `send-variance-alerts`, verify_jwt: false.
// verify_jwt is off because this function has two legitimate callers with no
// single JWT that covers both, so authorization is done entirely in code:
//   1. pg_cron, once a day (see cement_run_daily_alert_job() / the
//      "cement-daily-alert-report" cron job) — authenticated via the
//      x-cron-secret header, checked against the CRON_SHARED_SECRET function
//      secret (matches the value stored in Supabase Vault as
//      'cement_cron_shared_secret').
//   2. A signed-in cement admin/manager sending a manual test email from the
//      Alert Setting page — authenticated via their own Supabase session JWT,
//      checked against has_dept_access('cement').
// Every request must satisfy one of the two; anything else is rejected before
// any settings are read or any mail is sent.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SHARED_SECRET");
    const isTrustedCron = !!cronSecret && !!expectedCronSecret && cronSecret === expectedCronSecret;

    if (!isTrustedCron) {
      // Fall back to: a signed-in cement member, verified against their own JWT.
      const authHeader = req.headers.get("Authorization") ?? "";
      const callerClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: userErr } = await callerClient.auth.getUser();
      if (userErr || !user) {
        return json({ error: "Not signed in" }, 401);
      }
      const { data: hasAccess, error: accessErr } = await callerClient.rpc("has_dept_access", { dept: "cement" });
      if (accessErr || !hasAccess) {
        return json({ error: "Not authorized" }, 403);
      }
    }

    const { alerts } = await req.json();
    if (!Array.isArray(alerts) || alerts.length === 0) {
      return json({ sent: 0 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await supabase.from("cement_alert_settings").select("manager_email").eq("id", 1).single();
    const managerEmail = settings?.manager_email;
    if (!managerEmail) {
      return json({ sent: 0, reason: "no manager_email configured" });
    }
    const mailUser = Deno.env.get("ALERT_EMAIL_USER");
    const pass = Deno.env.get("ALERT_EMAIL_PASS");
    if (!mailUser || !pass) {
      return json({ error: "ALERT_EMAIL_USER/ALERT_EMAIL_PASS secrets not set" }, 500);
    }

    // One combined email per run — never one email per breach.
    const daily = alerts.filter((a: any) => (a.alert_type ?? "daily") === "daily");
    const monthly = alerts.filter((a: any) => a.alert_type === "monthly");

    const row = (a: any) => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(a.plant_name)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(a.material_name)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#dc2626;">${escapeHtml(a.variance_pct)}%</td>
    </tr>`;

    const section = (title: string, rows: any[]) => rows.length === 0 ? "" : `
      <h3 style="margin:20px 0 8px;font-size:14px;color:#111827;">${escapeHtml(title)}</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead><tr style="background:#f9fafb;">
          <th style="padding:6px 10px;text-align:left;">Plant</th>
          <th style="padding:6px 10px;text-align:left;">Material</th>
          <th style="padding:6px 10px;text-align:right;">Variance</th>
        </tr></thead>
        <tbody>${rows.map(row).join("")}</tbody>
      </table>`;

    const html = `
      <h2 style="margin:0 0 4px;">🚨 Cement Variance Report</h2>
      <p style="color:#6b7280;font-size:13px;margin:0 0 8px;">Based on the stock take closing before this morning's report.</p>
      ${section("Daily variance", daily)}
      ${section("Monthly variance (month-to-date)", monthly)}
    `;

    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: mailUser, pass } });
    await transporter.sendMail({
      from: `"Cement Manager" <${mailUser}>`,
      to: managerEmail,
      subject: `🚨 Cement Variance Report — ${daily.length} daily, ${monthly.length} monthly`,
      html,
    });

    return json({ sent: 1, daily: daily.length, monthly: monthly.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
