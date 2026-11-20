import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = "ll_owner_preview_session";
const MAX_AGE = 8 * 60 * 60;

function expireLegacyCookie(response: NextResponse) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  // Append a separate Set-Cookie header: NextResponse.cookies is keyed by cookie
  // name, so setting the same name twice can replace the new root-path cookie.
  response.headers.append(
    "Set-Cookie",
    `${COOKIE}=; Path=/owner; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict${secure}`
  );
}

function signature(): string {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (secret.length < 32) throw new Error("Owner session signing is not configured.");
  return createHmac("sha256", secret).update("lens-light-owner-preview-v1").digest("base64url");
}

export async function POST(request: NextRequest) {
  const submitted = String((await request.json().catch(() => ({}))).setupKey ?? "");
  const configured = process.env.GOOGLE_OAUTH_SETUP_KEY ?? "";
  if (!configured || configured.length < 32 || submitted.length !== configured.length) {
    return NextResponse.json({ error: "Owner access could not be verified." }, { status: 401 });
  }
  const a = Buffer.from(submitted);
  const b = Buffer.from(configured);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Owner access could not be verified." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  // The same owner session protects /owner pages and /api/owner endpoints.
  response.cookies.set(COOKIE, signature(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: MAX_AGE
  });
  // Remove the legacy path-scoped cookie without replacing the new cookie.
  expireLegacyCookie(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: 0
  });
  // Also clear the legacy path-scoped cookie so it cannot mask sign-out.
  expireLegacyCookie(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
