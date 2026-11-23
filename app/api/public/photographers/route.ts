import { NextResponse } from "next/server";
import { readValues } from "@/lib/integrations/google-sheets/client";
import { photographerSlug } from "@/lib/photographers/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGE = "'02_PHOTOGRAPHERS'!A1:Z501";
const REQUIRED_HEADERS = [
  "photographer_id",
  "public_name",
  "bio",
  "primary_location",
  "categories",
  "profile_image_url",
  "hero_image_url",
  "status",
  "publish_state"
] as const;

function value(row: string[], headers: string[], key: string): string {
  const index = headers.indexOf(key);
  return index < 0 ? "" : String(row[index] ?? "").trim();
}

function safeImageUrl(input: string): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:") return null;

    // Match the public profile API: Google Drive file-view URLs are not
    // consistently renderable in <img> elements, so use Drive thumbnails.
    if (url.hostname === "drive.google.com" && url.pathname === "/uc") {
      const fileId = url.searchParams.get("id");
      if (!fileId) return null;
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const rows = await readValues(RANGE);
    const headers = (rows[0] ?? []).map((item) => String(item ?? "").trim());
    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missing.length) {
      return NextResponse.json(
        { error: "The public photographer data schema needs attention.", code: "PHOTOGRAPHER_SCHEMA_MISMATCH" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const photographers = rows.slice(1)
      .filter((row) => value(row, headers, "status").toUpperCase() === "APPROVED")
      .filter((row) => value(row, headers, "publish_state").toUpperCase() === "PUBLISHED")
      .map((row) => {
        const id = value(row, headers, "photographer_id");
        const name = value(row, headers, "public_name");
        if (!id || !name) return null;
        return {
          id,
          slug: photographerSlug(name, id),
          name,
          bio: value(row, headers, "bio"),
          primaryLocation: value(row, headers, "primary_location"),
          categories: value(row, headers, "categories").split(/[;,]/).map((item) => item.trim()).filter(Boolean),
          profileImageUrl: safeImageUrl(value(row, headers, "profile_image_url")),
          heroImageUrl: safeImageUrl(value(row, headers, "hero_image_url"))
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json(
      { source: "google_sheets", readOnly: true, count: photographers.length, photographers },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Photographer listings are temporarily unavailable.", code: "PHOTOGRAPHER_DIRECTORY_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
