// Deployed to jiltqrunlpewqkofzulz as `send-meeting-summary`, verify_jwt: true.
// Every caller is a signed-in user (no cron/webhook path), so the gateway checks
// the JWT, and the code additionally requires has_dept_access('meetings') on the
// caller's own session.
// All summary reads go through the caller's client, so RLS applies. The service
// role is used only to look up attendee e-mail addresses (auth.users) and to
// stamp mtg_summaries.emailed_at.
//
// Needs the same function secrets as send-variance-alerts:
//   ALERT_EMAIL_USER / ALERT_EMAIL_PASS  (Gmail account + app password)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Named = Record<string, string>;

function listHtml(title: string, items: string[]) {
  if (items.length === 0) return "";
  return `<h3 style="margin:20px 0 6px;font-size:15px">${escapeHtml(title)} (${items.length})</h3><ul style="margin:0;padding-left:20px">${items
    .map((i) => `<li style="margin:3px 0">${i}</li>`)
    .join("")}</ul>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "Not signed in" }, 401);
    const { data: hasAccess, error: accessErr } = await caller.rpc("has_dept_access", { dept: "meetings" });
    if (accessErr || !hasAccess) return json({ error: "Not authorized" }, 403);

    const { summary_id, include_details = true, include_notes = false } = await req.json();
    if (typeof summary_id !== "string") return json({ error: "summary_id is required" }, 400);

    const { data: summary, error: sumErr } = await caller
      .from("mtg_summaries")
      .select("id, meeting_id, average_rating, created_at, snapshot, meeting:mtg_meetings(name)")
      .eq("id", summary_id)
      .single();
    if (sumErr || !summary) return json({ error: "Summary not found" }, 404);

    const mailUser = Deno.env.get("ALERT_EMAIL_USER");
    const pass = Deno.env.get("ALERT_EMAIL_PASS");
    if (!mailUser || !pass) return json({ error: "ALERT_EMAIL_USER/ALERT_EMAIL_PASS secrets not set" }, 500);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: attendees } = await caller.from("mtg_attendees").select("user_id").eq("meeting_id", summary.meeting_id);
    const ids = (attendees ?? []).map((a: { user_id: string }) => a.user_id);
    const { data: profiles } = await caller.from("profiles").select("id, full_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const names: Named = {};
    for (const p of profiles ?? []) names[p.id] = p.full_name ?? "Someone";

    const emails: string[] = [];
    for (const id of ids) {
      const { data } = await admin.auth.admin.getUserById(id);
      const email = data?.user?.email;
      if (email) emails.push(email);
    }
    if (emails.length === 0) return json({ error: "No attendee e-mail addresses found" }, 422);

    const snap = (summary.snapshot ?? {}) as Record<string, any>;
    const owner = (id: string | null) => (id && names[id] ? ` — ${escapeHtml(names[id])}` : "");
    const meetingName = (summary as any).meeting?.name ?? "Meeting";
    const when = new Date(summary.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" });

    let body = `<h2 style="margin:0 0 4px">${escapeHtml(meetingName)}</h2><div style="color:#555">${escapeHtml(when)}`;
    if (summary.average_rating != null) body += ` · Average rating ${Number(summary.average_rating).toFixed(1)}/10`;
    body += `</div>`;

    body += listHtml("To-dos created", (snap.todos_created ?? []).map((t: any) => `${escapeHtml(t.title)}${owner(t.owner_id)}${t.due_date ? ` (due ${escapeHtml(t.due_date)})` : ""}`));
    body += listHtml("Issues solved", (snap.issues_solved ?? []).map((i: any) => escapeHtml(i.title)));
    if (include_details) {
      body += listHtml("Headlines", (snap.headlines ?? []).map((h: any) => `${escapeHtml(h.title)}${owner(h.owner_id)}`));
      body += listHtml("To-dos completed", (snap.todos_completed ?? []).map((t: any) => `${escapeHtml(t.title)}${owner(t.owner_id)}`));
      body += listHtml("Open to-dos", (snap.todos_open ?? []).map((t: any) => `${escapeHtml(t.title)}${owner(t.owner_id)}${t.due_date ? ` (due ${escapeHtml(t.due_date)})` : ""}`));
    }
    if (include_notes && snap.notes) {
      body += `<h3 style="margin:20px 0 6px;font-size:15px">Meeting notes</h3><div style="white-space:pre-wrap">${escapeHtml(snap.notes)}</div>`;
    }

    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: mailUser, pass } });
    await transporter.sendMail({
      from: `"Meetings" <${mailUser}>`,
      to: mailUser,
      bcc: emails,
      subject: `Meeting summary: ${meetingName} (${when})`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:640px">${body}</div>`,
    });

    // Best effort: the column arrives with migration v46.
    await admin.from("mtg_summaries").update({ emailed_at: new Date().toISOString() }).eq("id", summary_id);

    return json({ sent: emails.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
