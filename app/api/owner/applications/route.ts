import { NextResponse } from "next/server";
import { currentAdmin, can } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "applications:read")) {
    return NextResponse.json({ error: "Administrator access required.", code: "OWNER_ACCESS_REQUIRED" }, {
      status: 403,
      headers: { "Cache-Control": "private, no-store" }
    });
  }

  try {
    const sql = getDatabase();
    const rows = await sql`SELECT
        registration_id,
        applicant_name,
        applicant_email,
        applicant_phone,
        primary_location,
        status,
        created_at,
        created_at + interval '48 hours' AS verification_due_at,
        workbook_sync_state
      FROM application_submissions
      ORDER BY created_at DESC, registration_id DESC
      LIMIT 500`;

    const applications = rows.map((row) => ({
      id: String(row.registration_id),
      name: String(row.applicant_name),
      email: String(row.applicant_email),
      phone: String(row.applicant_phone),
      location: String(row.primary_location),
      status: String(row.status),
      submittedAt: new Date(String(row.created_at)).toISOString(),
      verificationDueAt: new Date(String(row.verification_due_at)).toISOString(),
      workbookSyncState: String(row.workbook_sync_state)
    }));

    return NextResponse.json({
      source: "neon_application_storage",
      readOnly: true,
      limit: 500,
      count: applications.length,
      applications
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      error: "Application records could not be loaded from the private application store.",
      code: "APPLICATION_READ_FAILED"
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
