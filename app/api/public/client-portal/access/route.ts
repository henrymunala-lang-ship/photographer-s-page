import { NextRequest, NextResponse } from "next/server";
import { exchangeClientPortalAccessToken, clientPortalCookieName, clientEnquiryCookieOptions } from "@/lib/client-enquiries/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Preview only." }, { status: 404, headers: noStore });
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: noStore });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  try {
    const exchanged = await exchangeClientPortalAccessToken(token);
    if (!exchanged) return NextResponse.json({ error: "This portal link is invalid, expired or already used. Request a fresh link by email." }, { status: 400, headers: noStore });
    const response = NextResponse.json({ ok: true }, { headers: noStore });
    response.cookies.set(clientPortalCookieName, exchanged.cookie, clientEnquiryCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "Portal access could not be verified. Please try again." }, { status: 503, headers: noStore });
  }
}
