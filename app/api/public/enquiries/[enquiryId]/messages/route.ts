import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { readValues } from "@/lib/integrations/google-sheets/client";
import { getClientEnquirySession } from "@/lib/client-enquiries/access";
import { sendClientEnquiryEmail } from "@/lib/client-enquiries/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function response(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: noStore }); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
function messageRateKey(enquiryId: string, ip: string) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (secret.length < 32) throw new Error("Message rate limiting is not configured.");
  return createHmac("sha256", secret).update("client-enquiry-message:" + enquiryId + ":" + ip).digest("hex");
}
async function consumeMessageLimit(enquiryId: string, ip: string) {
  const sql = getDatabase();
  const key = messageRateKey(enquiryId, ip);
  const rows = await sql`INSERT INTO application_rate_limits (rate_key, window_started_at, request_count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (rate_key) DO UPDATE SET
      request_count = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN 1 ELSE application_rate_limits.request_count + 1 END,
      window_started_at = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN now() ELSE application_rate_limits.window_started_at END,
      updated_at = now()
    RETURNING request_count`;
  return Number(rows[0]?.request_count ?? 999);
}
export async function GET(request: NextRequest, context: { params: { enquiryId: string } }) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Preview only." }, 404);
  const id = context.params.enquiryId;
  try {
    const session = await getClientEnquirySession(request, id);
    if (!session) return response({ error: "Open your private email link to access this conversation." }, 401);
    const sql = getDatabase();
    const enquiry = await sql`SELECT enquiry_id, photographer_name, customer_name, event_type, status
      FROM client_enquiries WHERE enquiry_id = ${id} LIMIT 1`;
    if (!enquiry.length) return response({ error: "Enquiry not found." }, 404);
    await sql`UPDATE client_enquiry_messages SET customer_read_at = now()
      WHERE enquiry_id = ${id} AND sender_type IN ('photographer','admin','system') AND customer_read_at IS NULL`;
    const messages = await sql`SELECT message_id, sender_type, sender_name, body, created_at
      FROM client_enquiry_messages WHERE enquiry_id = ${id}
      ORDER BY created_at ASC, message_id ASC LIMIT 500`;
    return response({ enquiry: enquiry[0], messages });
  } catch {
    return response({ error: "Your conversation could not be loaded." }, 503);
  }
}
export async function POST(request: NextRequest, context: { params: { enquiryId: string } }) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Preview only." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return response({ error: "Invalid request." }, 403);
  const id = context.params.enquiryId;
  try {
    const session = await getClientEnquirySession(request, id);
    if (!session) return response({ error: "Open your private email link to access this conversation." }, 401);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (body.length < 1 || body.length > 4000) return response({ error: "Messages must contain between 1 and 4,000 characters." }, 400);
    const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return response({ error: "A valid message request key is required. Please refresh and try again." }, 400);
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const sql = getDatabase();
    const prior = await sql`SELECT message_id, sender_type, sender_name, body, created_at, payload_hash
      FROM client_enquiry_messages
      WHERE enquiry_id = ${id} AND sender_type = 'customer' AND idempotency_key = ${idempotencyKey}
      LIMIT 1`;
    if (prior.length) {
      if (String(prior[0].payload_hash) !== payloadHash) return response({ error: "This request key was already used for a different message." }, 409);
      const message = Object.fromEntries(Object.entries(prior[0]).filter(([key]) => key !== "payload_hash"));
      return response({ ok: true, message, notification: "already_recorded", duplicate: true });
    }
    const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    if (await consumeMessageLimit(id, ip) > 30) return response({ error: "Too many messages have been sent. Please wait before replying again." }, 429);
    const enquiryRows = await sql`SELECT customer_name, customer_email_hash, photographer_id, photographer_email, photographer_name
      FROM client_enquiries WHERE enquiry_id = ${id} LIMIT 1`;
    if (!enquiryRows.length) return response({ error: "Enquiry not found." }, 404);
    const enquiry = enquiryRows[0];
    let photographerEmail = String(enquiry.photographer_email || "");
    if (!photographerEmail) {
      try {
        const sheetRows = await readValues("'02_PHOTOGRAPHERS'!A1:P2001");
        const headers = (sheetRows[0] ?? []).map(value => String(value ?? "").trim());
        const idIndex = headers.indexOf("photographer_id");
        const emailIndex = headers.indexOf("email");
        if (idIndex >= 0 && emailIndex >= 0) {
          const matches = sheetRows.slice(1).filter(row => String(row[idIndex] ?? "").trim() === String(enquiry.photographer_id));
          if (matches.length === 1) {
            photographerEmail = String(matches[0][emailIndex] ?? "").trim().toLowerCase();
            if (photographerEmail) await sql`UPDATE client_enquiries SET photographer_email = ${photographerEmail} WHERE enquiry_id = ${id}`;
          }
        }
      } catch { /* message remains saved even if the optional email lookup is unavailable */ }
    }
    const inserted = await sql`INSERT INTO client_enquiry_messages
      (message_id, enquiry_id, sender_type, sender_ref, sender_name, body, idempotency_key, payload_hash)
      VALUES (${"msg_" + randomUUID()}, ${id}, 'customer', ${String(enquiry.customer_email_hash)}, ${String(enquiry.customer_name)}, ${body}, ${idempotencyKey}, ${payloadHash})
      ON CONFLICT DO NOTHING
      RETURNING message_id, sender_type, sender_name, body, created_at`;
    if (!inserted.length) {
      const duplicate = await sql`SELECT message_id, sender_type, sender_name, body, created_at, payload_hash
        FROM client_enquiry_messages
        WHERE enquiry_id = ${id} AND sender_type = 'customer' AND idempotency_key = ${idempotencyKey}
        LIMIT 1`;
      if (duplicate.length) {
        if (String(duplicate[0].payload_hash) !== payloadHash) return response({ error: "This request key was already used for a different message." }, 409);
        const message = Object.fromEntries(Object.entries(duplicate[0]).filter(([key]) => key !== "payload_hash"));
        return response({ ok: true, message, notification: "already_recorded", duplicate: true });
      }
      return response({ error: "Your message could not be saved. Please try again." }, 503);
    }
    const notification = photographerEmail
      ? await sendClientEnquiryEmail({
          to: photographerEmail,
          subject: "New message from a Lens & Light client",
          greeting: String(enquiry.photographer_name),
          message: "A customer has replied in a private enquiry conversation. Sign in to your photographer workspace to respond.",
          actionLabel: "Open photographer workspace",
          actionUrl: request.nextUrl.origin + "/photographer"
        })
      : { state: "pending" as const };
    await sql`UPDATE client_enquiries SET photographer_notification_state = ${notification.state}, updated_at = now()
      WHERE enquiry_id = ${id}`;
    return response({ ok: true, message: inserted[0], notification: notification.state }, 201);
  } catch {
    return response({ error: "Your message could not be sent. Please try again." }, 503);
  }
}
