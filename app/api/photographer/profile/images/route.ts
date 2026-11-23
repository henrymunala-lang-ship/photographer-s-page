import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPhotographerSession } from "@/lib/photographers/auth";
import { uploadPhotographerImage } from "@/lib/integrations/google-drive/client";
import { updateValues, appendRows } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Image uploads are restricted to Preview deployments." }, { status: 404 });
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) return NextResponse.json({ error: "Invalid image upload request." }, { status: 403 });
  try {
    const session = await getPhotographerSession(request);
    if (!session) return NextResponse.json({ error: "Photographer sign-in is required." }, { status: 401 });
    const form = await request.formData(), image = form.get("image"), kind = form.get("kind");
    if (!(image instanceof File) || (kind !== "profile" && kind !== "hero")) return NextResponse.json({ error: "Choose a profile or cover image." }, { status: 400 });
    if (image.size < 1 || image.size > 8 * 1024 * 1024 || !["image/jpeg","image/png","image/webp"].includes(image.type)) {
      return NextResponse.json({ error: "Choose a JPG, PNG or WebP image up to 8 MB." }, { status: 400 });
    }
    const p = session.record;
    const uploaded = await uploadPhotographerImage(image, p.id, kind);
    const key = kind === "profile" ? "profile_image_url" : "hero_image_url";
    const next = [...p.row];
    next[p.headers.indexOf(key)] = uploaded.url;
    next[p.headers.indexOf("updated_at")] = new Date().toISOString();
    await updateValues("'02_PHOTOGRAPHERS'!A" + p.rowNumber + ":P" + p.rowNumber, [next]);
    await appendRows("'14_AUDIT_LOG'!A:I", [[
      "audit_" + randomBytes(12).toString("hex"), "photographer", session.accountId,
      "photographer.image.updated", "photographer", p.id,
      JSON.stringify({ imageKind: kind, storage: "google_drive", fileId: uploaded.fileId }), "", new Date().toISOString()
    ]]);
    return NextResponse.json({ ok: true, kind, url: uploaded.url, message: "Your image has been uploaded and your public profile updated." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Your image could not be uploaded or saved. Please try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
