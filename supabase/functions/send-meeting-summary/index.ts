// Deployed to jiltqrunlpewqkofzulz as `send-meeting-summary`, verify_jwt: true.
// Every caller is a signed-in user (no cron/webhook path), so the gateway checks
// the JWT, and the code additionally requires has_dept_access('meetings') on the
// caller's own session.
// All summary reads go through the caller's client, so RLS applies. The service
// role is used only to look up recipients' e-mail addresses (auth.users) and to
// stamp mtg_summaries.emailed_at.
//
// The e-mail body is built HERE from the stored snapshot by the same builder the
// on-screen preview uses (minutesHtml.ts, synced from src/lib by
// scripts/sync-minutes-to-edge.mjs), so the caller can never send arbitrary HTML.
//
// Body: { summary_id, include_details?, include_notes?, recipient_ids?, subject?, message? }
//   recipient_ids omitted -> every attendee of the meeting.
//   Each recipient gets their own separate e-mail (nobody sees who else got it).
//
// Needs the same function secrets as send-variance-alerts:
//   ALERT_EMAIL_USER / ALERT_EMAIL_PASS  (Gmail account + app password)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.7";
import { buildMinutesHtml } from "./minutesHtml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const body = await req.json();
    const { summary_id, include_details = true, include_notes = false } = body;
    const recipientIds: string[] | undefined = Array.isArray(body.recipient_ids) ? body.recipient_ids.filter((x: unknown) => typeof x === "string").slice(0, 100) : undefined;
    const subjectOverride = typeof body.subject === "string" ? body.subject.trim().slice(0, 200) : "";
    const message = typeof body.message === "string" ? body.message : "";
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

    // Everyone's display name (owners in the report, recipients below).
    const { data: profiles } = await caller.from("profiles").select("id, full_name").neq("is_active", false);
    const names: Record<string, string> = {};
    for (const p of profiles ?? []) names[p.id] = p.full_name ?? "Someone";

    let ids: string[];
    if (recipientIds) {
      ids = recipientIds.filter((id) => names[id] !== undefined); // active people only
    } else {
      const { data: attendees } = await caller.from("mtg_attendees").select("user_id").eq("meeting_id", summary.meeting_id);
      ids = (attendees ?? []).map((a: { user_id: string }) => a.user_id);
    }
    if (ids.length === 0) return json({ error: "No recipients selected" }, 422);

    const targets: { id: string; email: string }[] = [];
    const skipped: string[] = [];
    for (const id of ids) {
      const { data } = await admin.auth.admin.getUserById(id);
      const email = data?.user?.email;
      if (email) targets.push({ id, email });
      else skipped.push(names[id] ?? id);
    }
    if (targets.length === 0) return json({ error: "None of the selected people have an e-mail address" }, 422);

    const meetingName = (summary as any).meeting?.name ?? "Meeting";
    const html = buildMinutesHtml({
      meetingName,
      createdAt: summary.created_at,
      averageRating: summary.average_rating,
      snapshot: summary.snapshot ?? {},
      names,
      includeDetails: !!include_details,
      includeNotes: !!include_notes,
      message,
      ref: summary.id,
    });
    const when = new Date((summary.snapshot as any)?.ended_at ?? summary.created_at).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur",
    });
    const subject = subjectOverride || `Meeting minutes: ${meetingName} (${when})`;

    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: mailUser, pass } });
    let sent = 0;
    const failed: string[] = [];
    for (const t of targets) {
      try {
        await transporter.sendMail({ from: `"Meetings" <${mailUser}>`, to: t.email, subject, html });
        sent++;
      } catch (_e) {
        failed.push(names[t.id] ?? t.email);
      }
    }

    // Best effort: the column arrives with migration v46.
    if (sent > 0) await admin.from("mtg_summaries").update({ emailed_at: new Date().toISOString() }).eq("id", summary_id);

    return json({ sent, skipped, failed });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
