import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { readPhotographerRecord, verifyPhotographerPassword, photographerSessionCookie, photographerCookieOptions, PHOTOGRAPHER_COOKIE } from "@/lib/photographers/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Photographer accounts are restricted to Preview deployments." }, { status: 404 });
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  try {
    const payload = await request.json();
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) {
      return NextResponse.json({ error: "Enter your account email and password." }, { status: 400 });
    }
    const sql = getDatabase();
    const rows = await sql`SELECT account_id, photographer_id, email, password_hash, account_state
      FROM photographer_accounts WHERE lower(email) = ${email} LIMIT 1`;
    if (!rows.length || String(rows[0].account_state) !== "active" || !await verifyPhotographerPassword(password, String(rows[0].password_hash))) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    const accountId = String(rows[0].account_id), photographerId = String(rows[0].photographer_id);
    const record = await readPhotographerRecord(photographerId);
    if (!record || record.accountId !== accountId || record.email !== email) {
      return NextResponse.json({ error: "This photographer account is not currently linked to an approved profile. Contact Lens & Light." }, { status: 403 });
    }
    await sql`UPDATE photographer_accounts SET last_login_at = now() WHERE account_id = ${accountId}`;
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    response.cookies.set(PHOTOGRAPHER_COOKIE, photographerSessionCookie({ accountId, photographerId, email, exp: Date.now() + 8 * 60 * 60 * 1000 }), photographerCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "Photographer sign-in is temporarily unavailable." }, { status: 503 });
  }
}
