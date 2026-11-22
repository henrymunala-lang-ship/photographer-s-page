import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, can } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ registrationId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "applications:read")) {
    return NextResponse.json({ error: "Administrator access required.", code: "OWNER_ACCESS_REQUIRED" }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }

  const { registrationId } = await context.params;
  if (!/^reg_[0-9a-f-]{36}$/i.test(registrationId)) {
    return NextResponse.json({ error: "Application record not found." }, {
      status: 404, headers: { "Cache-Control": "private, no-store" }
    });
  }

  try {
    const sql = getDatabase();
    const rows = await sql`SELECT
        s.registration_id, s.applicant_name, s.applicant_email, s.applicant_phone,
        s.primary_location, s.introduction, s.status, s.created_at,
        s.created_at + interval '48 hours' AS verification_due_at,
        s.workbook_sync_state,
        d.website_url, d.portfolio_url, d.instagram_url, d.additional_gallery_url,
        d.other_social_url, d.service_areas_text, d.categories_json
      FROM application_submissions s
      LEFT JOIN application_details d ON d.registration_id = s.registration_id
      WHERE s.registration_id = ${registrationId}
      LIMIT 1`;

    if (!rows.length) {
      return NextResponse.json({ error: "Application record not found." }, {
        status: 404, headers: { "Cache-Control": "private, no-store" }
      });
    }

    const row = rows[0];
    const application = {
      id: String(row.registration_id),
      name: String(row.applicant_name),
      email: String(row.applicant_email),
      phone: String(row.applicant_phone),
      location: String(row.primary_location),
      introduction: String(row.introduction),
      status: String(row.status),
      submittedAt: new Date(String(row.created_at)).toISOString(),
      verificationDueAt: new Date(String(row.verification_due_at)).toISOString(),
      workbookSyncState: String(row.workbook_sync_state),
      websiteUrl: row.website_url ? String(row.website_url) : null,
      portfolioUrl: row.portfolio_url ? String(row.portfolio_url) : null,
      instagramUrl: String(row.instagram_url ?? ""),
      additionalGalleryUrl: String(row.additional_gallery_url ?? ""),
      otherSocialUrl: row.other_social_url ? String(row.other_social_url) : null,
      serviceAreas: String(row.service_areas_text ?? ""),
      categories: Array.isArray(row.categories_json) ? row.categories_json : []
    };

    return NextResponse.json({ source: "neon_application_storage", readOnly: true, application }, {
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
    });
  } catch {
    return NextResponse.json({ error: "Application details could not be loaded from the private application store.", code: "APPLICATION_DETAIL_READ_FAILED" }, {
      status: 503, headers: { "Cache-Control": "private, no-store" }
    });
  }
}
