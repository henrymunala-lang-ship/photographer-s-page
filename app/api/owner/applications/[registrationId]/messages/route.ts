import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, can, appendAudit } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";
import { sendApplicationNotification } from "@/lib/applications/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

function messageRateKey(scope: string, identity: string) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (secret.length < 32) throw new Error("Message rate limiting is not configured.");
  return createHmac("sha256", secret).update("owner-application-message:" + scope + ":" + identity).digest("hex");
}

async function consumeMessageLimit(scope: string, identity: string) {
  const sql = getDatabase();
  const key = messageRateKey(scope, identity);
  const rows = await sql`INSERT INTO application_rate_limits (rate_key, window_started_at, request_count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (rate_key) DO UPDATE SET
      request_count = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN 1 ELSE application_rate_limits.request_count + 1 END,
      window_started_at = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN now() ELSE application_rate_limits.window_started_at END,
      updated_at = now()
    RETURNING request_count`;
  return Number(rows[0]?.request_count ?? 999);
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); }
  catch { return false; }
}

export async function GET(
  _request: NextRequest,
  context: { params: { registrationId: string } }
) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Preview only." }, 404);
  const actor = await currentAdmin();
  if (!actor || !can(actor, "applications:read")) return NextResponse.json({ error: "Administrator access required." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  try {
    const registrationId = context.params.registrationId;
    const sql = getDatabase();
    const applications = await sql`SELECT registration_id, status, created_at
      FROM application_submissions WHERE registration_id = ${registrationId} LIMIT 1`;
    if (!applications.length) return NextResponse.json({ error: "Application not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const messages = await sql`SELECT message_id, sender_type, sender_ref, body, delivery_state, created_at, sent_at
      FROM application_messages WHERE registration_id = ${registrationId}
      ORDER BY created_at ASC, message_id ASC LIMIT 500`;
    return NextResponse.json({ application: applications[0], messages }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Application conversation could not be loaded." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: { registrationId: string } }
) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Preview only." }, 404);
  const actor = await currentAdmin();
  if (!actor || !can(actor, "applications:review")) return NextResponse.json({ error: "Application review permission required." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const payload = await request.json();
    const body = typeof payload?.body === "string" ? payload.body.trim() : "";
    if (!body || body.length > 4000) return NextResponse.json({ error: "Messages must contain between 1 and 4,000 characters." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    const registrationId = context.params.registrationId;
    const ip = request.headers.get("x-real-ip") || "unknown";
    const [adminAttempts, ipAttempts] = await Promise.all([
      consumeMessageLimit("admin", actor.adminId + ":application:" + registrationId),
      consumeMessageLimit("ip", ip)
    ]);
    if (adminAttempts > 30 || ipAttempts > 60) return response({ error: "Too many messages have been sent. Please wait before replying again." }, 429);
    const messageId = "appmsg_" + randomUUID();
    const sql = getDatabase();
    const rows = await sql`INSERT INTO application_messages
      (message_id, registration_id, sender_type, sender_ref, body, delivery_state)
      SELECT ${messageId}, registration_id, 'admin', ${actor.adminId}, ${body}, 'pending'
      FROM application_submissions
      WHERE registration_id = ${registrationId}
      RETURNING message_id, sender_type, sender_ref, body, delivery_state, created_at`;
    if (!rows.length) return NextResponse.json({ error: "Application not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    await appendAudit(actor, "application.message.created", "application", registrationId, { messageId });
    const applicants = await sql`SELECT applicant_name, applicant_email
      FROM application_submissions WHERE registration_id = ${registrationId} LIMIT 1`;
    const notification = applicants.length
      ? await sendApplicationNotification({
          kind: "applicant",
          to: String(applicants[0].applicant_email),
          recipientName: String(applicants[0].applicant_name),
          subject: "A new update on your Lens & Light application",
          message: "The Lens & Light team has replied to your application. Open your private application updates link to read the message and respond."
        })
      : { state: "pending" as const };
    await sql`UPDATE application_messages
      SET delivery_state = ${notification.state},
          sent_at = CASE WHEN ${notification.state} = 'sent' THEN now() ELSE sent_at END
      WHERE message_id = ${messageId}`;
    return NextResponse.json({
      ok: true,
      message: rows[0],
      notification: notification.state,
      notificationReason: "reason" in notification ? notification.reason : null,
      notificationProviderCode: "providerCode" in notification ? notification.providerCode : null
    }, {
      status: 201, headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return NextResponse.json({ error: "The administrator message could not be saved." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
