import { NextResponse } from "next/server";
import { currentAdmin, can } from "@/lib/owner/admin-auth";
import { inspectApplicationWorkbookSchema } from "@/lib/applications/workbook-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "applications:read")) {
    return NextResponse.json(
      { error: "Administrator access required.", code: "OWNER_ACCESS_REQUIRED" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const preflight = await inspectApplicationWorkbookSchema();
    return NextResponse.json(
      { source: "google_sheets_read_only_preflight", readOnly: true, preflight },
      { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }
    );
  } catch {
    return NextResponse.json(
      {
        error: "The workbook schema preflight could not be completed.",
        code: "WORKBOOK_PREFLIGHT_FAILED",
        readOnly: true
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
