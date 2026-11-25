import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, can, appendAudit } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Preview only." }, { status: 404, headers: noStore });
  const actor = await currentAdmin();
  if (!actor || !can(actor, "enquiries:read")) return NextResponse.json({ error: "Enquiry access required." }, { status: 403, headers: noStore });
  try {
    const sql = getDatabase();
    let rows: any[] = [];
    try {
      rows = await sql`SELECT enquiry_id, photographer_id, photographer_name, photographer_slug,
        customer_name, customer_email, customer_phone, event_type, event_date, event_location,
        message, status, internal_note, customer_notification_state, photographer_notification_state, created_at, updated_at
        FROM client_enquiries ORDER BY created_at DESC LIMIT 250`;
    } catch {
      // Version 1 inbox remains readable until the additive V2 messaging migration is applied.
      rows = await sql`SELECT enquiry_id, photographer_id, photographer_name, photographer_slug,
        customer_name, customer_email, customer_phone, event_type, event_date, event_location,
        message, status, internal_note, created_at, updated_at
        FROM client_enquiries ORDER BY created_at DESC LIMIT 250`;
    }
    return NextResponse.json({ enquiries: rows, count: rows.length }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Client enquiries could not be loaded. Verify the client enquiry database migration." }, { status: 503, headers: noStore });
  }
}
export async function PATCH(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Preview only." }, { status: 404, headers: noStore });
  const actor = await currentAdmin();
  if (!actor || !can(actor, "enquiries:reply")) return NextResponse.json({ error: "Enquiry management permission required." }, { status: 403, headers: noStore });
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: noStore });
  }
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof payload.enquiryId === "string" ? payload.enquiryId.trim() : "";
  const status = typeof payload.status === "string" ? payload.status.trim() : "";
  const note = typeof payload.internalNote === "string" ? payload.internalNote.trim().slice(0, 2000) : undefined;
  if (!/^enq_[0-9a-f-]{36}$/i.test(id) || !["new","in_progress","responded","closed"].includes(status)) {
    return NextResponse.json({ error: "Choose a valid enquiry and status." }, { status: 400, headers: noStore });
  }
  try {
    const sql = getDatabase();
    const rows = await sql`UPDATE client_enquiries SET
      status = ${status},
      internal_note = CASE WHEN ${note === undefined} THEN internal_note ELSE ${note ?? ""} END,
      updated_at = now()
      WHERE enquiry_id = ${id}
      RETURNING enquiry_id, status, internal_note, updated_at`;
    if (!rows.length) return NextResponse.json({ error: "Enquiry not found." }, { status: 404, headers: noStore });
    await appendAudit(actor, "client_enquiry.updated", "client_enquiry", id, { status, internalNoteChanged: note !== undefined });
    return NextResponse.json({ ok: true, enquiry: rows[0] }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "The enquiry update could not be saved." }, { status: 503, headers: noStore });
  }
}
