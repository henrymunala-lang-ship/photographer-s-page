import { NextRequest, NextResponse } from "next/server";
import { can, currentAdmin, appendAudit } from "@/lib/owner/admin-auth";
import { readValues, updateValues } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ photographerId: string }> };
const HEADERS = [
  "photographer_id", "auth_user_id", "registration_id", "public_name", "email",
  "phone", "bio", "primary_location", "categories", "profile_image_url",
  "hero_image_url", "status", "publish_state", "membership_tier", "created_at", "updated_at"
];

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); }
  catch { return false; }
}

export async function POST(request: NextRequest, context: Context) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Photographer publication is restricted to Preview deployments.", code: "PREVIEW_ONLY" }, {
      status: 404, headers: { "Cache-Control": "private, no-store" }
    });
  }
  const actor = await currentAdmin();
  if (!actor || !can(actor, "photographers:edit")) {
    return NextResponse.json({ error: "Photographer editing permission required." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "A same-origin JSON request is required." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }

  try {
    const { photographerId } = await context.params;
    if (!/^phot_[a-f0-9]{32}$/i.test(photographerId)) {
      return NextResponse.json({ error: "Photographer record not found." }, { status: 404 });
    }
    const payload = await request.json();
    const publishState = payload?.publishState;
    if (publishState !== "PUBLISHED" && publishState !== "UNPUBLISHED") {
      return NextResponse.json({ error: "Choose PUBLISHED or UNPUBLISHED." }, { status: 400 });
    }

    const rows = await readValues("'02_PHOTOGRAPHERS'!A1:P2001");
    const headers = (rows[0] ?? []).map((value) => String(value ?? "").trim());
    if (HEADERS.some((header) => !headers.includes(header)) || headers.length !== HEADERS.length) {
      return NextResponse.json({ error: "The photographer worksheet does not match the verified 16-column schema." }, { status: 409 });
    }
    const idIndex = headers.indexOf("photographer_id");
    const matches = rows.slice(1).map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter((item) => String(item.row[idIndex] ?? "").trim() === photographerId);
    if (matches.length !== 1) {
      return NextResponse.json({ error: matches.length ? "Duplicate photographer IDs require manual reconciliation." : "Photographer record not found." }, {
        status: matches.length ? 409 : 404, headers: { "Cache-Control": "private, no-store" }
      });
    }
    const { row, rowNumber } = matches[0];
    const value = (key: string) => String(row[headers.indexOf(key)] ?? "").trim();
    if (value("status").toUpperCase() !== "APPROVED") {
      return NextResponse.json({ error: "Only approved photographers can be published." }, { status: 409 });
    }
    const previous = value("publish_state").toUpperCase();
    if (previous === publishState) {
      return NextResponse.json({ ok: true, unchanged: true, photographerId, publishState }, {
        headers: { "Cache-Control": "private, no-store" }
      });
    }

    const next = [...row];
    next[headers.indexOf("publish_state")] = publishState;
    next[headers.indexOf("updated_at")] = new Date().toISOString();
    await updateValues("'02_PHOTOGRAPHERS'!A" + rowNumber + ":P" + rowNumber, [next]);
    await appendAudit(actor, "photographer.publication.changed", "photographer", photographerId, {
      previousPublishState: previous || null, publishState
    });
    return NextResponse.json({ ok: true, photographerId, publishState }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Photographer publication could not be updated. Refresh the record before retrying.", code: "PHOTOGRAPHER_PUBLICATION_FAILED" }, {
      status: 503, headers: { "Cache-Control": "private, no-store" }
    });
  }
}
