// Deployed to jiltqrunlpewqkofzulz as `send-security-alert`, verify_jwt: false.
//
// Sends immediate security / intrusion alert e-mails to administrators when suspicious
// activities occur (failed login bursts, deactivated user probing, admin permission changes, or manual tests).
//
// Recipients: davidthen4285@gmail.com, david.then@komt.com.my
// Secrets: ALERT_EMAIL_USER / ALERT_EMAIL_PASS
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-security-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const DEFAULT_RECIPIENTS = [
  "davidthen4285@gmail.com",
  "david.then@komt.com.my",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const mailUser = Deno.env.get("ALERT_EMAIL_USER");
    const pass = Deno.env.get("ALERT_EMAIL_PASS");
    if (!mailUser || !pass) {
      return json({ error: "ALERT_EMAIL_USER/ALERT_EMAIL_PASS secrets not set" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const eventType = String(body.event_type || "sample_test");
    const targetEmail = String(body.email || "Unknown / Not Provided");
    const clientIp = String(body.ip || req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "Unknown IP");
    const userAgent = String(body.user_agent || req.headers.get("user-agent") || "Unknown Device");
    const attemptedPath = String(body.path || "/");
    const details = typeof body.details === "object" ? JSON.stringify(body.details, null, 2) : String(body.details || "No additional details");
    const severity = String(body.severity || (eventType === "sample_test" ? "TEST" : "CRITICAL")).toUpperCase();
    const recipients = Array.isArray(body.recipients) && body.recipients.length > 0 ? body.recipients : DEFAULT_RECIPIENTS;

    // Time in Malaysia Timezone (UTC+8)
    const now = new Date();
    const mytTime = now.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "full", timeStyle: "medium" }) + " (MYT, UTC+8)";

    const isTest = eventType === "sample_test";

    const badgeColor = isTest
      ? "background:#0284c7;color:#ffffff;"
      : severity === "CRITICAL"
      ? "background:#dc2626;color:#ffffff;"
      : "background:#d97706;color:#ffffff;";

    const subject = isTest
      ? "[TEST] AlphaVision Security Alert: System Verification"
      : `[SECURITY ALERT] ${severity} - Unauthorized Intrusion / Break-in Detected (${targetEmail})`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px 12px;background:#0f172a;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
    
    <!-- Header -->
    <div style="background:#0f172a;padding:22px 28px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:20px;font-weight:800;color:#f8fafc;letter-spacing:0.5px;">🛡️ AlphaVision Security Shield</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">Automated Intrusion Detection &amp; Alert System</div>
      </div>
      <div style="padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;${badgeColor}">
        ${esc(severity)}
      </div>
    </div>

    <!-- Alert Banner -->
    <div style="padding:20px 28px;background:${isTest ? "#0369a1" : "#991b1b"};color:#ffffff;">
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">
        ${isTest ? "✅ Security Alert Channel Test" : "⚠️ Potential Unauthorized Break-in or Intrusion Detected"}
      </div>
      <div style="font-size:13px;opacity:0.95;line-height:1.5;">
        ${isTest
          ? "This is a verification test to confirm your emergency email notifications are active and functioning correctly."
          : "An anomalous or unauthorized access event was detected on the AlphaVision platform. Please review the incident details below immediately."
        }
      </div>
    </div>

    <!-- Incident Information Table -->
    <div style="padding:28px;font-size:13px;line-height:1.6;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:8px 12px;color:#94a3b8;width:140px;border-bottom:1px solid #334155;">Event Type:</td>
          <td style="padding:8px 12px;color:#f8fafc;font-weight:700;border-bottom:1px solid #334155;">${esc(eventType)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#94a3b8;border-bottom:1px solid #334155;">Time (MYT):</td>
          <td style="padding:8px 12px;color:#f8fafc;border-bottom:1px solid #334155;">${esc(mytTime)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#94a3b8;border-bottom:1px solid #334155;">Target Account:</td>
          <td style="padding:8px 12px;color:#38bdf8;font-weight:700;border-bottom:1px solid #334155;">${esc(targetEmail)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#94a3b8;border-bottom:1px solid #334155;">Suspect Client IP:</td>
          <td style="padding:8px 12px;color:#fca5a5;font-weight:700;font-family:monospace;border-bottom:1px solid #334155;">${esc(clientIp)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#94a3b8;border-bottom:1px solid #334155;">Target URL Path:</td>
          <td style="padding:8px 12px;color:#cbd5e1;font-family:monospace;border-bottom:1px solid #334155;">${esc(attemptedPath)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#94a3b8;border-bottom:1px solid #334155;">Client Device / UA:</td>
          <td style="padding:8px 12px;color:#cbd5e1;font-size:12px;border-bottom:1px solid #334155;">${esc(userAgent)}</td>
        </tr>
      </table>

      <!-- Details Box -->
      <div style="background:#0f172a;border-radius:8px;padding:14px;border:1px solid #334155;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Incident Diagnostics</div>
        <pre style="margin:0;font-size:12px;color:#e2e8f0;white-space:pre-wrap;font-family:monospace;">${esc(details)}</pre>
      </div>

      <!-- Action Button -->
      <div style="text-align:center;margin:28px 0 10px;">
        <a href="https://alphavision-psi.vercel.app/admin/access" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;font-size:14px;letter-spacing:0.3px;">
          Open AlphaVision Access Control
        </a>
      </div>
      <p style="text-align:center;color:#64748b;font-size:12px;margin:8px 0 0;">
        If you suspect an active breach, navigate to Access Control to freeze the account or revoke credentials.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#0f172a;padding:16px 28px;border-top:1px solid #334155;color:#64748b;font-size:11px;text-align:center;">
      This security notification was generated automatically by AlphaVision Security Monitoring.<br/>
      Sent to: ${esc(recipients.join(", "))}
    </div>
  </div>
</body>
</html>
    `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: mailUser, pass },
    });

    await transporter.sendMail({
      from: `"AlphaVision Security" <${mailUser}>`,
      to: recipients,
      subject,
      html,
    });

    return json({ ok: true, sent_to: recipients, event: eventType });
  } catch (err: any) {
    console.error("send-security-alert failed:", err);
    return json({ error: err?.message || "Failed to send security alert" }, 500);
  }
});
