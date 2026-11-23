import { NextRequest, NextResponse } from "next/server";
import { can, currentAdmin, appendAudit } from "@/lib/owner/admin-auth";
import { readValues } from "@/lib/integrations/google-sheets/client";
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
    const required = ["photographer_id", "status"];
    if (required.some((key) => !headers.includes(key))) {
      return NextResponse.json({ error: "The photographer worksheet schema could not be verified." }, { status: 409 });
    }
    const idIndex = headers.indexOf("photographer_id");
    const matches = rows.slice(1).filter((row) => String(row[idIndex] ?? "").trim() === photographerId);
    if (matches.length !== 1) {
      return NextResponse.json({ error: matches.length ? "Duplicate photographer IDs require manual reconciliation." : "Photographer record not found." }, { status: matches.length ? 409 : 404 });
    }
    if (String(matches[0][headers.indexOf("status")] ?? "").trim().toUpperCase() !== "APPROVED") {
      return NextResponse.json({ error: "Only approved photographer profiles can receive uploaded images." }, { status: 409 });
    }

    const uploaded = await uploadPhotographerImage(image, photographerId, kind);
    await appendAudit(actor, "photographer.image.uploaded", "photographer", photographerId, {
      imageKind: kind,
      storage: "google_drive",
      fileId: uploaded.fileId
    });
    return NextResponse.json({ ok: true, kind, url: uploaded.url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image upload failed.";
    return NextResponse.json({ error: message }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
