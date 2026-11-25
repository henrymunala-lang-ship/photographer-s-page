import "server-only";
import { createHmac, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/database/neon";

export const APPLICANT_COOKIE = "ll_applicant_session";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type ApplicantSession = {
  tokenId: string;
  registrationId: string;
  exp: number;
};

function secret() {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (value.length < 32) throw new Error("Applicant session signing is not configured.");
  return value;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encodeSession(session: ApplicantSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return payload + "." + sign(payload);
}

function decodeSession(value: string): ApplicantSession | null {
  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ApplicantSession;
    if (!session.tokenId || !session.registrationId || !Number.isFinite(session.exp) || session.exp <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function createApplicantAccessToken(registrationId: string) {
  const sql = getDatabase();
  const rawToken = randomBytes(32).toString("base64url");
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await sql`INSERT INTO applicant_access_tokens
    (token_id, registration_id, token_hash, expires_at)
    VALUES (${tokenId}, ${registrationId}, ${digest(rawToken)}, ${expiresAt})`;
  return {
    token: rawToken,
    expiresAt,
    accessPath: "/application/updates#access=" + encodeURIComponent(rawToken)
  };
}

export async function exchangeApplicantAccessToken(rawToken: string) {
  if (rawToken.length < 32 || rawToken.length > 256) return null;
  const sql = getDatabase();
  // Claim the link atomically on first exchange. A concurrent or later replay
  // cannot mint another applicant session from the same private link.
  const rows = await sql`UPDATE applicant_access_tokens
    SET last_used_at = now()
    WHERE token_hash = ${digest(rawToken)}
      AND last_used_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    RETURNING token_id, registration_id`;
  if (!rows.length) return null;
  const session: ApplicantSession = {
    tokenId: String(rows[0].token_id),
    registrationId: String(rows[0].registration_id),
    exp: Date.now() + SESSION_TTL_MS
  };
  return { cookie: encodeSession(session), registrationId: session.registrationId };
}

export async function getApplicantSession(request: NextRequest) {
  const raw = request.cookies.get(APPLICANT_COOKIE)?.value;
  if (!raw) return null;
  const session = decodeSession(raw);
  if (!session) return null;
  const sql = getDatabase();
  const rows = await sql`SELECT token_id
    FROM applicant_access_tokens
    WHERE token_id = ${session.tokenId}
      AND registration_id = ${session.registrationId}
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1`;
  return rows.length ? session : null;
}

export function applicantCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000)
  };
}
