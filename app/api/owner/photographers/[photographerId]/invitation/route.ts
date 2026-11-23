import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { can, currentAdmin, appendAudit } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";
import { createInvitationToken, hashInvitationToken } from "@/lib/photographers/auth";
import { readPhotographerRecord } from "@/lib/photographers/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ photographerId: string }> };

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}

export async function POST(request: NextRequest, context: Context) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Photographer invitations are restricted to Preview deployments." }, { status: 404 });
  const actor = await currentAdmin();
  if (!actor || !can(actor, "photographers:edit")) return NextResponse.json({ error: "Photographer editing permission required." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "A same-origin request is required." }, { status: 403 });
  try {
    const { photographerId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(photographerId)) return NextResponse.json({ error: "Photographer record not found." }, { status: 404 });
    const record = await readPhotographerRecord(photographerId);
    if (!record) return NextResponse.json({ error: "Only approved photographer records can receive an account invitation." }, { status: 409 });
    const sql = getDatabase();
    const accounts = await sql`SELECT account_id FROM photographer_accounts WHERE photographer_id = ${photographerId} LIMIT 1`;
    if (accounts.length) return NextResponse.json({ error: "This photographer already has an account. Account recovery must be used instead of a new invitation." }, { status: 409 });
    await sql`UPDATE photographer_invitations SET revoked_at = now()
      WHERE photographer_id = ${photographerId} AND used_at IS NULL AND revoked_at IS NULL`;
    const token = createInvitationToken();
    const invitationId = "pinv_" + randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    await sql`INSERT INTO photographer_invitations
      (invitation_id, photographer_id, email, token_hash, expires_at, created_by)
      VALUES (${invitationId}, ${photographerId}, ${record.email}, ${hashInvitationToken(token)}, ${expiresAt}, ${actor.adminId})`;
    await appendAudit(actor, "photographer.account.invited", "photographer", photographerId, { email: record.email, invitationId, expiresAt });
    const invitationUrl = new URL("/photographer/invite#token=" + encodeURIComponent(token), request.nextUrl.origin).toString();
    return NextResponse.json({ ok: true, invitationUrl, expiresAt, email: record.email }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "The photographer invitation could not be created. Confirm that the account tables have been migrated." }, { status: 503 });
  }
}
