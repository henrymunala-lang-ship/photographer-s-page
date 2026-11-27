import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, can, appendAudit } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ registrationId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const origin = request.headers.get("origin");
  let originMatches = false;
  try { originMatches = !!origin && new URL(origin).host === request.headers.get("host"); } catch { originMatches = false; }
  if (!originMatches) {
    return NextResponse.json({ error: "A same-origin request is required." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Recovery links can only be issued from the Preview workspace." }, { status: 404 });
  }
  const actor = await currentAdmin();
  if (!actor || !can(actor, "applications:read")) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }
  const { registrationId } = await context.params;
  if (!/^reg_[0-9a-f-]{36}$/i.test(registrationId)) {
    return NextResponse.json({ error: "Application record not found." }, { status: 404 });
  }

  try {
    const sql = getDatabase();
    const rows = await sql`SELECT registration_id, applicant_email, status
      FROM application_submissions WHERE registration_id = ${registrationId} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ error: "Application record not found." }, { status: 404 });
    const application = rows[0];
    if (!["pending", "under_review", "needs_information", "approved"].includes(String(application.status))) {
      return NextResponse.json({ error: "A recovery link cannot be issued for an application in this status." }, { status: 409 });
    }
    const accounts = await sql`SELECT account_id FROM photographer_applicant_accounts
      WHERE registration_id = ${registrationId} LIMIT 1`;
    if (accounts.length) {
      return NextResponse.json({ error: "A photographer sign-in account already exists. Use the photographer sign-in page instead." }, { status: 409 });
    }

    const token = randomBytes(32).toString("base64url");
    const tokenId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await sql`UPDATE applicant_access_tokens
      SET revoked_at = now()
      WHERE registration_id = ${registrationId}
        AND revoked_at IS NULL AND expires_at > now()`;
    await sql`INSERT INTO applicant_access_tokens
      (token_id, registration_id, token_hash, expires_at)
      VALUES (${tokenId}, ${registrationId}, ${tokenHash}, ${expiresAt}::timestamptz)`;

    await appendAudit(actor, "application.access_link.reissued", "application", registrationId, {
      expiresAt, previousActiveLinksRevoked: true
    });

    return NextResponse.json({
      ok: true,
      accessPath: "/application/updates#access=" + encodeURIComponent(token),
      expiresAt
    }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "A recovery link could not be issued. Please try again." }, { status: 503 });
  }
}
