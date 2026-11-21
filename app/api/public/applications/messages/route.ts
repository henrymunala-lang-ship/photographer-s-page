import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { getApplicantSession } from "@/lib/applications/applicant-access";
import { sendApplicationNotification } from "@/lib/applications/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); }
  catch { return false; }
}

export async function GET(request: NextRequest) {
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
      : { state: "pending" as const };
    await sql`UPDATE application_messages
      SET delivery_state = ${notification.state},
          sent_at = CASE WHEN ${notification.state} = 'sent' THEN now() ELSE sent_at END
      WHERE message_id = ${messageId}`;
    return NextResponse.json({ ok: true, message: inserted[0], notification: notification.state }, {
      status: 201, headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Your message could not be saved. Please try again." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" }
    });
  }
}
