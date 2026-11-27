import { NextResponse } from "next/server";
import { getSpreadsheetMetadata } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_TABS = [
  "01_REGISTRATIONS", "02_PHOTOGRAPHERS", "03_ADMINS", "04_GALLERY",
  "05_SERVICES", "06_WORKING_HOURS", "07_ENQUIRIES", "08_MESSAGES",
  "09_LIKES", "10_PROFILE_VIEWS", "11_REVIEWS", "12_REPORTS", "13_SETTINGS",
  "14_AUDIT_LOG", "15_PHOTOGRAPHER_SERVICE_AREAS", "16_VERIFICATION_EVENTS",
  "17_CONDUCT_CASES", "18_PLANS_SUBSCRIPTIONS", "19_PHOTO_PRODUCTS",
  "20_PHOTO_ORDERS", "21_ADMIN_INVITATIONS", "22_PHOTOGRAPHER_ALBUMS"
];

export async function GET() {
  const required = [
    "GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"
  ];
  if (required.some((name) => !process.env[name]?.trim())) {
    return NextResponse.json({
      dataSource: "preview_demo",
      workbook: "setup_pending",
      verifiedTabs: 0,
      expectedTabs: EXPECTED_TABS.length,
      message: "Preview profiles are being shown. The private workbook connection is not yet verified."
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const metadata = await getSpreadsheetMetadata();
    const names = new Set((metadata.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean));
    const verifiedTabs = EXPECTED_TABS.filter((name) => names.has(name)).length;
    const workbook = verifiedTabs === EXPECTED_TABS.length ? "verified" : "needs_attention";
    return NextResponse.json({
      dataSource: "google_sheets_read_only",
      workbook,
      verifiedTabs,
      expectedTabs: EXPECTED_TABS.length,
      message: workbook === "verified"
        ? "The configured private workbook is reachable and all approved tabs are present. Public sample profiles remain demonstration content."
        : "The workbook is reachable, but its approved tab structure needs review."
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      dataSource: "unavailable",
      workbook: "verification_failed",
      verifiedTabs: 0,
      expectedTabs: EXPECTED_TABS.length,
      message: "The workbook could not be verified. Preview profiles remain demonstration content."
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
