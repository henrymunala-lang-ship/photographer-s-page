import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createOAuthState, googleOAuthStateCookie } from "@/lib/integrations/google-oauth/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const submittedKey = String(form.get("setupKey") ?? "");
  const configuredKey = process.env.GOOGLE_OAUTH_SETUP_KEY ?? "";

  if (!configuredKey || configuredKey.length < 32 || submittedKey.length !== configuredKey.length) {
    return NextResponse.json({ error: "Owner setup is not enabled or the setup key is invalid." }, { status: 403 });
  }
  if (!timingSafeEqual(Buffer.from(submittedKey), Buffer.from(configuredKey))) {
    return NextResponse.json({ error: "Owner setup is not enabled or the setup key is invalid." }, { status: 403 });
  }

  const { state, challenge, cookieValue } = createOAuthState();
  const params = new URLSearchParams({
    client_id: required("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: required("GOOGLE_OAUTH_REDIRECT_URI"),
    response_type: "code",
    scope: "openid email profile https://www.googleapis.com/auth/spreadsheets",
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 303);
  response.cookies.set(googleOAuthStateCookie.name, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/google/oauth",
    maxAge: googleOAuthStateCookie.maxAge
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
