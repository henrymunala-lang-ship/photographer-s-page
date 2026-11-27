import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, can } from "@/lib/owner/admin-auth";
import { migrateApplicationDatabase } from "@/lib/database/application-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Database migrations are restricted to Vercel Preview deployments.", code: "PREVIEW_ONLY" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const actor = await currentAdmin();
  if (!actor || !can(actor, "admins:manage")) {
    return NextResponse.json({ error: "Super Admin access required." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Same-origin request required." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }

  try {
    const result = await migrateApplicationDatabase();
    return NextResponse.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return NextResponse.json({
      error: "Application database migration failed. No application submissions were enabled.",
      code: "DATABASE_MIGRATION_FAILED"
    }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
