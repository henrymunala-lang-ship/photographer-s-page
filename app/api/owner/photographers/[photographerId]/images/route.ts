import { NextRequest, NextResponse } from "next/server";
import { can, currentAdmin, appendAudit } from "@/lib/owner/admin-auth";
import { readValues, batchUpdateValues } from "@/lib/integrations/google-sheets/client";
import { uploadPhotographerImage } from "@/lib/integrations/google-drive/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ photographerId: string }> };

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); }
  catch { return false; }
}

export async function POST(request: NextRequest, context: Context) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Image uploads are restricted to Preview deployments." }, { status: 404 });
  }
  const actor = await currentAdmin();
  if (!actor || !can(actor, "photographers:edit")) {
    return NextResponse.json({ error: "Photographer editing permission required." }, { status: 403 });
  }
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: "A same-origin image upload is required." }, { status: 403 });
  }

  try {
    const { photographerId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(photographerId)) {
      return NextResponse.json({ error: "Photographer record not found." }, { status: 404 });
    }
    const form = await request.formData();
    const image = form.get("image");
    const kind = form.get("kind");
    if (!(image instanceof File) || (kind !== "profile" && kind !== "hero")) {
      return NextResponse.json({ error: "Choose a profile or cover image to upload." }, { status: 400 });
    }
    if (image.size > 8 * 1024 * 1024 || image.size < 1 || !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
      return NextResponse.json({ error: "Choose a JPG, PNG or WebP image up to 8 MB." }, { status: 400 });
    }

    const rows = await readValues("'02_PHOTOGRAPHERS'!A1:P2001");
    const headers = (rows[0] ?? []).map((value) => String(value ?? "").trim());
    const expected = ["photographer_id","auth_user_id","registration_id","public_name","email","phone","bio","primary_location","categories","profile_image_url","hero_image_url","status","publish_state","membership_tier","created_at","updated_at"];
    if (headers.length !== expected.length || expected.some((header, index) => headers[index] !== header)) {
      return NextResponse.json({ error: "The photographer worksheet does not match the verified 16-column schema." }, { status: 409 });
    }
    const matches = rows.slice(1).map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter((item) => String(item.row[0] ?? "").trim() === photographerId);
    if (matches.length !== 1) {
      return NextResponse.json({ error: matches.length ? "Duplicate photographer IDs require manual reconciliation." : "Photographer record not found." }, { status: matches.length ? 409 : 404 });
    }
    const photographer = matches[0].row;
    if (String(photographer[11] ?? "").trim().toUpperCase() !== "APPROVED") {
      return NextResponse.json({ error: "Only approved photographer profiles can receive uploaded images." }, { status: 409 });
    }

    const uploaded = await uploadPhotographerImage(image, photographerId, kind);

    // Persist the new Drive URL immediately. Uploading a file without updating
    // the photographer row leaves the public directory pointing at the old image.
    const rowNumber = matches[0].rowNumber;
    const imageColumn = kind === "profile" ? "J" : "K";
    await batchUpdateValues([
      { range: `'02_PHOTOGRAPHERS'!${imageColumn}${rowNumber}`, values: [[uploaded.url]] },
      { range: `'02_PHOTOGRAPHERS'!P${rowNumber}`, values: [[new Date().toISOString()]] }
    ]);

    await appendAudit(actor, "photographer.image.uploaded", "photographer", photographerId, {
      imageKind: kind,
      storage: "google_drive",
      fileId: uploaded.fileId,
      savedToPhotographerRecord: true
    });
    return NextResponse.json({ ok: true, kind, url: uploaded.url, savedToProfile: true }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image upload failed.";
    return NextResponse.json({ error: message }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
