import { currentAdmin, can } from "@/lib/owner/admin-auth";
import { NextResponse } from "next/server";
import { readValues } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGE = "'01_REGISTRATIONS'!A1:N501";

function cell(row: string[], headers: string[], key: string): string {
  const index = headers.indexOf(key);
  return index < 0 ? "" : String(row[index] ?? "").trim();
}

export async function GET() {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "applications:read")) return NextResponse.json({ error: "Administrator access required.", code: "OWNER_ACCESS_REQUIRED" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });

  try {
    // Owner-only, bounded read of registration records. No writes are performed.
    const values = await readValues(RANGE);
    const headers = (values[0] ?? []).map((value) => String(value ?? "").trim());
    const required = ["registration_id", "full_name", "email", "phone", "primary_location", "status", "submitted_at"];
    const missing = required.filter((name) => !headers.includes(name));
    if (missing.length) {
      return NextResponse.json(
        { error: "The registrations worksheet does not match the expected schema.", code: "REGISTRATION_SCHEMA_MISMATCH", missing },
        { status: 502, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const applications = values.slice(1)
      .filter((row) => row.some((value) => String(value ?? "").trim().length > 0))
      .map((row) => ({
        id: cell(row, headers, "registration_id"),
        name: cell(row, headers, "full_name"),
        email: cell(row, headers, "email"),
        phone: cell(row, headers, "phone"),
        location: cell(row, headers, "primary_location"),
        status: cell(row, headers, "status"),
        submittedAt: cell(row, headers, "submitted_at"),
        verificationDueAt: cell(row, headers, "verification_due_at"),
      }))
      .filter((item) => item.id.length > 0)
      .reverse();

    return NextResponse.json(
      { source: "google_sheets", readOnly: true, limit: 500, count: applications.length, applications },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Registration records could not be loaded from the private workbook.", code: "REGISTRATION_READ_FAILED" },
      { status: 502, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
