import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { currentAdmin, can } from "@/lib/owner/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "admins:manage")) {
    return NextResponse.json({ error: "Super Admin access required." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Same-origin request required." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = (process.env.GOOGLE_OAUTH_OWNER_EMAIL || "").trim().toLowerCase();
  if (!apiKey || !recipient) {
    return NextResponse.json({
      error: "Resend test is not configured. Check the Preview API key and owner email settings."
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: "Lens & Light <onboarding@resend.dev>",
      to: [recipient],
      subject: "Lens & Light — Resend delivery test",
      text: "This is a test email from the Lens & Light Preview environment. Resend is able to send from the free test sender. No photographer application was submitted and no customer data was processed.",
      html: "<div style=\"font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222\"><p style=\"letter-spacing:.12em;font-size:12px\">LENS &amp; LIGHT · PREVIEW TEST</p><h1 style=\"font-size:26px\">Email delivery is connected.</h1><p>This is a test message from the Lens &amp; Light Preview environment using Resend's free test sender.</p><p>No photographer application was submitted and no customer data was processed.</p><p style=\"color:#777;font-size:12px\">Sent to the configured owner email for delivery verification.</p></div>"
    });
    if (result.error) {
      return NextResponse.json({
        error: "Resend rejected the test email. Check the API key and Resend account restrictions.",
        providerError: result.error.message
      }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({
      ok: true,
      message: "Resend accepted the owner-only test email.",
      recipient,
      sender: "onboarding@resend.dev",
      emailId: result.data?.id ?? null
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      error: "The Resend test could not be sent. Check the Preview API key and try again."
    }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
