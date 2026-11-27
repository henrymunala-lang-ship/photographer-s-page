import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPhotographerSession } from "@/lib/photographers/auth";
import { readValues, batchUpdateValues, appendRows } from "@/lib/integrations/google-sheets/client";
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
  if (process.env.VERCEL_ENV !== "preview") return noStore({ error: "Photographer accounts are restricted to Preview deployments." }, 404);
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
    const p = session.record;
    const rows = await readValues("'02_PHOTOGRAPHERS'!A1:P2001");
    const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
    const expected = ["photographer_id","auth_user_id","registration_id","public_name","email","phone","bio","primary_location","categories","profile_image_url","hero_image_url","status","publish_state","membership_tier","created_at","updated_at"];
    if (headers.length !== expected.length || expected.some((header, index) => headers[index] !== header)) throw new Error("Photographer worksheet schema changed.");
    const matches = rows.slice(1).map((row,index) => ({ row, rowNumber:index+2 })).filter(item => String(item.row[0] ?? "").trim() === p.id);
    if (matches.length !== 1) return noStore({ error: "Your photographer record could not be uniquely verified. Refresh and try again." }, 409);
    const current = matches[0];
    if (String(current.row[1] ?? "").trim() !== session.accountId || String(current.row[4] ?? "").trim().toLowerCase() !== session.email.toLowerCase() || String(current.row[11] ?? "").trim().toUpperCase() !== "APPROVED") {
      return noStore({ error: "Your account is no longer linked to an approved photographer profile." }, 409);
    }
    const fields: Array<[string,string,string]> = [
      ["D","public_name",publicName],["G","bio",bio],["H","primary_location",location],["I","categories",categories],
      ["J","profile_image_url",profileImageUrl],["K","hero_image_url",heroImageUrl]
    ];
    const changed = fields.filter(([,key,value]) => String(current.row[headers.indexOf(key)] ?? "") !== value).map(([,key])=>key);
    if (!changed.length) return noStore({ ok: true, unchanged: true, slug: photographerSlug(publicName, p.id), publishState: String(current.row[12] ?? ""), status: String(current.row[11] ?? "") });
    const now = new Date().toISOString();
    const writes = fields.filter(([,key,value]) => String(current.row[headers.indexOf(key)] ?? "") !== value)
      .map(([column,,value]) => ({ range: `'02_PHOTOGRAPHERS'!${column}${current.rowNumber}`, values: [[value]] }));
    writes.push({ range: `'02_PHOTOGRAPHERS'!P${current.rowNumber}`, values: [[now]] });
    await batchUpdateValues(writes);
    await appendRows("'14_AUDIT_LOG'!A:I", [[
      "audit_" + randomBytes(12).toString("hex"), "photographer", session.accountId,
      "photographer.profile.updated", "photographer", p.id,
      JSON.stringify({ changedFields: changed }), "", new Date().toISOString()
    ]]);
    return noStore({ ok: true, changedFields: changed, slug: photographerSlug(publicName, p.id), status: String(current.row[11] ?? ""), publishState: String(current.row[12] ?? "") });
  } catch { return noStore({ error: "Your profile could not be saved. Refresh the page before retrying." }, 503); }
}
