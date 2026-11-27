import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/database/neon";

export function clientEnquiryCookieName(enquiryId: string) { return "ll_client_enquiry_" + enquiryId; }
const LINK_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type EnquirySession = { tokenId: string; enquiryId: string; exp: number };\ntype PortalSession = { tokenId: string; emailHash: string; exp: number };\nexport const clientPortalCookieName = "ll_client_portal";

function secret() {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (value.length < 32) throw new Error("Customer enquiry session signing is not configured.");
  return value;
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}
function encodeSession(session: EnquirySession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return payload + "." + sign(payload);
}
function decodeSession(value: string): EnquirySession | null {
  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EnquirySession;
    if (!session.tokenId || !session.enquiryId || !Number.isFinite(session.exp) || session.exp <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function createClientEnquiryAccessToken(enquiryId: string) {
  const sql = getDatabase();
  const token = randomBytes(32).toString("base64url");
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
  await sql`INSERT INTO client_enquiry_access_tokens
    (token_id, enquiry_id, token_hash, expires_at)
    VALUES (${tokenId}, ${enquiryId}, ${digest(token)}, ${expiresAt})`;
  return { token, expiresAt };
}

export async function exchangeClientEnquiryAccessToken(rawToken: string) {
  if (rawToken.length < 32 || rawToken.length > 256) return null;
  const sql = getDatabase();
  const rows = await sql`UPDATE client_enquiry_access_tokens
    SET used_at = now(), session_expires_at = now() + interval '30 days'
    WHERE token_hash = ${digest(rawToken)}
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    RETURNING token_id, enquiry_id`;
  if (!rows.length) return null;
  const session: EnquirySession = {
    tokenId: String(rows[0].token_id),
    enquiryId: String(rows[0].enquiry_id),
    exp: Date.now() + SESSION_TTL_MS
  };
  return { cookie: encodeSession(session), enquiryId: session.enquiryId };
}

export async function createClientPortalAccessToken(emailHash: string) {
  const sql = getDatabase();
  const token = randomBytes(32).toString("base64url");
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
  await sql`INSERT INTO client_portal_access_tokens
    (token_id, customer_email_hash, token_hash, expires_at)
    VALUES (${tokenId}, ${emailHash}, ${digest(token)}, ${expiresAt})`;
  return { token, expiresAt };
}

export async function exchangeClientPortalAccessToken(rawToken: string) {
  if (rawToken.length < 32 || rawToken.length > 256) return null;
  const sql = getDatabase();
  const rows = await sql`UPDATE client_portal_access_tokens
    SET used_at = now(), session_expires_at = now() + interval '30 days'
    WHERE token_hash = ${digest(rawToken)}
      AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
    RETURNING token_id, customer_email_hash`;
  if (!rows.length) return null;
  const session: PortalSession = {
    tokenId: String(rows[0].token_id),
    emailHash: String(rows[0].customer_email_hash),
    exp: Date.now() + SESSION_TTL_MS
  };
  return { cookie: encodeSession(session as unknown as EnquirySession), emailHash: session.emailHash };
}

async function getPortalSession(request: NextRequest) {
  const raw = request.cookies.get(clientPortalCookieName)?.value;
  if (!raw) return null;
  try {
    const [payload, signature] = raw.split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PortalSession;
    if (!session.tokenId || !session.emailHash || !Number.isFinite(session.exp) || session.exp <= Date.now()) return null;
    const sql = getDatabase();
    const rows = await sql`SELECT token_id FROM client_portal_access_tokens
      WHERE token_id = ${session.tokenId} AND customer_email_hash = ${session.emailHash}
        AND used_at IS NOT NULL AND revoked_at IS NULL AND session_expires_at > now() LIMIT 1`;
    return rows.length ? session : null;
  } catch { return null; }
}

export async function getClientPortalConversations(request: NextRequest) {
  const session = await getPortalSession(request);
  if (!session) return null;
  const sql = getDatabase();
  const rows = await sql`SELECT e.enquiry_id, e.photographer_name, e.photographer_slug,
      e.event_type, e.event_date, e.event_location, e.status, e.created_at, e.updated_at,
      (SELECT count(*)::int FROM client_enquiry_messages m WHERE m.enquiry_id = e.enquiry_id) AS message_count,
      (SELECT max(m.created_at) FROM client_enquiry_messages m WHERE m.enquiry_id = e.enquiry_id) AS last_message_at
    FROM client_enquiries e
    WHERE e.customer_email_hash = ${session.emailHash}
    ORDER BY COALESCE((SELECT max(m.created_at) FROM client_enquiry_messages m WHERE m.enquiry_id = e.enquiry_id), e.updated_at) DESC
    LIMIT 100`;
  return rows;
}

export async function getClientEnquirySession(request: NextRequest, enquiryId: string) {
  const raw = request.cookies.get(clientEnquiryCookieName(enquiryId))?.value;
  if (raw) {
    const session = decodeSession(raw);
    if (session && session.enquiryId === enquiryId) {
      const sql = getDatabase();
      const rows = await sql`SELECT token_id FROM client_enquiry_access_tokens
        WHERE token_id = ${session.tokenId} AND enquiry_id = ${session.enquiryId}
          AND used_at IS NOT NULL AND revoked_at IS NULL AND session_expires_at > now() LIMIT 1`;
      if (rows.length) return session;
    }
  }
  const portal = await getPortalSession(request);
  if (!portal) return null;
  const sql = getDatabase();
  const allowed = await sql`SELECT enquiry_id FROM client_enquiries
    WHERE enquiry_id = ${enquiryId} AND customer_email_hash = ${portal.emailHash} LIMIT 1`;
  return allowed.length ? { tokenId: portal.tokenId, enquiryId, exp: portal.exp } : null;
}

export function clientEnquiryCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000)
  };
}
