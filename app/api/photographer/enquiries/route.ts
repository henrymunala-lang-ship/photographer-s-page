import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPhotographerSession } from "@/lib/photographers/auth";
import { getDatabase } from "@/lib/database/neon";
import { appendRows } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function response(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: noStore }); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Preview only." }, 404);
  try {
    const session = await getPhotographerSession(request);
    if (!session) return response({ error: "Photographer sign-in is required." }, 401);
    const sql = getDatabase();
    const rows = await sql`SELECT enquiry_id, photographer_name, customer_name, customer_email,
      customer_phone, event_type, event_date, event_location, message, status, created_at, updated_at
      FROM client_enquiries WHERE photographer_id = ${session.photographerId}
      ORDER BY created_at DESC LIMIT 200`;
    return response({ enquiries: rows, count: rows.length });
  } catch {
    return response({ error: "Your enquiries could not be loaded. The owner may need to run the client enquiry migration." }, 503);
  }
}
export async function PATCH(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Preview only." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return response({ error: "Invalid request." }, 403);
  try {
    const session = await getPhotographerSession(request);
    if (!session) return response({ error: "Photographer sign-in is required." }, 401);
    const payload = await request.json();
    const id = typeof payload?.enquiryId === "string" ? payload.enquiryId.trim() : "";
    const status = typeof payload?.status === "string" ? payload.status.trim() : "";
    if (!/^enq_[0-9a-f-]{36}$/i.test(id) || !["in_progress","responded","closed"].includes(status)) return response({ error: "Choose a valid enquiry status." }, 400);
    const sql = getDatabase();
    const rows = await sql`UPDATE client_enquiries SET status = ${status}, updated_at = now()
      WHERE enquiry_id = ${id} AND photographer_id = ${session.photographerId}
      RETURNING enquiry_id, status, updated_at`;
    if (!rows.length) return response({ error: "Enquiry not found." }, 404);
    await appendRows("'14_AUDIT_LOG'!A:I", [[
      "audit_" + randomBytes(12).toString("hex"), "photographer", session.accountId,
      "client_enquiry.status.updated", "client_enquiry", id,
      JSON.stringify({ status }), "", new Date().toISOString()
    ]]);
    return response({ ok: true, enquiry: rows[0] });
  } catch {
    return response({ error: "The enquiry status could not be updated." }, 503);
  }
}
