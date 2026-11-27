import { NextRequest, NextResponse } from "next/server";
import { PHOTOGRAPHER_COOKIE, photographerCookieOptions } from "@/lib/photographers/auth";
import { PHOTOGRAPHER_APPLICANT_COOKIE, photographerApplicantCookieOptions } from "@/lib/photographers/applicant-session";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 403 }); }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(PHOTOGRAPHER_COOKIE, "", { ...photographerCookieOptions(), maxAge: 0 });
  response.cookies.set(PHOTOGRAPHER_APPLICANT_COOKIE, "", { ...photographerApplicantCookieOptions(), maxAge: 0 });
  return response;
}
