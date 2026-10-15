// Deployed to jiltqrunlpewqkofzulz as `send-meeting-invite`, verify_jwt: true.
//
// A Meetings ADMIN invites people who so far only exist as contacts (imported from another
// system) to use the Meetings module. For each contact that has an e-mail address it:
//   1. creates their login (or finds the one that already uses that e-mail),
//   2. gives them access to the Meetings department (role "member"),
//   3. links the contact to the login, so their to-dos, issues, seats and meetings become theirs,
//   4. e-mails a one-time link where THEY choose their own password. No password is ever e-mailed.
//
// Two ways to give someone access (body.mode):
//   "password" (default): a random temporary password is e-mailed and the account is flagged so the
//                         person MUST choose a new password the first time they sign in.
//   "link":               no password is sent; the e-mail has a one-time link to choose one.
// An existing login's password is never overwritten (except a "send again" to someone who has
// never signed in).
//
// Body: { contact_ids: string[], site_url: string, mode?: "password"|"link", message?: string, resend?: boolean, dry_run?: boolean }
// With dry_run nothing is created or sent; the answer says what would happen.
//
// Needs the same secrets as send-meeting-summary: ALERT_EMAIL_USER / ALERT_EMAIL_PASS.
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

// Easy to read out: no 0/O, 1/l/I. Always has a letter and a digit.
function tempPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const all = letters + "23456789";
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(letters), pick("23456789"), ...Array.from({ length: 10 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

function randomPassword() {
  // Never sent to anyone: the person sets their own through the e-mailed link.
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 40) + "Aa1!";
}

type Result = { contact_id: string; name: string; email: string | null; status: "invited" | "resent" | "skipped" | "failed" | "would_invite"; reason?: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "Not signed in" }, 401);
    const { data: isAdmin } = await caller.rpc("is_dept_admin", { dept: "meetings" });
    if (!isAdmin) return json({ error: "Only a Meetings admin can send invitations" }, 403);

    const body = await req.json();
    const contactIds: string[] = Array.isArray(body.contact_ids) ? body.contact_ids.filter((x: unknown) => typeof x === "string").slice(0, 100) : [];
    const dry = !!body.dry_run;
    const resend = !!body.resend;
    const mode: "password" | "link" = body.mode === "link" ? "link" : "password";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
    if (contactIds.length === 0) return json({ error: "No one selected" }, 400);

    let origin: string;
    try {
      const u = new URL(String(body.site_url));
      const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if (u.protocol !== "https:" && !local) throw new Error("site_url must be https");
      origin = u.origin;
    } catch {
      return json({ error: "A valid site_url (the address people use to open the app) is required" }, 400);
    }

    const mailUser = Deno.env.get("ALERT_EMAIL_USER");
    const pass = Deno.env.get("ALERT_EMAIL_PASS");
    if (!dry && (!mailUser || !pass)) return json({ error: "ALERT_EMAIL_USER/ALERT_EMAIL_PASS secrets not set" }, 500);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: inviter } = await caller.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const inviterName = inviter?.full_name ?? "A colleague";
    const transporter = dry ? null : nodemailer.createTransport({ service: "gmail", auth: { user: mailUser, pass } });

    const { data: contacts } = await caller.from("mtg_contacts").select("id, full_name, email, user_id").in("id", contactIds);
    const results: Result[] = [];

    for (const c of contacts ?? []) {
      const email = (c.email ?? "").trim().toLowerCase();
      const base = { contact_id: c.id as string, name: c.full_name as string, email: email || null };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { results.push({ ...base, status: "skipped", reason: "No valid e-mail address" }); continue; }
      if (c.user_id && !resend) { results.push({ ...base, status: "skipped", reason: "Already has a login" }); continue; }
      if (dry) { results.push({ ...base, status: "would_invite" }); continue; }

      try {
        // 1. the login
        let userId = (c.user_id as string | null) ?? null;
        let temp: string | null = null; // the temporary password, only when we just set one
        if (!userId) {
          const pw = mode === "password" ? tempPassword() : randomPassword();
          const created = await admin.auth.admin.createUser({
            email, password: pw, email_confirm: true, user_metadata: { full_name: c.full_name },
            ...(mode === "password" ? { app_metadata: { must_change_password: true } } : {}),
          });
          if (created.error) {
            // Someone already uses this address: link to that login (its password is left alone).
            const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
            const existing = list?.users.find((u) => (u.email ?? "").toLowerCase() === email);
            if (!existing) throw created.error;
            userId = existing.id;
          } else {
            userId = created.data.user.id;
            if (mode === "password") temp = pw;
          }
        } else if (resend && mode === "password") {
          const { data: u } = await admin.auth.admin.getUserById(userId);
          if (u?.user?.last_sign_in_at) throw new Error("This person has already signed in, so their password was left alone. Use the link option to let them choose a new one.");
          temp = tempPassword();
          const upd = await admin.auth.admin.updateUserById(userId, { password: temp, app_metadata: { must_change_password: true } });
          if (upd.error) throw upd.error;
        }

        // 2. access to Meetings (never lowers an existing role)
        const { data: has } = await admin.from("user_department_access").select("role").eq("user_id", userId).eq("department", "meetings").maybeSingle();
        if (!has) await admin.from("user_department_access").insert({ user_id: userId, department: "meetings", role: "member", granted_by: user.id });

        // 3. the contact becomes this login
        if (!c.user_id) {
          const name = c.full_name as string;
          await admin.from("mtg_contacts").update({ user_id: userId }).eq("id", c.id);
          for (const t of ["mtg_todos", "mtg_issues", "mtg_headlines", "mtg_goals", "mtg_kpis"]) {
            await admin.from(t).update({ owner_id: userId, owner_name: null }).eq("owner_name", name).is("owner_id", null);
          }
          const { data: seats } = await admin.from("mtg_seat_contacts").select("seat_id").eq("contact_id", c.id);
          if (seats?.length) {
            await admin.from("mtg_seat_people").upsert(seats.map((s) => ({ seat_id: s.seat_id, user_id: userId })), { onConflict: "seat_id,user_id", ignoreDuplicates: true });
            await admin.from("mtg_seat_contacts").delete().eq("contact_id", c.id);
          }
          const { data: meets } = await admin.from("mtg_meeting_contacts").select("meeting_id").eq("contact_id", c.id);
          if (meets?.length) {
            await admin.from("mtg_attendees").upsert(meets.map((m) => ({ meeting_id: m.meeting_id, user_id: userId })), { onConflict: "meeting_id,user_id", ignoreDuplicates: true });
            await admin.from("mtg_meeting_contacts").delete().eq("contact_id", c.id);
          }
        }

        // 4. the e-mail
        const intro = `<p>Hi ${esc(c.full_name)},</p>
          <p><b>${esc(inviterName)}</b> has invited you to <b>AlphaVision Meetings</b>, where your team runs its weekly meetings: to-dos, issues, KPIs, quarterly priorities and the org chart. Your existing items from the old system are already waiting for you.</p>
          ${message ? `<p style="padding:10px 12px;background:#eff6ff;border-left:4px solid #2563eb;white-space:pre-wrap">${esc(message)}</p>` : ""}`;
        const wrap = (inner: string) => `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;max-width:560px"><div style="font-size:22px;font-weight:700;margin-bottom:4px">AlphaVision</div>${intro}${inner}<p style="color:#94a3b8;font-size:12px">If you weren't expecting this e-mail, you can ignore it.</p></div>`;
        let html: string;
        if (temp) {
          html = wrap(`<p>Sign in at <a href="${esc(origin)}/login">${esc(origin)}/login</a> with:</p>
            <table style="border-collapse:collapse;margin:8px 0 12px"><tr><td style="padding:4px 12px 4px 0;color:#475569">E-mail</td><td><b>${esc(email)}</b></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#475569">Temporary password</td><td><code style="font-size:16px;background:#f1f5f9;padding:3px 8px;border-radius:6px;letter-spacing:.5px">${esc(temp)}</code></td></tr></table>
            <p><b>You will be asked to choose a new password right after you sign in.</b> Please do not share this temporary one.</p>`);
        } else if (mode === "password") {
          // This e-mail address already had a login: nothing about it was changed.
          html = wrap(`<p>You can now use the Meetings module. Sign in at <a href="${esc(origin)}/login">${esc(origin)}/login</a> with your existing e-mail address and password.</p>`);
        } else {
          const link = await admin.auth.admin.generateLink({ type: "recovery", email });
          const hashed = link.data?.properties?.hashed_token;
          if (link.error || !hashed) throw link.error ?? new Error("Could not create the sign-in link");
          const url = `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=${encodeURIComponent("/auth/set-password?welcome=1")}`;
          html = wrap(`<p><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px">Choose your password</a></p>
            <p style="color:#475569">After that, sign in any time at <a href="${esc(origin)}/login">${esc(origin)}/login</a> with this e-mail address (${esc(email)}) and your new password. The button works once and for a limited time; if it has expired, ask ${esc(inviterName)} to send a new invitation.</p>`);
        }
        const _unused = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;max-width:560px">
          <div style="font-size:22px;font-weight:700;margin-bottom:4px">AlphaVision</div>
          <p>Hi ${esc(c.full_name)},</p>
          <p><b>${esc(inviterName)}</b> has invited you to <b>AlphaVision Meetings</b>, where your team runs its weekly meetings: to-dos, issues, KPIs, quarterly priorities and the org chart. Your existing items from the old system are already waiting for you.</p>
          ${message ? `<p style="padding:10px 12px;background:#eff6ff;border-left:4px solid #2563eb;white-space:pre-wrap">${esc(message)}</p>` : ""}
          <p><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px">Choose your password</a></p>
          <p style="color:#475569">After that, sign in any time at <a href="${esc(origin)}/login">${esc(origin)}/login</a> with this e-mail address (${esc(email)}) and your new password.</p>
          <p style="color:#94a3b8;font-size:12px">The button above works once and for a limited time. If it has expired, ask ${esc(inviterName)} to send a new invitation. If you weren't expecting this e-mail, you can ignore it.</p>
        </div>`;
        await transporter!.sendMail({ from: `"AlphaVision" <${mailUser}>`, to: email, subject: "You're invited to AlphaVision Meetings", html });
        results.push({ ...base, status: c.user_id ? "resent" : "invited" });
      } catch (err) {
        results.push({ ...base, status: "failed", reason: err instanceof Error ? err.message : "Unexpected error" });
      }
    }

    const found = new Set((contacts ?? []).map((c) => c.id));
    for (const id of contactIds) if (!found.has(id)) results.push({ contact_id: id, name: "?", email: null, status: "skipped", reason: "Contact not found" });
    return json({ dry_run: dry, results });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
