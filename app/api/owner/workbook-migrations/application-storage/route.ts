import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { batchUpdateSpreadsheet, getSpreadsheetMetadata, readValues } from "@/lib/integrations/google-sheets/client";
import { can, currentAdmin } from "@/lib/owner/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXISTING_TABS = [
  "01_REGISTRATIONS", "02_PHOTOGRAPHERS", "03_ADMINS", "04_GALLERY",
  "05_SERVICES", "06_WORKING_HOURS", "07_ENQUIRIES", "08_MESSAGES",
  "09_LIKES", "10_PROFILE_VIEWS", "11_REVIEWS", "12_REPORTS", "13_SETTINGS",
  "14_AUDIT_LOG", "15_PHOTOGRAPHER_SERVICE_AREAS", "16_VERIFICATION_EVENTS",
  "17_CONDUCT_CASES", "18_PLANS_SUBSCRIPTIONS", "19_PHOTO_PRODUCTS",
  "20_PHOTO_ORDERS", "21_ADMIN_INVITATIONS", "22_PHOTOGRAPHER_ALBUMS"
] as const;

const MIGRATION_TABS = {
  "23_APPLICATION_DETAILS": [
    "registration_id", "website_url", "portfolio_url", "instagram_url",
    "additional_gallery_url", "other_social_url", "service_areas_text",
    "service_areas_normalized_json", "categories_json", "created_at", "updated_at"
  ],
  "24_APPLICATION_MESSAGES": [
    "message_id", "registration_id", "sender_type", "sender_ref", "body",
    "delivery_state", "provider_message_ref", "created_at", "sent_at"
  ]
} as const;

function normalizedHeaders(values: string[][]): string[] {
  return (values[0] ?? []).map((value) => String(value ?? "").trim());
}

function sameHeaders(actual: string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((value, index) => actual[index] === value);
}

export async function POST() {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "admins:manage")) {
    return NextResponse.json(
      { error: "Super Admin access required.", code: "OWNER_ACCESS_REQUIRED" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const metadata = await getSpreadsheetMetadata();
    const sheets = metadata.sheets ?? [];
    const titles = new Set(sheets.map((sheet) => sheet.properties?.title).filter(Boolean));
    const missingBaseTabs = EXISTING_TABS.filter((title) => !titles.has(title));
    if (missingBaseTabs.length) {
      return NextResponse.json({
        error: "The existing workbook structure does not match the approved 22-tab baseline. No changes were made.",
        code: "BASE_SCHEMA_MISMATCH",
        missingBaseTabs
      }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }

    const entries = Object.entries(MIGRATION_TABS) as Array<[keyof typeof MIGRATION_TABS, readonly string[]]>;
    const missing: Array<[keyof typeof MIGRATION_TABS, readonly string[]]> = [];

    for (const [title, expected] of entries) {
      if (!titles.has(title)) {
        missing.push([title, expected]);
        continue;
      }
      const actual = normalizedHeaders(await readValues(`'${title}'!1:1`));
      if (!sameHeaders(actual, expected)) {
        return NextResponse.json({
          error: `The existing ${title} tab has unexpected headers. It was not modified.`,
          code: "MIGRATION_SCHEMA_CONFLICT",
          tab: title,
          expectedHeaders: expected,
          actualHeaders: actual
        }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
      }
    }

    if (missing.length) {
      const usedIds = new Set(sheets.map((sheet) => sheet.properties?.sheetId).filter((id): id is number => typeof id === "number"));
      const requests: Array<Record<string, unknown>> = [];
      for (const [title, headers] of missing) {
        let sheetId = randomInt(100_000_000, 2_000_000_000);
        while (usedIds.has(sheetId)) sheetId = randomInt(100_000_000, 2_000_000_000);
        usedIds.add(sheetId);
        requests.push({
          addSheet: {
            properties: {
              sheetId,
              title,
              gridProperties: { rowCount: 1000, columnCount: headers.length }
            }
          }
        });
        requests.push({
          updateCells: {
            range: { sheetId, startRowIndex: 0, startColumnIndex: 0 },
            rows: [{
              values: headers.map((value) => ({ userEnteredValue: { stringValue: value } }))
            }],
            fields: "userEnteredValue"
          }
        });
      }
      // Google Sheets batchUpdate applies the requests atomically.
      await batchUpdateSpreadsheet(requests);
    }

    const verified = await getSpreadsheetMetadata();
    const verifiedTitles = new Set((verified.sheets ?? []).map((sheet) => sheet.properties?.title));
    const missingAfter = entries.map(([title]) => title).filter((title) => !verifiedTitles.has(title));
    if (missingAfter.length) {
      return NextResponse.json({
        error: "The migration request completed but post-migration verification could not confirm every tab.",
        code: "MIGRATION_VERIFY_FAILED",
        missingTabs: missingAfter
      }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }

    for (const [title, expected] of entries) {
      const actual = normalizedHeaders(await readValues(`'${title}'!1:1`));
      if (!sameHeaders(actual, expected)) {
        return NextResponse.json({
          error: "Post-migration header verification failed.",
          code: "MIGRATION_VERIFY_FAILED",
          tab: title
        }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
      }
    }

    return NextResponse.json({
      ok: true,
      migration: "application-storage-v1",
      workbookChanged: missing.length > 0,
      createdTabs: missing.map(([title]) => title),
      verifiedTabs: entries.map(([title]) => title),
      existingTabsPreserved: EXISTING_TABS.length
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      error: "Application storage migration failed. Check the workbook connection and retry after reviewing its current schema.",
      code: "MIGRATION_FAILED"
    }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
