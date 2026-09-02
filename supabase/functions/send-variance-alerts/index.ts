// Deployed to jiltqrunlpewqkofzulz as `send-variance-alerts` (v3), verify_jwt: true.
// Called by the Stock Take / Usage page after cement_process_daily_closing() flags
// new variance alerts, to email the configured manager_email.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    // Verify the caller actually belongs to the cement department before doing
    // anything else — verify_jwt only proves they're *some* signed-in user in
    // this shared Supabase project, not that they have cement access.
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: hasAccess, error: accessErr } = await callerClient.rpc("has_dept_access", { dept: "cement" });
    if (accessErr || !hasAccess) {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { alerts } = await req.json();
    if (!Array.isArray(alerts) || alerts.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await supabase.from("cement_alert_settings").select("manager_email").eq("id", 1).single();
    const managerEmail = settings?.manager_email;
    if (!managerEmail) {
      return new Response(JSON.stringify({ sent: 0, reason: "no manager_email configured" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const mailUser = Deno.env.get("ALERT_EMAIL_USER");
    const pass = Deno.env.get("ALERT_EMAIL_PASS");
    if (!mailUser || !pass) {
      return new Response(JSON.stringify({ error: "ALERT_EMAIL_USER/ALERT_EMAIL_PASS secrets not set" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: mailUser, pass } });
    let sent = 0;
    for (const a of alerts) {
      const plantName = escapeHtml(a.plant_name);
      const materialName = escapeHtml(a.material_name);
      const variancePct = escapeHtml(a.variance_pct);
      await transporter.sendMail({
        from: `"Cement Manager" <${mailUser}>`,
        to: managerEmail,
        subject: `🚨 Variance Alert: ${a.plant_name} - ${a.material_name}`,
        html: `<h3>Variance Alert</h3><p><b>Plant:</b> ${plantName}</p><p><b>Material:</b> ${materialName}</p><p><b>Variance:</b> ${variancePct}%</p><p>This alert was triggered after daily closing.</p>`,
      });
      sent++;
    }
    return new Response(JSON.stringify({ sent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
