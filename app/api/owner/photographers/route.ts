import { NextResponse } from "next/server";
import { readValues } from "@/lib/integrations/google-sheets/client";
import { can, currentAdmin } from "@/lib/owner/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGE = "'02_PHOTOGRAPHERS'!A1:Z501";
const REQUIRED_HEADERS = [
  "photographer_id", "public_name", "bio", "primary_location",
  "categories", "profile_image_url", "hero_image_url", "status", "publish_state"
] as const;

function cell(row: string[], headers: string[], key: string): string {
  const index = headers.indexOf(key);
  return index < 0 ? "" : String(row[index] ?? "").trim();
}

export async function GET() {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "photographers:read")) {
    return NextResponse.json({ error: "Photographer management access required." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }

  try {
    const rows = await readValues(RANGE);
    const headers = (rows[0] ?? []).map((value) => String(value ?? "").trim());
    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missing.length) {
      return NextResponse.json({
        error: "The photographer worksheet does not match the expected schema.",
        code: "PHOTOGRAPHER_SCHEMA_MISMATCH"
      }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }

    const populatedRows = rows.slice(1).filter((row) => row.some((value) => String(value ?? "").trim()));
    const photographers = populatedRows.map((row) => ({
      id: cell(row, headers, "photographer_id"),
      name: cell(row, headers, "public_name"),
      bio: cell(row, headers, "bio"),
      location: cell(row, headers, "primary_location"),
      categories: cell(row, headers, "categories").split(/[;,]/).map((value) => value.trim()).filter(Boolean),
      profileImageUrl: cell(row, headers, "profile_image_url"),
      heroImageUrl: cell(row, headers, "hero_image_url"),
      status: cell(row, headers, "status"),
      publishState: cell(row, headers, "publish_state")
    })).filter((row) => row.id && row.name);

    return NextResponse.json({
      source: "google_sheets",
      readOnly: true,
      count: photographers.length,
      populatedRowCount: populatedRows.length,
      headers,
      photographers
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      error: "Photographer records could not be loaded from the private workbook.",
      code: "PHOTOGRAPHER_READ_FAILED"
    }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
