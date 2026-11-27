import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { readPhotographerRecord, hashPhotographerPassword, hashInvitationToken, newPhotographerAccountId, photographerSessionCookie, photographerCookieOptions, PHOTOGRAPHER_COOKIE } from "@/lib/photographers/auth";
import { readValues, batchUpdateValues } from "@/lib/integrations/google-sheets/client";

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
  if (process.env.VERCEL_ENV !== "preview") return noStore({ error: "Photographer accounts are restricted to Preview deployments." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return noStore({ error: "Invalid request." }, 403);
  try {
    const payload = await request.json();
    const token = typeof payload?.token === "string" ? payload.token : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    if (token.length < 32 || token.length > 256) return noStore({ error: "This invitation link is invalid or expired." }, 400);
    if (password.length < 12 || password.length > 128) return noStore({ error: "Choose a password with at least 12 characters." }, 400);
    const sql = getDatabase();
    const invitations = await sql`SELECT invitation_id, photographer_id, email
      FROM photographer_invitations
      WHERE token_hash = ${hashInvitationToken(token)} AND used_at IS NULL
        AND revoked_at IS NULL AND expires_at > now() LIMIT 1`;
    if (!invitations.length) return noStore({ error: "This invitation link is invalid, expired or has already been used. Ask Lens & Light for a new invitation." }, 401);
    const invitation = invitations[0];
    const photographerId = String(invitation.photographer_id);
    const email = String(invitation.email).toLowerCase();
    const record = await readPhotographerRecord(photographerId);
    if (!record || record.email !== email) return noStore({ error: "This approved photographer record could not be verified. Contact Lens & Light." }, 409);
    const existing = await sql`SELECT account_id FROM photographer_accounts WHERE photographer_id = ${photographerId} OR lower(email) = ${email} LIMIT 1`;
    if (existing.length) return noStore({ error: "A photographer account already exists for this email or profile. Please sign in." }, 409);
    const accountId = newPhotographerAccountId();
    const passwordHash = await hashPhotographerPassword(password);
    const created = await sql`WITH claimed AS (
        UPDATE photographer_invitations SET used_at = now()
        WHERE invitation_id = ${String(invitation.invitation_id)}
          AND token_hash = ${hashInvitationToken(token)}
          AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        RETURNING photographer_id, email
      )
      INSERT INTO photographer_accounts (account_id, photographer_id, email, password_hash)
      SELECT ${accountId}, photographer_id, email, ${passwordHash} FROM claimed
      RETURNING account_id, photographer_id, email`;
    if (!created.length) return noStore({ error: "This invitation has already been used. Please sign in or request a new invitation." }, 409);
    try {
      const rows = await readValues("'02_PHOTOGRAPHERS'!A1:P2001");
      const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
      const expected = ["photographer_id","auth_user_id","registration_id","public_name","email","phone","bio","primary_location","categories","profile_image_url","hero_image_url","status","publish_state","membership_tier","created_at","updated_at"];
      if (headers.length !== expected.length || expected.some((header,index) => headers[index] !== header)) throw new Error("Photographer worksheet schema changed.");
      const matches = rows.slice(1).map((row,index)=>({row,rowNumber:index+2})).filter(item=>String(item.row[0] ?? "").trim()===photographerId);
      if (matches.length !== 1) throw new Error("Photographer record is no longer unique.");
      const current = matches[0];
      if (String(current.row[1] ?? "").trim() || String(current.row[4] ?? "").trim().toLowerCase() !== email || String(current.row[11] ?? "").trim().toUpperCase() !== "APPROVED") throw new Error("Photographer account link or approval state changed.");
      await batchUpdateValues([
        { range: `'02_PHOTOGRAPHERS'!B${current.rowNumber}`, values: [[accountId]] },
        { range: `'02_PHOTOGRAPHERS'!P${current.rowNumber}`, values: [[new Date().toISOString()]] }
      ]);
    } catch {
      await sql`UPDATE photographer_accounts SET account_state = 'suspended', updated_at = now() WHERE account_id = ${accountId}`;
      return noStore({ error: "Your account was created but the profile link could not be completed. Contact Lens & Light to finish setup." }, 503);
    }
    const response = noStore({ ok: true, message: "Your photographer account is ready." }, 201);
    response.cookies.set(PHOTOGRAPHER_COOKIE, photographerSessionCookie({ accountId, photographerId, email, exp: Date.now() + 8 * 60 * 60 * 1000 }), photographerCookieOptions());
    return response;
  } catch {
    return noStore({ error: "Account setup is temporarily unavailable. Confirm that the photographer account tables have been migrated." }, 503);
  }
}
