import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPhotographerSession } from "@/lib/photographers/auth";
import { updateValues, appendRows } from "@/lib/integrations/google-sheets/client";
import { photographerSlug } from "@/lib/photographers/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
function imageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "";
  try { const url = new URL(value.trim()); if (url.protocol !== "https:" || url.username || url.password) return null; return url.toString(); }
  catch { return null; }
}
function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
export async function GET(request: NextRequest) {
  try {
    const session = await getPhotographerSession(request);
    if (!session) return noStore({ error: "Photographer sign-in is required." }, 401);
    const p = session.record;
    return noStore({ photographer: { id: p.id, slug: photographerSlug(p.name, p.id), name: p.name, email: p.email, bio: p.bio, location: p.location, categories: p.categories, profileImageUrl: p.profileImageUrl, heroImageUrl: p.heroImageUrl, status: p.status, publishState: p.publishState } });
  } catch { return noStore({ error: "Your photographer profile could not be loaded." }, 503); }
}
export async function PUT(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return noStore({ error: "Photographer editing is restricted to Preview deployments." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return noStore({ error: "Invalid request." }, 403);
  try {
    const session = await getPhotographerSession(request);
    if (!session) return noStore({ error: "Photographer sign-in is required." }, 401);
    const payload = await request.json();
    const publicName = typeof payload?.publicName === "string" ? payload.publicName.trim() : "";
    const bio = typeof payload?.bio === "string" ? payload.bio.trim() : "";
    const location = typeof payload?.location === "string" ? payload.location.trim() : "";
    const categories = Array.isArray(payload?.categories) ? payload.categories.filter((v: unknown) => typeof v === "string").map((v: string) => v.trim()).filter(Boolean).slice(0, 12).join(", ") : "";
    const profileImageUrl = imageUrl(payload?.profileImageUrl), heroImageUrl = imageUrl(payload?.heroImageUrl);
    if (!publicName || publicName.length > 120 || bio.length > 5000 || location.length > 160 || categories.length > 500 || profileImageUrl === null || heroImageUrl === null) {
      return noStore({ error: "Check the name, biography, location, categories and HTTPS image links." }, 400);
    }
    const p = session.record, next = [...p.row], changed: string[] = [];
    const set = (key: string, value: string) => { const i = p.headers.indexOf(key); if (String(p.row[i] ?? "") !== value) { next[i] = value; changed.push(key); } };
    set("public_name", publicName); set("bio", bio); set("primary_location", location); set("categories", categories);
    set("profile_image_url", profileImageUrl); set("hero_image_url", heroImageUrl);
    if (!changed.length) return noStore({ ok: true, unchanged: true, slug: photographerSlug(publicName, p.id), publishState: p.publishState, status: p.status });
    next[p.headers.indexOf("updated_at")] = new Date().toISOString();
    await updateValues("'02_PHOTOGRAPHERS'!A" + p.rowNumber + ":P" + p.rowNumber, [next]);
    await appendRows("'14_AUDIT_LOG'!A:I", [[
      "audit_" + randomBytes(12).toString("hex"), "photographer", session.accountId,
      "photographer.profile.updated", "photographer", p.id,
      JSON.stringify({ changedFields: changed }), "", new Date().toISOString()
    ]]);
    return noStore({ ok: true, changedFields: changed, slug: photographerSlug(publicName, p.id), status: p.status, publishState: p.publishState });
  } catch { return noStore({ error: "Your profile could not be saved. Refresh the page before retrying." }, 503); }
}
