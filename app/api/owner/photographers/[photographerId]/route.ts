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

function imageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

export async function PUT(request: NextRequest, context: Context) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Photographer editing is restricted to Preview deployments." }, { status: 404 });
  }
  const actor = await currentAdmin();
  if (!actor || !can(actor, "photographers:edit")) {
    return NextResponse.json({ error: "Photographer editing permission required." }, { status: 403 });
  }
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "A same-origin JSON request is required." }, { status: 403 });
  }

  try {
    const { photographerId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(photographerId)) {
      return NextResponse.json({ error: "Photographer record not found." }, { status: 404 });
    }
    const payload = await request.json();
    const publicName = typeof payload.publicName === "string" ? payload.publicName.trim() : "";
    const bio = typeof payload.bio === "string" ? payload.bio.trim() : "";
    const location = typeof payload.location === "string" ? payload.location.trim() : "";
    const categories = Array.isArray(payload.categories)
      ? payload.categories.filter((v: unknown) => typeof v === "string").map((v: string) => v.trim()).filter(Boolean).join(", ")
      : "";
    const profileImageUrl = imageUrl(payload.profileImageUrl);
    const heroImageUrl = imageUrl(payload.heroImageUrl);

    if (!publicName || publicName.length > 120 || bio.length > 5000 || location.length > 160 || categories.length > 500) {
      return NextResponse.json({ error: "Check the name, biography, location and categories. One or more fields are empty or too long." }, { status: 400 });
    }
    if (profileImageUrl === null || heroImageUrl === null) {
      return NextResponse.json({ error: "Image links must be valid HTTPS URLs." }, { status: 400 });
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
      return NextResponse.json({ error: matches.length ? "Duplicate photographer IDs require manual reconciliation." : "Photographer record not found." }, { status: matches.length ? 409 : 404 });
    }

    const { row, rowNumber } = matches[0];
    const value = (key: string) => String(row[headers.indexOf(key)] ?? "").trim();
    if (value("status").toUpperCase() !== "APPROVED") {
      return NextResponse.json({ error: "Only approved photographer profiles can be edited." }, { status: 409 });
    }

    const next = [...row];
    const changes: string[] = [];
    const set = (key: string, nextValue: string) => {
      const index = headers.indexOf(key);
      if (String(row[index] ?? "") !== nextValue) {
        next[index] = nextValue;
        changes.push(key);
      }
    };
    set("public_name", publicName);
    set("bio", bio);
    set("primary_location", location);
    set("categories", categories);
    set("profile_image_url", profileImageUrl);
    set("hero_image_url", heroImageUrl);

    if (!changes.length) {
      return NextResponse.json({ ok: true, unchanged: true, photographerId }, { headers: { "Cache-Control": "private, no-store" } });
    }
    next[headers.indexOf("updated_at")] = new Date().toISOString();
    await updateValues("'02_PHOTOGRAPHERS'!A" + rowNumber + ":P" + rowNumber, [next]);
    await appendAudit(actor, "photographer.profile.updated", "photographer", photographerId, { changedFields: changes });
    return NextResponse.json({
      ok: true,
      photographerId,
      changedFields: changes,
      publishState: value("publish_state"),
      status: value("status")
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Photographer profile could not be saved. Refresh the record before retrying.", code: "PHOTOGRAPHER_PROFILE_UPDATE_FAILED" }, { status: 503 });
  }
}
