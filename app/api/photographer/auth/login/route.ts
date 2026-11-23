import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { readPhotographerRecord, verifyPhotographerPassword, photographerSessionCookie, photographerCookieOptions, PHOTOGRAPHER_COOKIE } from "@/lib/photographers/auth";
import { createPhotographerApplicantSession, photographerApplicantCookieOptions, PHOTOGRAPHER_APPLICANT_COOKIE } from "@/lib/photographers/applicant-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
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
  if (process.env.VERCEL_ENV !== "preview") return noStore({ error: "Photographer accounts are restricted to Preview deployments." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return noStore({ error: "Invalid request." }, 403);
  try {
    const payload = await request.json();
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) {
      return noStore({ error: "Enter your account email and password." }, 400);
    }
    if (await consumeLoginLimit(request) > 10) return noStore({ error: "Too many sign-in attempts. Please try again later." }, 429);
    const sql = getDatabase();
    const rows = await sql`SELECT account_id, photographer_id, email, password_hash, account_state
      FROM photographer_accounts WHERE lower(email) = ${email} LIMIT 1`;
    if (rows.length && String(rows[0].account_state) === "active" && await verifyPhotographerPassword(password, String(rows[0].password_hash))) {
      const accountId = String(rows[0].account_id), photographerId = String(rows[0].photographer_id);
      const record = await readPhotographerRecord(photographerId);
      if (record && record.accountId === accountId && record.email === email) {
        await sql`UPDATE photographer_accounts SET last_login_at = now() WHERE account_id = ${accountId}`;
        const response = noStore({ ok: true, pending: false });
        response.cookies.set(PHOTOGRAPHER_COOKIE, photographerSessionCookie({ accountId, photographerId, email, exp: Date.now() + 8 * 60 * 60 * 1000 }), photographerCookieOptions());
        response.cookies.set(PHOTOGRAPHER_APPLICANT_COOKIE, "", { ...photographerApplicantCookieOptions(), maxAge: 0 });
        return response;
      }
    }

    const applicants = await sql`SELECT a.account_id, a.registration_id, a.password_hash, a.account_state,
        s.status, s.applicant_email
      FROM photographer_applicant_accounts a
      JOIN application_submissions s ON s.registration_id = a.registration_id
      WHERE lower(a.email) = ${email} LIMIT 1`;
    if (!applicants.length || !["active","converted"].includes(String(applicants[0].account_state)) ||
        !await verifyPhotographerPassword(password, String(applicants[0].password_hash))) {
      return noStore({ error: "Email or password is incorrect." }, 401);
    }
    const applicant = applicants[0];
    if (!["pending","under_review","needs_information","approved"].includes(String(applicant.status))) {
      return noStore({ error: "This application is no longer active. Contact Lens & Light for assistance." }, 403);
    }
    await sql`UPDATE photographer_applicant_accounts SET last_login_at = now() WHERE account_id = ${String(applicant.account_id)}`;
    const response = noStore({ ok: true, pending: true, status: String(applicant.status) });
    response.cookies.set(PHOTOGRAPHER_APPLICANT_COOKIE, createPhotographerApplicantSession({
      accountId: String(applicant.account_id), registrationId: String(applicant.registration_id), exp: Date.now() + 8 * 60 * 60 * 1000
    }), photographerApplicantCookieOptions());
    return response;
  } catch {
    return noStore({ error: "Photographer sign-in is temporarily unavailable." }, 503);
  }
}
