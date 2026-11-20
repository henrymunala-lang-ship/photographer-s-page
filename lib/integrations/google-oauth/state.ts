import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "ll_google_oauth_state";
const MAX_AGE_SECONDS = 600;

function secret(): string {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!value || value.length < 32) {
    throw new Error("Google OAuth state signing secret is not configured.");
  }
  return value;
}

export function createOAuthState(): { state: string; cookieValue: string } {
  const state = randomBytes(32).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ state, issuedAt })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { state, cookieValue: `${payload}.${signature}` };
}

export function verifyOAuthState(cookieValue: string | undefined, returnedState: string): string | null {
  if (!cookieValue || !returnedState) return null;
  const [payload, signature, extra] = cookieValue.split(".");
  if (!payload || !signature || extra) return null;

  const expected = createHmac("sha256", secret()).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      state?: string;
      issuedAt?: number;
    };
    const age = Math.floor(Date.now() / 1000) - Number(parsed.issuedAt);
    return typeof parsed.state === "string" &&
      parsed.state === returnedState &&
      Number.isFinite(age) && age >= 0 && age <= MAX_AGE_SECONDS;
  } catch {
    return false;
  }
}

export const googleOAuthStateCookie = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE_SECONDS
};
