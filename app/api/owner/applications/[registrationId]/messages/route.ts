import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, can, appendAudit } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return NextResponse.json({ ok: true, message: rows[0], notification: "pending" }, {
      status: 201, headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return NextResponse.json({ error: "The administrator message could not be saved." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
