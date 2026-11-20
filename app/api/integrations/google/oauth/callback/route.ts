import { NextRequest, NextResponse } from "next/server";
import { googleOAuthStateCookie, verifyOAuthState } from "@/lib/integrations/google-oauth/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

type GoogleUser = { email?: string; email_verified?: boolean };

function htmlPage(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px;color:#202124"><h1>${title}</h1>${body}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      }
    }
  );
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state") ?? "";
  const stateCookie = request.cookies.get(googleOAuthStateCookie.name)?.value;

  const clearCookie = (response: NextResponse) => {
    response.cookies.set(googleOAuthStateCookie.name, "", {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/api/integrations/google/oauth", maxAge: 0
    });
    return response;
  };

  const codeVerifier = verifyOAuthState(stateCookie, returnedState);\n  if (!codeVerifier) {
    return clearCookie(htmlPage("Authorization could not be verified", "<p>The security check failed or expired. Restart the owner setup from the Lens &amp; Light setup page.</p>", 400));
  }
  if (url.searchParams.has("error") || !code) {
    return clearCookie(htmlPage("Google authorization was not completed", "<p>No workbook connection was created. You can close this page and restart when ready.</p>", 400));
  }

  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ?? "";\n  if (!redirectUri) return clearCookie(htmlPage("Setup is incomplete", "<p>The fixed OAuth redirect URI is not configured in the Preview environment.</p>", 503));
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",\n      code_verifier: codeVerifier
    }),
    cache: "no-store"
  });

  const token = await tokenResponse.json() as TokenResponse;
  if (!tokenResponse.ok || !token.access_token) {
    return clearCookie(htmlPage("Google token exchange failed", "<p>Check the OAuth client configuration and exact redirect URI in Google Cloud Console. No credentials have been saved.</p>", 502));
  }

  const identityResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
    cache: "no-store"
  });
  const identity = await identityResponse.json() as GoogleUser;
  const expectedOwner = (process.env.GOOGLE_OAUTH_OWNER_EMAIL ?? "").trim().toLowerCase();

  if (!identityResponse.ok || !identity.email_verified || !identity.email ||
      !expectedOwner || identity.email.toLowerCase() !== expectedOwner) {
    return clearCookie(htmlPage("Google account not authorized", "<p>The verified Google account does not match the configured workbook owner. No refresh token was retained. Revoke the app grant in Google Account security if this was unexpected.</p>", 403));
  }

  if (!(token.scope ?? "").split(" ").includes("https://www.googleapis.com/auth/drive.file")) {\n    return clearCookie(htmlPage("Required file permission was not granted", "<p>The grant does not include the narrow Drive file scope. No refresh token was retained.</p>", 403));\n  }\n\n  if (!token.refresh_token) {
    return clearCookie(htmlPage("A refresh token was not issued", "<p>Google did not return an offline refresh token. Revoke the existing grant for this OAuth client, then restart authorization with consent. No durable connection has been created.</p>", 400));
  }

  // This deliberately avoids persisting the long-lived credential in application storage.
  // The owner transfers it directly into a Preview-only Vercel Secret, never through chat.
  const safeEmail = identity.email.replace(/[&<>"']/g, "");
  const escapedToken = token.refresh_token.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const body = `<p>Google verified <strong>${safeEmail}</strong>. The authorization grant has the requested Drive file scope. The refresh token is shown once below because this project does not yet have a durable secret vault integration.</p><p><strong>Next:</strong> copy this value directly into the Vercel project as a Secret named <code>GOOGLE_OAUTH_REFRESH_TOKEN</code>, scoped only to Preview and branch <code>integration-foundation</code>. Do not paste it into chat, GitHub, Sheets or source code.</p><textarea readonly rows="4" style="box-sizing:border-box;width:100%;padding:12px">${escapedToken}</textarea><p>After saving it in Vercel, close this page. Then continue with the workbook file-selection and read-only verification step. This page does not claim that the workbook has been selected or connected.</p>`;
  return clearCookie(htmlPage("Owner identity verified", body));
}
