import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { getApplicantSession } from "@/lib/applications/applicant-access";
import { sendApplicationNotification } from "@/lib/applications/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function messageRateKey(scope: string, identity: string) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (secret.length < 32) throw new Error("Message rate limiting is not configured.");
  return createHmac("sha256", secret).update("applicant-message:" + scope + ":" + identity).digest("hex");
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

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Preview only." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  try {
    const session = await getApplicantSession(request);
    if (!session) return NextResponse.json({ error: "Applicant access is required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    const sql = getDatabase();
    const rows = await sql`SELECT message_id, sender_type, body, delivery_state, created_at
      FROM application_messages
      WHERE registration_id = ${session.registrationId}
      ORDER BY created_at ASC, message_id ASC
      LIMIT 200`;
    return NextResponse.json({ messages: rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The application conversation is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Preview only." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const session = await getApplicantSession(request);
    if (!session) return NextResponse.json({ error: "Applicant access is required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    const payload = await request.json();
    const body = typeof payload?.body === "string" ? payload.body.trim() : "";
    if (!body || body.length > 4000) {
      return NextResponse.json({ error: "Messages must contain between 1 and 4,000 characters." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
    const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const [registrationAttempts, ipAttempts] = await Promise.all([
      consumeMessageLimit("registration", session.registrationId),
      consumeMessageLimit("ip", ip)
    ]);
    if (registrationAttempts > 30 || ipAttempts > 60) {
      return NextResponse.json({ error: "Too many messages have been sent. Please wait before replying again." }, {
        status: 429, headers: { "Cache-Control": "private, no-store" }
      });
    }
    const sql = getDatabase();
    const messageId = "appmsg_" + randomUUID();
    const inserted = await sql`WITH eligible AS (
        UPDATE applicant_access_tokens
        SET last_message_at = now(), last_used_at = now()
        WHERE token_id = ${session.tokenId}
          AND registration_id = ${session.registrationId}
          AND revoked_at IS NULL
          AND expires_at > now()
          AND (last_message_at IS NULL OR last_message_at < now() - interval '15 seconds')
        RETURNING registration_id
      )
      INSERT INTO application_messages
        (message_id, registration_id, sender_type, sender_ref, body, delivery_state)
      SELECT ${messageId}, registration_id, 'applicant', 'applicant', ${body}, 'pending'
      FROM eligible
      RETURNING message_id, sender_type, body, delivery_state, created_at`;
    if (!inserted.length) {
      return NextResponse.json({ error: "Please wait a moment before sending another message." }, {
        status: 429, headers: { "Cache-Control": "private, no-store" }
      });
    }
    const application = await sql`SELECT applicant_name, applicant_email
      FROM application_submissions WHERE registration_id = ${session.registrationId} LIMIT 1`;
    const ownerEmail = process.env.GOOGLE_OAUTH_OWNER_EMAIL ?? "";
    const notification = application.length && ownerEmail
      ? await sendApplicationNotification({
          kind: "owner",
          to: ownerEmail,
          recipientName: "Lens & Light admin",
          subject: "New applicant message — Lens & Light",
          message: `A photographer applicant (${String(application[0].applicant_name)}) has sent a new message. Sign in to the Owner Workspace to review the application conversation.`
        })
      : { state: "pending" as const, reason: "not_configured" as const };
    const providerMessageId = "providerMessageId" in notification ? notification.providerMessageId : null;
    console.info("[application-message] applicant reply notification result", {
      messageId,
      notificationState: notification.state,
      notificationReason: "reason" in notification ? notification.reason : null
    });
    await sql`UPDATE application_messages
      SET delivery_state = ${notification.state},
          provider_message_ref = ${providerMessageId}::text,
          sent_at = CASE WHEN ${notification.state} = 'sent' THEN now() ELSE sent_at END
      WHERE message_id = ${messageId}`;
    return NextResponse.json({
      ok: true,
      message: inserted[0],
      notification: notification.state,
      notificationReason: "reason" in notification ? notification.reason : null,
      notificationProviderCode: "providerCode" in notification ? notification.providerCode : null
    }, {
      status: 201, headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Your message could not be saved. Please try again." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" }
    });
  }
}
