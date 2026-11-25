import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/database/neon";

export const CLIENT_ENQUIRY_COOKIE = "ll_client_enquiry_session";
const LINK_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type EnquirySession = { tokenId: string; enquiryId: string; exp: number };

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

export async function getClientEnquirySession(request: NextRequest, enquiryId?: string) {
  const raw = request.cookies.get(CLIENT_ENQUIRY_COOKIE)?.value;
  if (!raw) return null;
  const session = decodeSession(raw);
  if (!session || (enquiryId && session.enquiryId !== enquiryId)) return null;
  const sql = getDatabase();
  const rows = await sql`SELECT token_id
    FROM client_enquiry_access_tokens
    WHERE token_id = ${session.tokenId}
      AND enquiry_id = ${session.enquiryId}
      AND used_at IS NOT NULL
      AND revoked_at IS NULL
      AND session_expires_at > now()
    LIMIT 1`;
  return rows.length ? session : null;
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
