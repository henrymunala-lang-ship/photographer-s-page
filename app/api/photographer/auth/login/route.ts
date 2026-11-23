import { createHmac } from "node:crypto";
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
async function consumeLoginLimit(request: NextRequest) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (secret.length < 32) throw new Error("Login security is not configured.");
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = createHmac("sha256", secret).update("photographer-login:" + ip).digest("hex");
  const sql = getDatabase();
  const rows = await sql`INSERT INTO application_rate_limits (rate_key, window_started_at, request_count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (rate_key) DO UPDATE SET
      request_count = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN 1 ELSE application_rate_limits.request_count + 1 END,
      window_started_at = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN now() ELSE application_rate_limits.window_started_at END,
      updated_at = now()
    RETURNING request_count`;
  return Number(rows[0]?.request_count ?? 999);
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
    if (await consumeLoginLimit(request) > 10) return NextResponse.json({ error: "Too many sign-in attempts. Please try again later." }, { status: 429, headers: { "Cache-Control": "private, no-store" } });
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
