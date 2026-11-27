import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, can, appendAudit } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";
import { createClientEnquiryAccessToken } from "@/lib/client-enquiries/access";
import { sendClientEnquiryEmail } from "@/lib/client-enquiries/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function response(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: noStore }); }
function messageRateKey(scope: string, identity: string) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (secret.length < 32) throw new Error("Message rate limiting is not configured.");
  return createHmac("sha256", secret).update("owner-enquiry-message:" + scope + ":" + identity).digest("hex");
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
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
export async function GET(request: NextRequest, context: { params: { enquiryId: string } }) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Preview only." }, 404);
  const actor = await currentAdmin();
  if (!actor || !can(actor, "enquiries:read")) return response({ error: "Enquiry access required." }, 403);
  try {
    const id = context.params.enquiryId;
    const sql = getDatabase();
    const owned = await sql`SELECT enquiry_id, photographer_name, customer_name, event_type, status
      FROM client_enquiries WHERE enquiry_id = ${id} LIMIT 1`;
    if (!owned.length) return response({ error: "Enquiry not found." }, 404);
    await sql`UPDATE client_enquiry_messages SET owner_read_at = now()
      WHERE enquiry_id = ${id} AND sender_type IN ('customer','photographer') AND owner_read_at IS NULL`;
    const messages = await sql`SELECT message_id, sender_type, sender_name, body, created_at
      FROM client_enquiry_messages WHERE enquiry_id = ${id}
      ORDER BY created_at ASC, message_id ASC LIMIT 500`;
    return response({ enquiry: owned[0], messages });
  } catch {
    return response({ error: "The conversation could not be loaded." }, 503);
  }
}
export async function POST(request: NextRequest, context: { params: { enquiryId: string } }) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Preview only." }, 404);
  const actor = await currentAdmin();
  if (!actor || !can(actor, "enquiries:reply")) return response({ error: "Enquiry reply permission required." }, 403);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return response({ error: "Invalid request." }, 403);
  try {
    const id = context.params.enquiryId;
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (body.length < 1 || body.length > 4000) return response({ error: "Messages must contain between 1 and 4,000 characters." }, 400);
    const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return response({ error: "A valid message request key is required. Please refresh and try again." }, 400);
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const sql = getDatabase();
    const owned = await sql`SELECT customer_name, customer_email, photographer_name
      FROM client_enquiries WHERE enquiry_id = ${id} LIMIT 1`;
    if (!owned.length) return response({ error: "Enquiry not found." }, 404);
    const prior = await sql`SELECT message_id, sender_type, sender_name, body, created_at, payload_hash
      FROM client_enquiry_messages
      WHERE enquiry_id = ${id} AND sender_type = 'admin' AND sender_ref = ${String(actor.adminId)} AND idempotency_key = ${idempotencyKey}
      LIMIT 1`;
    if (prior.length) {
      if (String(prior[0].payload_hash) !== payloadHash) return response({ error: "This request key was already used for a different message." }, 409);
      const message = Object.fromEntries(Object.entries(prior[0]).filter(([key]) => key !== "payload_hash"));
      return response({ ok: true, message, notification: "already_recorded", duplicate: true });
    }
    const ip = request.headers.get("x-real-ip") || "unknown";
    const [adminAttempts, ipAttempts] = await Promise.all([
      consumeMessageLimit("admin", actor.adminId + ":enquiry:" + id),
      consumeMessageLimit("ip", ip)
    ]);
    if (adminAttempts > 30 || ipAttempts > 60) return response({ error: "Too many messages have been sent. Please wait before replying again." }, 429);
    const enquiry = owned[0];
    const senderName = String(actor.name || actor.email || "Lens & Light support");
    const senderRef = String(actor.adminId || actor.email || "admin");
    const inserted = await sql`INSERT INTO client_enquiry_messages
      (message_id, enquiry_id, sender_type, sender_ref, sender_name, body, idempotency_key, payload_hash)
      VALUES (${"msg_" + randomUUID()}, ${id}, 'admin', ${senderRef}, ${senderName}, ${body}, ${idempotencyKey}, ${payloadHash})
      ON CONFLICT DO NOTHING
      RETURNING message_id, sender_type, sender_name, body, created_at`;
    if (!inserted.length) {
      const duplicate = await sql`SELECT message_id, sender_type, sender_name, body, created_at, payload_hash
        FROM client_enquiry_messages
        WHERE enquiry_id = ${id} AND sender_type = 'admin' AND sender_ref = ${senderRef} AND idempotency_key = ${idempotencyKey}
        LIMIT 1`;
      if (duplicate.length) {
        if (String(duplicate[0].payload_hash) !== payloadHash) return response({ error: "This request key was already used for a different message." }, 409);
        const message = Object.fromEntries(Object.entries(duplicate[0]).filter(([key]) => key !== "payload_hash"));
        return response({ ok: true, message, notification: "already_recorded", duplicate: true });
      }
      return response({ error: "The support message could not be saved." }, 503);
    }
    const token = await createClientEnquiryAccessToken(id);
    const url = request.nextUrl.origin + "/enquiries/" + encodeURIComponent(id) + "#access=" + encodeURIComponent(token.token);
    const notification = await sendClientEnquiryEmail({
      to: String(enquiry.customer_email),
      subject: "A Lens & Light support reply is waiting",
      greeting: String(enquiry.customer_name),
      message: "Lens & Light support has added a message to your private enquiry conversation. Use this secure link to read and reply. The link expires in 24 hours and can be used once.",
      actionLabel: "Open private conversation",
      actionUrl: url
    });
    await sql`UPDATE client_enquiries SET customer_notification_state = ${notification.state}, updated_at = now()
      WHERE enquiry_id = ${id}`;
    await appendAudit(actor, "client_enquiry.message.sent", "client_enquiry", id, { messageId: inserted[0].message_id, notificationState: notification.state });
    return response({ ok: true, message: inserted[0], notification: notification.state }, 201);
  } catch {
    return response({ error: "The support message could not be sent." }, 503);
  }
}
