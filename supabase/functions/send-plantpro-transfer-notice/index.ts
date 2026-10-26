// Deployed as `send-plantpro-transfer-notice`, verify_jwt: true.
//
// When a manager/admin transfers a worker to another supervisor on PlantPro > OT, HR is e-mailed so
// they can update their records. Recipients = every user with the `hr` role in the plantpro department.
//
// Body: { worker_id: number, from_supervisor_id: number | null, to_supervisor_id: number, effective_date: string (YYYY-MM-DD) }
// Needs the same secrets as the other mail functions: ALERT_EMAIL_USER / ALERT_EMAIL_PASS.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "Not signed in" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Only a PlantPro manager/admin can trigger this.
    const { data: access } = await admin.from("user_department_access").select("role")
      .eq("user_id", user.id).eq("department", "plantpro").maybeSingle();
    if (!access || !["admin", "manager"].includes(access.role)) return json({ error: "Not allowed" }, 403);

    const body = await req.json();
    const workerId = Number(body.worker_id);
    const toId = Number(body.to_supervisor_id);
    const fromId = body.from_supervisor_id == null ? null : Number(body.from_supervisor_id);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.effective_date)) ? String(body.effective_date) : "";
    if (!workerId || !toId || !date) return json({ error: "Missing details" }, 400);

    const [{ data: worker }, { data: toSup }, { data: fromSup }, { data: sender }, { data: hrRows }] = await Promise.all([
      admin.from("plantpro_workers").select("name, worker_no, line").eq("id", workerId).maybeSingle(),
      admin.from("plantpro_supervisors").select("name").eq("id", toId).maybeSingle(),
      fromId ? admin.from("plantpro_supervisors").select("name").eq("id", fromId).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      admin.from("user_department_access").select("user_id").eq("department", "plantpro").eq("role", "hr"),
    ]);
    if (!worker || !toSup) return json({ error: "Worker or supervisor not found" }, 404);

    const emails: string[] = [];
    for (const r of hrRows ?? []) {
      const { data: u } = await admin.auth.admin.getUserById(r.user_id as string);
      const e = u?.user?.email?.trim().toLowerCase();
      if (e && !emails.includes(e)) emails.push(e);
    }
    if (emails.length === 0) return json({ ok: true, sent: 0, note: "No HR users to notify" });

    const mailUser = Deno.env.get("ALERT_EMAIL_USER");
    const pass = Deno.env.get("ALERT_EMAIL_PASS");
    if (!mailUser || !pass) return json({ error: "ALERT_EMAIL_USER/ALERT_EMAIL_PASS secrets not set" }, 500);

    const senderName = sender?.full_name ?? user.email ?? "A manager";
    const row = (k: string, v: string) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b">${k}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`;
    const html = `<div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:#1e3a8a;padding:20px 28px"><div style="font-size:22px;font-weight:700;color:#ffffff">AlphaVision &middot; PlantPro</div></div><div style="padding:28px;font-size:14px;line-height:1.6"><p style="margin:0 0 14px"><b>${esc(senderName)}</b> transferred a worker to another supervisor from the OT &amp; Allocation page. Please update HR records if needed.</p><table style="border-collapse:collapse;font-size:14px">${row("Worker", `${worker.name}${worker.worker_no ? ` (${worker.worker_no})` : ""}`)}${row("From supervisor", fromSup?.name ?? "—")}${row("To supervisor", toSup.name)}${row("Effective from", date)}${worker.line ? row("Department", worker.line) : ""}</table><p style="margin:16px 0 0;color:#94a3b8;font-size:12px">This is also recorded in HR &rsaquo; Worker Movement.</p></div></div></div>`;

    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: mailUser, pass } });
    await transporter.sendMail({
      from: `"AlphaVision" <${mailUser}>`, to: emails,
      subject: `Worker transfer: ${worker.name} → ${toSup.name}`, html,
    });
    return json({ ok: true, sent: emails.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
