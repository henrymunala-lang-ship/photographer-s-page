import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { createClientEnquiryAccessToken } from "@/lib/client-enquiries/access";
import { sendClientEnquiryEmail } from "@/lib/client-enquiries/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
function secret() {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (value.length < 32) throw new Error("Rate limiting is not configured.");
  return value;
}
function rateKey(scope: string, value: string) {
  return createHmac("sha256", secret()).update("client-enquiry-access:" + scope + ":" + value).digest("hex");
}
async function consume(key: string) {
  const sql = getDatabase();
  const rows = await sql`INSERT INTO application_rate_limits (rate_key, window_started_at, request_count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (rate_key) DO UPDATE SET
      request_count = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN 1 ELSE application_rate_limits.request_count + 1 END,
      window_started_at = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN now() ELSE application_rate_limits.window_started_at END,
      updated_at = now()
    RETURNING request_count`;
  return Number(rows[0]?.request_count ?? 999);
}
export async function POST(request: NextRequest, context: { params: { enquiryId: string } }) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Preview only." }, { status: 404, headers: noStore });
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: noStore });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const id = context.params.enquiryId;
  if (!/^enq_[0-9a-f-]{36}$/i.test(id) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter the email address used for this enquiry." }, { status: 400, headers: noStore });
  }
  try {
    const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const [ipCount, emailCount] = await Promise.all([consume(rateKey("ip", ip)), consume(rateKey("email", email))]);
    if (ipCount > 8 || emailCount > 5) return NextResponse.json({ error: "Too many link requests. Please wait and try again." }, { status: 429, headers: noStore });
    const sql = getDatabase();
    const rows = await sql`SELECT enquiry_id, customer_name, customer_email
      FROM client_enquiries
      WHERE enquiry_id = ${id} AND customer_email_hash = encode(digest(${email}, 'sha256'), 'hex')
      LIMIT 1`;
    if (rows.length) {
      const token = await createClientEnquiryAccessToken(id);
      const url = request.nextUrl.origin + "/enquiries/" + encodeURIComponent(id) + "#access=" + encodeURIComponent(token.token);
      await sendClientEnquiryEmail({
        to: String(rows[0].customer_email),
        subject: "Your private Lens & Light conversation link",
        greeting: String(rows[0].customer_name),
        message: "You requested secure access to your private photographer enquiry. This link can be used once and expires in 24 hours.",
        actionLabel: "Open private conversation",
        actionUrl: url
      });
    }
    return NextResponse.json({ ok: true, message: "If the enquiry details match, a fresh private access link will be sent to that email address." }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "The access link could not be requested just now." }, { status: 503, headers: noStore });
  }
}
