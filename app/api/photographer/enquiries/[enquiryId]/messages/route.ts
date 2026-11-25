import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPhotographerSession } from "@/lib/photographers/auth";
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
  try {
    const session = await getPhotographerSession(request);
    if (!session) return response({ error: "Photographer sign-in is required." }, 401);
    const id = context.params.enquiryId;
    const sql = getDatabase();
    const owned = await sql`SELECT enquiry_id, photographer_name, customer_name, event_type, status
      FROM client_enquiries WHERE enquiry_id = ${id} AND photographer_id = ${session.photographerId} LIMIT 1`;
    if (!owned.length) return response({ error: "Enquiry not found." }, 404);
    await sql`UPDATE client_enquiry_messages SET photographer_read_at = now()
      WHERE enquiry_id = ${id} AND sender_type IN ('customer','admin','system') AND photographer_read_at IS NULL`;
    const messages = await sql`SELECT message_id, sender_type, sender_name, body, created_at
      FROM client_enquiry_messages WHERE enquiry_id = ${id}
      ORDER BY created_at ASC, message_id ASC LIMIT 500`;
    return response({ enquiry: owned[0], messages });
  } catch {
    return response({ error: "Your conversation could not be loaded." }, 503);
  }
}
export async function POST(request: NextRequest, context: { params: { enquiryId: string } }) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Preview only." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return response({ error: "Invalid request." }, 403);
  try {
    const session = await getPhotographerSession(request);
    if (!session) return response({ error: "Photographer sign-in is required." }, 401);
    const id = context.params.enquiryId;
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (body.length < 1 || body.length > 4000) return response({ error: "Messages must contain between 1 and 4,000 characters." }, 400);
    const sql = getDatabase();
    const owned = await sql`SELECT customer_name, customer_email, photographer_name
      FROM client_enquiries WHERE enquiry_id = ${id} AND photographer_id = ${session.photographerId} LIMIT 1`;
    if (!owned.length) return response({ error: "Enquiry not found." }, 404);
    const enquiry = owned[0];
    const inserted = await sql`INSERT INTO client_enquiry_messages
      (message_id, enquiry_id, sender_type, sender_ref, sender_name, body)
      VALUES (${"msg_" + randomUUID()}, ${id}, 'photographer', ${session.accountId}, ${String(enquiry.photographer_name)}, ${body})
      RETURNING message_id, sender_type, sender_name, body, created_at`;
    const token = await createClientEnquiryAccessToken(id);
    const url = request.nextUrl.origin + "/enquiries/" + encodeURIComponent(id) + "#access=" + encodeURIComponent(token.token);
    const notification = await sendClientEnquiryEmail({
      to: String(enquiry.customer_email),
      subject: "Your photographer has replied — Lens & Light",
      greeting: String(enquiry.customer_name),
      message: "Your photographer has sent a new message about your enquiry. Use this private link to read and reply. The link expires in 24 hours and can be used once.",
      actionLabel: "Read your private message",
      actionUrl: url
    });
    await sql`UPDATE client_enquiries SET customer_notification_state = ${notification.state}, updated_at = now()
      WHERE enquiry_id = ${id}`;
    return response({ ok: true, message: inserted[0], notification: notification.state }, 201);
  } catch {
    return response({ error: "Your message could not be sent. Please try again." }, 503);
  }
}
