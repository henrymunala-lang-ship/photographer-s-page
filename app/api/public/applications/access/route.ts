import { NextRequest, NextResponse } from "next/server";
import {
  APPLICANT_COOKIE,
  applicantCookieOptions,
  exchangeApplicantAccessToken
} from "@/lib/applications/applicant-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); }
  catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const payload = await request.json();
    const token = typeof payload?.token === "string" ? payload.token : "";
    const result = await exchangeApplicantAccessToken(token);
    if (!result) {
      return NextResponse.json({ error: "This application access link is invalid, expired or has been revoked." }, {
        status: 401, headers: { "Cache-Control": "private, no-store" }
      });
    }
    const response = NextResponse.json({ ok: true }, { headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer"
    }});
    response.cookies.set(APPLICANT_COOKIE, result.cookie, applicantCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "Applicant access could not be verified." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" }
    });
  }
}
