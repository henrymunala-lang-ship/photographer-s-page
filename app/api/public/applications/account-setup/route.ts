import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { getApplicantSession } from "@/lib/applications/applicant-access";
import { hashPhotographerPassword } from "@/lib/photographers/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); }
  catch { return false; }
}

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
  });
}

export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return noStore({ error: "Account setup is restricted to Preview deployments." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return noStore({ error: "Invalid request." }, 403);
  }

  try {
    const session = await getApplicantSession(request);
    if (!session) return noStore({ error: "Open your private application link again before creating your account." }, 401);

    const payload = await request.json();
    const password = typeof payload?.password === "string" ? payload.password : "";
    if (password.length < 12 || password.length > 128) {
      return noStore({ error: "Choose a password between 12 and 128 characters." }, 400);
    }

    const sql = getDatabase();
    const existing = await sql`SELECT account_id FROM photographer_applicant_accounts
      WHERE registration_id = ${session.registrationId} LIMIT 1`;
    if (existing.length) return noStore({ error: "A sign-in account already exists for this application. Please sign in instead." }, 409);

    const valid = await sql`SELECT s.applicant_email
      FROM applicant_access_tokens t
      JOIN application_submissions s ON s.registration_id = t.registration_id
      WHERE t.token_id = ${session.tokenId}
        AND t.registration_id = ${session.registrationId}
        AND t.revoked_at IS NULL AND t.expires_at > now()
        AND s.status IN ('pending','under_review','needs_information','approved')
      LIMIT 1`;
    if (!valid.length) return noStore({ error: "Your private application access has expired or the application is no longer eligible. Contact Lens & Light for help." }, 401);

    const passwordHash = await hashPhotographerPassword(password);
    const accountId = "pacc_" + randomUUID();
    const created = await sql`WITH eligible AS (
        SELECT s.registration_id, s.applicant_email
        FROM applicant_access_tokens t
        JOIN application_submissions s ON s.registration_id = t.registration_id
        WHERE t.token_id = ${session.tokenId}
          AND t.registration_id = ${session.registrationId}
          AND t.revoked_at IS NULL AND t.expires_at > now()
          AND s.status IN ('pending','under_review','needs_information','approved')
        FOR UPDATE OF t, s
      )
      INSERT INTO photographer_applicant_accounts
        (account_id, registration_id, email, password_hash)
      SELECT ${accountId}, registration_id, applicant_email, ${passwordHash}
      FROM eligible
      RETURNING account_id`;
    if (!created.length) return noStore({ error: "Your private application access could not be verified. Reopen your private link and try again." }, 401);

    return noStore({ ok: true, message: "Your sign-in account is ready. You can now sign in with your application email and password." }, 201);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code) : "";
    if (code === "23505") return noStore({ error: "A sign-in account already exists for this application email. Please sign in instead." }, 409);
    return noStore({ error: "Account setup is temporarily unavailable. Please try again later." }, 503);
  }
}
