import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
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
    const sql = getDatabase();
    const enquiryRows = await sql`SELECT customer_name, customer_email_hash, photographer_email, photographer_name
      FROM client_enquiries WHERE enquiry_id = ${id} LIMIT 1`;
    if (!enquiryRows.length) return response({ error: "Enquiry not found." }, 404);
    const enquiry = enquiryRows[0];
    const inserted = await sql`INSERT INTO client_enquiry_messages
      (message_id, enquiry_id, sender_type, sender_ref, sender_name, body)
      VALUES (${"msg_" + randomUUID()}, ${id}, 'customer', ${String(enquiry.customer_email_hash)}, ${String(enquiry.customer_name)}, ${body})
      RETURNING message_id, sender_type, sender_name, body, created_at`;
    const notification = enquiry.photographer_email
      ? await sendClientEnquiryEmail({
          to: String(enquiry.photographer_email),
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
