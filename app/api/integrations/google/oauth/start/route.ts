import { NextResponse } from "next/server";
import { createOAuthState, googleOAuthStateCookie } from "@/lib/integrations/google-oauth/state";
import { can, currentAdmin } from "@/lib/owner/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export async function POST() {
  // Reuse the existing, independently authenticated Super Admin session.
  // This removes the forgotten bootstrap key without weakening owner access.
  const actor = await currentAdmin();
  if (!actor || !can(actor, "admins:manage")) {
    return NextResponse.json({ error: "An active Super Admin session is required." }, {
      status: 403,
      headers: { "Cache-Control": "private, no-store" }
    });
  }

  const { state, challenge, cookieValue } = createOAuthState();
  const params = new URLSearchParams({
    client_id: required("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: required("GOOGLE_OAUTH_REDIRECT_URI"),
    response_type: "code",
    scope: "openid email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
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
