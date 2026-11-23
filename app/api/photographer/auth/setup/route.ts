import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { hashPhotographerPassword } from "@/lib/photographers/auth";

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
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return noStore({ error: "Photographer account setup is restricted to Preview deployments." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return noStore({ error: "Invalid request." }, 403);
  try {
    const payload = await request.json();
    const token = typeof payload?.token === "string" ? payload.token : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    if (token.length < 32 || token.length > 256) return noStore({ error: "This account setup link is invalid or expired." }, 400);
    if (password.length < 12 || password.length > 128) return noStore({ error: "Choose a password with at least 12 characters." }, 400);
    const passwordHash = await hashPhotographerPassword(password);
    const accountId = "pacc_" + randomUUID();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const sql = getDatabase();
    const created = await sql`WITH claimed AS (
        UPDATE photographer_account_setup_tokens
        SET used_at = now()
        WHERE token_hash = ${tokenHash} AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        RETURNING registration_id
      ), eligible AS (
        SELECT c.registration_id, s.applicant_email
        FROM claimed c JOIN application_submissions s ON s.registration_id = c.registration_id
        WHERE s.status IN ('pending','under_review','needs_information','approved')
      )
      INSERT INTO photographer_applicant_accounts (account_id, registration_id, email, password_hash)
      SELECT ${accountId}, registration_id, applicant_email, ${passwordHash}
      FROM eligible
      RETURNING account_id, registration_id, email`;
    if (!created.length) return noStore({ error: "This account setup link is invalid, expired, already used, or the application is no longer eligible. Contact Lens & Light for help." }, 401);
    return noStore({ ok: true, message: "Your photographer account has been created. Sign in using your application email and the password you just created." }, 201);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as {code?:unknown}).code) : "";
    if (code === "23505") return noStore({ error: "An account already exists for this application email. Please sign in instead." }, 409);
    return noStore({ error: "Account setup is temporarily unavailable. Please try again later." }, 503);
  }
}
