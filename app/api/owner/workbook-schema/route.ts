import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readValues } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "ll_owner_preview_session";
const TABS = [
  "01_REGISTRATIONS", "02_PHOTOGRAPHERS", "03_ADMINS", "04_GALLERY",
  "05_SERVICES", "06_WORKING_HOURS", "07_ENQUIRIES", "08_MESSAGES",
  "09_LIKES", "10_PROFILE_VIEWS", "11_REVIEWS", "12_REPORTS", "13_SETTINGS",
  "14_AUDIT_LOG", "15_PHOTOGRAPHER_SERVICE_AREAS", "16_VERIFICATION_EVENTS",
  "17_CONDUCT_CASES", "18_PLANS_SUBSCRIPTIONS", "19_PHOTO_PRODUCTS",
  "20_PHOTO_ORDERS", "21_ADMIN_INVITATIONS", "22_PHOTOGRAPHER_ALBUMS"
];

function hasOwnerSession(value?: string) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (!value || secret.length < 32) return false;
  const expected = createHmac("sha256", secret)
    .update("lens-light-owner-preview-v1")
    .digest("base64url");
  const actualBytes = Buffer.from(value);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes);
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export async function GET() {
  const cookieStore = await cookies();
  if (!hasOwnerSession(cookieStore.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "Owner access required." }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" }
    });
  }

  try {
    const tabs = [];
    for (const title of TABS) {
      // Read only row 1. No customer, photographer, or transaction records are retrieved.
      const rows = await readValues(`'${title}'!1:1`);
      const headers = rows[0] ?? [];
      const columns = headers
        .map((header, index) => ({ column: columnName(index), header: String(header ?? "").trim() }))
        .filter((item) => item.header.length > 0);
      tabs.push({
        title,
        populatedHeaderCount: columns.length,
        lastHeaderColumn: columns.at(-1)?.column ?? null,
        columns
      });
    }

    return NextResponse.json({
      audit: "read_only_header_schema",
      workbookChanged: false,
      tabsAudited: tabs.length,
      tabs
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      error: "The read-only schema audit could not be completed. No workbook data was changed."
    }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
