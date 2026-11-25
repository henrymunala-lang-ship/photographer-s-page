import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, can, appendAudit } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";
import { createClientEnquiryAccessToken } from "@/lib/client-enquiries/access";
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
    const sql = getDatabase();
    const owned = await sql`SELECT customer_name, customer_email, photographer_name
      FROM client_enquiries WHERE enquiry_id = ${id} LIMIT 1`;
    if (!owned.length) return response({ error: "Enquiry not found." }, 404);
    const enquiry = owned[0];
    const senderName = String(actor.name || actor.email || "Lens & Light support");
    const senderRef = String(actor.adminId || actor.email || "admin");
    const inserted = await sql`INSERT INTO client_enquiry_messages
      (message_id, enquiry_id, sender_type, sender_ref, sender_name, body)
      VALUES (${"msg_" + randomUUID()}, ${id}, 'admin', ${senderRef}, ${senderName}, ${body})
      RETURNING message_id, sender_type, sender_name, body, created_at`;
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
