import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const PHOTOGRAPHER_APPLICANT_COOKIE = "ll_photographer_applicant_session";
type Session = { accountId: string; registrationId: string; exp: number };
function secret() {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (value.length < 32) throw new Error("Photographer account session signing is not configured.");
  return value;
}
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
export function createPhotographerApplicantSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return payload + "." + sign(payload);
}
export function readPhotographerApplicantSession(request: NextRequest): Session | null {
  try {
    const value = request.cookies.get(PHOTOGRAPHER_APPLICANT_COOKIE)?.value ?? "";
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload)), actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (!session.accountId || !session.registrationId || !Number.isFinite(session.exp) || session.exp <= Date.now()) return null;
    return session;
  } catch { return null; }
}
export function photographerApplicantCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 8 * 60 * 60 };
}
