import { NextResponse } from "next/server";
import { readValues } from "@/lib/integrations/google-sheets/client";
import { photographerSlug } from "@/lib/photographers/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = string[];
type PublicPhotographer = {
  id: string;
  slug: string;
  name: string;
  bio: string;
  primaryLocation: string;
  categories: string[];
  profileImageUrl: string | null;
  heroImageUrl: string | null;
};

function value(row: Row, headers: string[], key: string): string {
  const index = headers.indexOf(key);
  return index < 0 ? "" : String(row[index] ?? "").trim();
}

function safeImageUrl(input: string): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseList(input: string): string[] {
  return input.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function isPublished(input: string): boolean {
  return input.trim().toUpperCase() === "PUBLISHED";
}

function isActive(input: string): boolean {
  return ["TRUE", "1", "YES", "ACTIVE"].includes(input.trim().toUpperCase());
}

async function readTable(range: string) {
  const rows = await readValues(range);
  return { headers: (rows[0] ?? []).map((item) => String(item ?? "").trim()), rows: rows.slice(1) };
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const [photographerTable, galleryTable, servicesTable, areasTable, albumsTable] = await Promise.all([
      readTable("'02_PHOTOGRAPHERS'!A1:Z501"),
      readTable("'04_GALLERY'!A1:Z1001"),
      readTable("'05_SERVICES'!A1:Z501"),
      readTable("'15_PHOTOGRAPHER_SERVICE_AREAS'!A1:Z1001"),
      readTable("'22_PHOTOGRAPHER_ALBUMS'!A1:Z1001")
    ]);

    const requiredHeaders: Record<string, string[]> = {
      photographers: ["photographer_id", "public_name", "bio", "primary_location", "categories", "profile_image_url", "hero_image_url", "status", "publish_state"],
      gallery: ["photo_id", "photographer_id", "album_id", "title", "caption", "image_preview_url", "alt_text", "category", "sort_order", "featured", "publish_state"],
      services: ["service_id", "photographer_id", "name", "description", "image_url", "publish_state"],
      serviceAreas: ["photographer_id", "place_name", "county_region", "country", "active"],
      albums: ["album_id", "photographer_id", "publish_state"]
    };
    const tables = { photographers: photographerTable, gallery: galleryTable, services: servicesTable, serviceAreas: areasTable, albums: albumsTable };
    for (const [tableName, headers] of Object.entries(requiredHeaders)) {
      const actual = tables[tableName as keyof typeof tables].headers;
      if (headers.some((header) => !actual.includes(header))) {
        return NextResponse.json(
          { error: "Photographer profile data needs administrator attention.", code: "PHOTOGRAPHER_PROFILE_SCHEMA_MISMATCH" },
          { status: 503, headers: { "Cache-Control": "private, no-store" } }
        );
      }
    }

    const photographer = photographerTable.rows
      .filter((row) => value(row, photographerTable.headers, "status").toUpperCase() === "APPROVED")
      .filter((row) => value(row, photographerTable.headers, "publish_state").toUpperCase() === "PUBLISHED")
      .map((row): PublicPhotographer | null => {
        const id = value(row, photographerTable.headers, "photographer_id");
        const name = value(row, photographerTable.headers, "public_name");
        if (!id || !name) return null;
        return {
          id,
          slug: photographerSlug(name, id),
          name,
          bio: value(row, photographerTable.headers, "bio"),
          primaryLocation: value(row, photographerTable.headers, "primary_location"),
          categories: parseList(value(row, photographerTable.headers, "categories")),
          profileImageUrl: safeImageUrl(value(row, photographerTable.headers, "profile_image_url")),
          heroImageUrl: safeImageUrl(value(row, photographerTable.headers, "hero_image_url"))
        };
      })
      .find((item) => item?.slug === slug);

    if (!photographer) {
      return NextResponse.json({ error: "Photographer profile not found.", code: "PHOTOGRAPHER_NOT_FOUND" }, {
        status: 404,
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" }
      });
    }

    const publishedAlbumIds = new Set(albumsTable.rows
      .filter((row) => value(row, albumsTable.headers, "photographer_id") === photographer.id)
      .filter((row) => isPublished(value(row, albumsTable.headers, "publish_state")))
      .map((row) => value(row, albumsTable.headers, "album_id"))
      .filter(Boolean));

    const gallery = galleryTable.rows
      .filter((row) => value(row, galleryTable.headers, "photographer_id") === photographer.id)
      .filter((row) => isPublished(value(row, galleryTable.headers, "publish_state")))
      .filter((row) => {
        const albumId = value(row, galleryTable.headers, "album_id");
        return !albumId || publishedAlbumIds.has(albumId);
      })
      .map((row) => ({
        id: value(row, galleryTable.headers, "photo_id"),
        title: value(row, galleryTable.headers, "title"),
        caption: value(row, galleryTable.headers, "caption"),
        imageUrl: safeImageUrl(value(row, galleryTable.headers, "image_preview_url")),
        altText: value(row, galleryTable.headers, "alt_text"),
        category: value(row, galleryTable.headers, "category"),
        featured: isActive(value(row, galleryTable.headers, "featured")),
        sortOrder: Number(value(row, galleryTable.headers, "sort_order")) || 0
      }))
      .filter((item) => item.id && item.imageUrl)
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder);

    const services = servicesTable.rows
      .filter((row) => value(row, servicesTable.headers, "photographer_id") === photographer.id)
      .filter((row) => isPublished(value(row, servicesTable.headers, "publish_state")))
      .map((row) => ({
        id: value(row, servicesTable.headers, "service_id"),
        name: value(row, servicesTable.headers, "name"),
        description: value(row, servicesTable.headers, "description"),
        imageUrl: safeImageUrl(value(row, servicesTable.headers, "image_url"))
      }))
      .filter((item) => item.id && item.name);

    const serviceAreas = areasTable.rows
      .filter((row) => value(row, areasTable.headers, "photographer_id") === photographer.id)
      .filter((row) => isActive(value(row, areasTable.headers, "active")))
      .map((row) => [value(row, areasTable.headers, "place_name"), value(row, areasTable.headers, "county_region"), value(row, areasTable.headers, "country")].filter(Boolean).join(", "))
      .filter(Boolean);

    return NextResponse.json(
      { photographer, gallery, services, serviceAreas },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Photographer profile is temporarily unavailable.", code: "PHOTOGRAPHER_PROFILE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
