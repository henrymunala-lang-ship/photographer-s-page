import { NextRequest, NextResponse } from "next/server";
import { can, currentAdmin } from "@/lib/owner/admin-auth";
import { reviewApplication } from "@/lib/owner/application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ registrationId: string }> };
const DECISIONS = new Set(["under_review", "needs_information", "approved", "rejected"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); }
  catch { return false; }
}

export async function POST(request: NextRequest, context: Context) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Application review is restricted to Preview deployments.", code: "PREVIEW_ONLY" }, {
      status: 404, headers: { "Cache-Control": "private, no-store" }
    });
  }
  const actor = await currentAdmin();
  if (!actor || !can(actor, "applications:review")) {
    return NextResponse.json({ error: "Application review permission required." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "A same-origin JSON request is required." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }

  try {
    const { registrationId } = await context.params;
    const payload = await request.json();
    const decision = typeof payload?.decision === "string" ? payload.decision : "";
    const reason = typeof payload?.reason === "string" ? payload.reason : "";
    if (!DECISIONS.has(decision)) {
      return NextResponse.json({ error: "Choose a supported application decision." }, {
        status: 400, headers: { "Cache-Control": "private, no-store" }
      });
    }
    const result = await reviewApplication({
      registrationId, decision: decision as "under_review" | "needs_information" | "approved" | "rejected",
      reason, actor
    });
    return NextResponse.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "APPLICATION_NOT_FOUND" ? 404
      : message === "PREVIEW_ONLY" ? 404
      : message.includes("required") || message.includes("supported") ? 400
      : message.includes("already in progress") ? 409
      : message.includes("current status") || message.includes("eligible") || message.includes("published photographer") ? 409
      : 503;
    return NextResponse.json({
      error: status === 503 ? "The application decision could not be completed. The operation can be safely retried after checking the workbook." : message,
      code: status === 503 ? "APPLICATION_REVIEW_FAILED" : "APPLICATION_REVIEW_BLOCKED"
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
