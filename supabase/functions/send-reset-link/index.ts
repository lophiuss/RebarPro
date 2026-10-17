// Deployed to jiltqrunlpewqkofzulz as `send-reset-link`, verify_jwt: true.
//
// An administrator (Access Control) sends a person a password-reset e-mail. The e-mail holds a
// one-time link; the person opens it, presses Continue and chooses a new password. Nobody ever
// sees or types their password except the person themself.
//
// Who may do this follows the same rule as the other account actions in Access Control:
//   * the caller must be an admin of at least one department, and
//   * be a super admin, or an admin of EVERY department the person has access to (a person with no
//     access yet is fine), and only a super admin can send one to a super admin.
// Every send is written to the audit log.
//
// Body: { user_id: string, site_url: string }
// Needs the same secrets as the other mail functions: ALERT_EMAIL_USER / ALERT_EMAIL_PASS
// (and optionally ALLOWED_SITE_ORIGINS, comma separated; default https://alphavision-psi.vercel.app).
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

    const body = await req.json();
    const targetId = typeof body.user_id === "string" ? body.user_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: "Choose a person" }, 400);

    // The links in the e-mail always point at the real site. If the admin happens to click from
    // localhost or a preview address, the e-mail still carries the real address: a link to someone's
    // own computer is useless to the person who receives it.
    const allowed = (Deno.env.get("ALLOWED_SITE_ORIGINS") ?? "https://alphavision-psi.vercel.app").split(",").map((x) => x.trim()).filter(Boolean);
    let requested = "";
    try { requested = new URL(String(body.site_url)).origin; } catch { /* use the default */ }
    const origin = allowed.includes(requested) ? requested : allowed[0];

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- who may do this
    const isSuper = async (id: string) => !!(await admin.from("app_super_admins").select("user_id").eq("user_id", id).maybeSingle()).data;
    const [{ data: mine }, { data: theirs }, callerIsSuper, targetIsSuper] = await Promise.all([
      admin.from("user_department_access").select("department").eq("user_id", user.id).eq("role", "admin"),
      admin.from("user_department_access").select("department").eq("user_id", targetId),
      isSuper(user.id),
      isSuper(targetId),
    ]);
    if (!callerIsSuper && (mine ?? []).length === 0) return json({ error: "Only an administrator can send a reset link" }, 403);
    if (targetId !== user.id && !callerIsSuper) {
      if (targetIsSuper) return json({ error: "Only a super admin can reset a super admin's password" }, 403);
      const myDepts = new Set((mine ?? []).map((r) => r.department as string));
      const outside = [...new Set((theirs ?? []).map((r) => r.department as string).filter((d) => !myDepts.has(d)))];
      if (outside.length) return json({ error: `You can't manage this account: it also has access to ${outside.join(", ")}, where you are not an admin. Ask an admin of that department, or a super admin.` }, 403);
    }

    // ---- the person
    const { data: target } = await admin.auth.admin.getUserById(targetId);
    const email = target?.user?.email?.trim().toLowerCase();
    if (!email) return json({ error: "This person has no e-mail address" }, 422);
    const { data: prof } = await admin.from("profiles").select("full_name, is_active").eq("id", targetId).maybeSingle();
    if (prof?.is_active === false) return json({ error: "This account is inactive. Set it to Active first." }, 422);

    const mailUser = Deno.env.get("ALERT_EMAIL_USER");
    const pass = Deno.env.get("ALERT_EMAIL_PASS");
    if (!mailUser || !pass) return json({ error: "ALERT_EMAIL_USER/ALERT_EMAIL_PASS secrets not set" }, 500);

    const link = await admin.auth.admin.generateLink({ type: "recovery", email });
    const hashed = link.data?.properties?.hashed_token;
    if (link.error || !hashed) return json({ error: "Could not create the reset link" }, 500);
    const url = `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=${encodeURIComponent("/auth/set-password")}`;

    const { data: sender } = await caller.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const senderName = sender?.full_name ?? "An administrator";
    const name = prof?.full_name ?? "there";
    const html = `<div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:#1e3a8a;padding:20px 28px"><div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.3px">AlphaVision</div></div><div style="padding:28px;font-size:14px;line-height:1.6"><p style="margin:0 0 12px">Hi ${esc(name)},</p><p style="margin:0 0 16px"><b>${esc(senderName)}</b> sent you a link to choose a new password for your AlphaVision account (${esc(email)}).</p><p style="margin:0 0 18px"><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:8px">Choose a new password</a></p><p style="margin:0 0 10px;color:#475569">The link works once and for a limited time. If it has expired, ask ${esc(senderName)} to send a new one.</p><p style="margin:16px 0 0;color:#94a3b8;font-size:12px">If you didn't expect this e-mail, you can ignore it: your password stays as it is until you use the link.</p></div></div></div>`;

    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: mailUser, pass } });
    await transporter.sendMail({ from: `"AlphaVision" <${mailUser}>`, to: email, subject: "Choose a new AlphaVision password", html });

    // audit_log only accepts insert / update / delete as the action, so the event is named in the data.
    const { error: logErr } = await admin.from("audit_log").insert({ table_name: "account", record_id: targetId, action: "update", new_data: { event: "account.reset_link_sent", email }, changed_by: user.id });
    if (logErr) console.error("audit log failed:", logErr.message); // never undoes the send

    return json({ ok: true, email, name: prof?.full_name ?? null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
