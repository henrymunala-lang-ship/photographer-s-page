import { createHash, createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { createClientPortalAccessToken } from "@/lib/client-enquiries/access";
import { sendClientEnquiryEmail } from "@/lib/client-enquiries/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
async function consume(key: string) {
  const sql = getDatabase();
  const rows = await sql`INSERT INTO application_rate_limits (rate_key, window_started_at, request_count)
    VALUES (${key}, now(), 1) ON CONFLICT (rate_key) DO UPDATE SET
      request_count = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN 1 ELSE application_rate_limits.request_count + 1 END,
      window_started_at = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN now() ELSE application_rate_limits.window_started_at END,
      updated_at = now() RETURNING request_count`;
  return Number(rows[0]?.request_count ?? 999);
}
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Preview only." }, { status: 404, headers: noStore });
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: noStore });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers: noStore });
  try {
    const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
    if (secret.length < 32) throw new Error("Rate limiting is not configured.");
    const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const emailHash = createHash("sha256").update(email).digest("hex");
    const ipKey = createHmac("sha256", secret).update("client-portal:ip:" + ip).digest("hex");
    const emailKey = createHmac("sha256", secret).update("client-portal:email:" + email).digest("hex");
    const [ipCount, emailCount] = await Promise.all([consume(ipKey), consume(emailKey)]);
    if (ipCount > 8 || emailCount > 5) return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429, headers: noStore });
    const sql = getDatabase();
    const rows = await sql`SELECT customer_name FROM client_enquiries WHERE customer_email_hash = ${emailHash} ORDER BY created_at DESC LIMIT 1`;
    if (rows.length) {
      const token = await createClientPortalAccessToken(emailHash);
      const url = request.nextUrl.origin + "/my-conversations#access=" + encodeURIComponent(token.token);
      await sendClientEnquiryEmail({
        to: email,
        subject: "Your Lens & Light client portal access",
        greeting: String(rows[0].customer_name || "there"),
        message: "You requested access to your Lens & Light client portal. This secure link is single-use and expires in 24 hours. Once opened, your portal session lasts up to 30 days.",
        actionLabel: "Open my conversations",
        actionUrl: url
      });
    }
    return NextResponse.json({ ok: true, message: "If this email address has Lens & Light enquiries, a secure portal link will be sent to it." }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "A portal link could not be requested just now." }, { status: 503, headers: noStore });
  }
}
