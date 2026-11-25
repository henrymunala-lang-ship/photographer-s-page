import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { readValues } from "@/lib/integrations/google-sheets/client";
import { photographerSlug } from "@/lib/photographers/slug";
import { sendApplicationNotification } from "@/lib/applications/notifications";
import { createClientEnquiryAccessToken } from "@/lib/client-enquiries/access";
import { sendClientEnquiryEmail } from "@/lib/client-enquiries/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function secret() {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (value.length < 32) throw new Error("Enquiry security is not configured.");
  return value;
}
function rateKey(scope: string, identity: string) {
  return createHmac("sha256", secret()).update("client-enquiry:" + scope + ":" + identity).digest("hex");
}
async function consumeRateLimit(request: NextRequest, email: string) {
  const sql = getDatabase();
  const ip = request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  async function consume(key: string) {
    const rows = await sql`INSERT INTO application_rate_limits (rate_key, window_started_at, request_count)
      VALUES (${key}, now(), 1)
      ON CONFLICT (rate_key) DO UPDATE SET
        request_count = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour'
          THEN 1 ELSE application_rate_limits.request_count + 1 END,
        window_started_at = CASE WHEN application_rate_limits.window_started_at < now() - interval '1 hour'
          THEN now() ELSE application_rate_limits.window_started_at END,
        updated_at = now()
      RETURNING request_count`;
    return Number(rows[0]?.request_count ?? 999);
  }
  const [ipCount, emailCount] = await Promise.all([
    consume(rateKey("ip", ip)),
    consume(rateKey("email", email))
  ]);
  return ipCount > 5 || emailCount > 5;
}
async function findPublishedPhotographer(slug: string) {
  const rows = await readValues("'02_PHOTOGRAPHERS'!A1:P2001");
  const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
  const required = ["photographer_id","public_name","email","status","publish_state"];
  if (required.some(key => !headers.includes(key))) throw new Error("PHOTOGRAPHER_SCHEMA");
  const at = (row: string[], key: string) => String(row[headers.indexOf(key)] ?? "").trim();
  const matches = rows.slice(1).filter(row =>
    at(row, "status").toUpperCase() === "APPROVED" &&
    at(row, "publish_state").toUpperCase() === "PUBLISHED" &&
    photographerSlug(at(row, "public_name"), at(row, "photographer_id")) === slug
  );
  if (matches.length !== 1) return null;
  return {
    id: at(matches[0], "photographer_id"),
    name: at(matches[0], "public_name"),
    email: at(matches[0], "email")
  };
}

export async function POST(request: NextRequest, context: { params: { slug: string } }) {
  if (process.env.VERCEL_ENV !== "preview") return noStore({ error: "Enquiries are currently restricted to the Preview environment." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return noStore({ error: "Invalid request." }, 403);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 12_000) return noStore({ error: "The enquiry is too large." }, 413);
  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 12_000) return noStore({ error: "The enquiry is too large." }, 413);
    payload = JSON.parse(raw) as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid payload");
  } catch {
    return noStore({ error: "A valid enquiry is required." }, 400);
  }
  if (text(payload.website, 200)) return noStore({ ok: true, message: "Thank you. Your enquiry has been received." }, 202);

  const name = text(payload.name, 120);
  const email = text(payload.email, 254).toLowerCase();
  const phone = text(payload.phone, 40);
  const eventType = text(payload.eventType, 100);
  const eventDate = text(payload.eventDate, 10);
  const eventLocation = text(payload.eventLocation, 160);
  const message = text(payload.message, 4000);
  const validEventDate = !eventDate || (() => { const parsed = new Date(eventDate + "T00:00:00Z"); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === eventDate; })();
  if (name.length < 2 || !validEmail(email) || phone.length < 7 ||
      !/^[+0-9().\s-]+$/.test(phone) || eventType.length < 2 ||
      !validEventDate ||
      eventLocation.length < 2 || message.length < 20 || payload.consent !== true) {
    return noStore({ error: "Please complete the required fields and confirm that Lens & Light may use your details to respond." }, 400);
  }
  try {
    const photographer = await findPublishedPhotographer(context.params.slug);
    if (!photographer) return noStore({ error: "This photographer is not currently accepting enquiries." }, 404);
    const limited = await consumeRateLimit(request, email);
    if (limited) return noStore({ error: "Too many enquiries have been sent. Please try again later." }, 429);

    const enquiryId = "enq_" + randomUUID();
    const emailHash = createHash("sha256").update(email).digest("hex");
    const sql = getDatabase();
    // Keep Version 1 enquiry capture working until the additive V2 migration is applied.
    const inserted = await sql`INSERT INTO client_enquiries
      (enquiry_id, photographer_id, photographer_name, photographer_slug,
       customer_name, customer_email, customer_email_hash, customer_phone,
       event_type, event_date, event_location, message, status)
      VALUES (${enquiryId}, ${photographer.id}, ${photographer.name}, ${context.params.slug},
       ${name}, ${email}, ${emailHash}, ${phone}, ${eventType},
       ${eventDate || null}::date, ${eventLocation}, ${message}, 'new')
      RETURNING enquiry_id, status, created_at`;
    let conversationPath = "";
    let customerNotification = "pending";
    let photographerNotification = "pending";
    try {
      await sql`UPDATE client_enquiries SET photographer_email = ${photographer.email} WHERE enquiry_id = ${enquiryId}`;
      await sql`INSERT INTO client_enquiry_messages
        (message_id, enquiry_id, sender_type, sender_ref, sender_name, body)
        VALUES (${"msg_" + randomUUID()}, ${enquiryId}, 'customer', ${emailHash}, ${name}, ${message})`;
      const access = await createClientEnquiryAccessToken(enquiryId);
      const confirmationAccess = await createClientEnquiryAccessToken(enquiryId);
      const customerAccessUrl = request.nextUrl.origin + "/enquiries/" + encodeURIComponent(enquiryId) + "#access=" + encodeURIComponent(access.token);
      const [customerMail, photographerMail] = await Promise.all([
        sendClientEnquiryEmail({
          to: email,
          subject: "We received your Lens & Light enquiry",
          greeting: name,
          message: "Thank you for contacting " + photographer.name + ". Your enquiry has been received. You can use this private link to continue the conversation with the photographer. The link expires in 24 hours and can be used once.",
          actionLabel: "Open your private conversation",
          actionUrl: customerAccessUrl
        }),
        sendClientEnquiryEmail({
          to: photographer.email,
          subject: "New client enquiry — Lens & Light",
          greeting: photographer.name,
          message: "A new enquiry has arrived for your published profile. Sign in to your photographer workspace to review the details and reply privately.",
          actionLabel: "Open photographer workspace",
          actionUrl: request.nextUrl.origin + "/photographer"
        })
      ]);
      customerNotification = customerMail.state;
      photographerNotification = photographerMail.state;
      conversationPath = "/enquiries/" + encodeURIComponent(enquiryId) + "#access=" + encodeURIComponent(confirmationAccess.token);
      await sql`UPDATE client_enquiries SET
        customer_notification_state = ${customerNotification},
        photographer_notification_state = ${photographerNotification}
        WHERE enquiry_id = ${enquiryId}`;
    } catch (threadError) {
      console.warn("[client-enquiry] messaging activation pending", {
        errorName: threadError instanceof Error ? threadError.name : "UnknownError"
      });
    }
    const ownerEmail = process.env.GOOGLE_OAUTH_OWNER_EMAIL ?? "";
    const notification = ownerEmail
      ? await sendApplicationNotification({
          kind: "owner",
          to: ownerEmail,
          recipientName: "Lens & Light support",
          subject: "New client enquiry — Lens & Light",
          message: "A new client enquiry has been received for " + photographer.name + ". Sign in to the Owner Workspace to review it."
        })
      : { state: "pending" as const, reason: "not_configured" as const };
    // Persist provider acceptance without allowing a status-write failure to undo the saved enquiry.
    try {
      await sql`UPDATE client_enquiries SET owner_notification_state = ${notification.state}
        WHERE enquiry_id = ${enquiryId}`;
    } catch (statusError) {
      console.warn("[client-enquiry] owner notification state could not be stored", {
        errorName: statusError instanceof Error ? statusError.name : "UnknownError"
      });
    }
    return noStore({
      ok: true,
      enquiry: inserted[0],
      notification: notification.state,
      customerNotification,
      photographerNotification,
      ...(conversationPath ? { conversationPath } : {}),
      message: conversationPath
        ? "Thank you. Your enquiry has been securely sent to " + photographer.name + ". You can continue the conversation using the private link below."
        : "Thank you. Your enquiry has been received and securely recorded. The private conversation feature will be available once the V2 database setup is complete."
    }, 201);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
    console.error("[client-enquiry] submission failed", { errorName: error instanceof Error ? error.name : "UnknownError", databaseCode: code || "unclassified" });
    return noStore({ error: "Your enquiry could not be saved just now. Please try again later." }, 503);
  }
}
