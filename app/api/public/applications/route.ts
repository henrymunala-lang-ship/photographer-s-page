import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { migrateApplicationDatabase } from "@/lib/database/application-schema";
import {
  createApplicationSubmission,
  type ApplicationSubmissionInput
} from "@/lib/applications/submission-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = [
  "Weddings",
  "Portraits",
  "Commercial",
  "Events",
  "Fashion & editorial",
  "Family",
  "Product",
  "Travel & lifestyle"
] as const;

function secret() {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (value.length < 32) throw new Error("Application security is not configured.");
  return value;
}

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
  });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeHttpsUrl(value: unknown, required = false) {
  const raw = text(value, 2048);
  if (!raw) return required ? null : "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function rateKey(secretValue: string, scope: string, identity: string) {
  return createHmac("sha256", secretValue).update("application-submit:" + scope + ":" + identity).digest("hex");
}

async function consumeRateLimit(request: NextRequest, email: string) {
  const sql = getDatabase();
  const securitySecret = secret();
  // Prefer Vercel's platform-provided client IP header over forwarded values.
  const ip = request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  async function consume(key: string) {
    const rows = await sql`INSERT INTO application_rate_limits (rate_key, window_started_at, request_count)
      VALUES (${key}, now(), 1)
      ON CONFLICT (rate_key) DO UPDATE SET
        request_count = CASE
          WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN 1
          ELSE application_rate_limits.request_count + 1
        END,
        window_started_at = CASE
          WHEN application_rate_limits.window_started_at < now() - interval '1 hour' THEN now()
          ELSE application_rate_limits.window_started_at
        END,
        updated_at = now()
      RETURNING request_count`;
    return Number(rows[0]?.request_count ?? 999);
  }
  const [ipAttempts, emailAttempts] = await Promise.all([
    consume(rateKey(securitySecret, "ip", ip)),
    consume(rateKey(securitySecret, "email", email))
  ]);
  return { limited: ipAttempts > 5 || emailAttempts > 5 };
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return noStore({ error: "Invalid request." }, 403);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 24_000) return noStore({ error: "The application is too large." }, 413);

  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 24_000) return noStore({ error: "The application is too large." }, 413);
    payload = JSON.parse(raw) as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid payload.");
  } catch {
    return noStore({ error: "A valid application payload is required." }, 400);
  }

  // Quietly accept bot submissions without storing them or revealing the honeypot.
  if (text(payload.companyWebsite, 200)) {
    return noStore({ ok: true, message: "Thank you. Your application has been received." }, 202);
  }

  const name = text(payload.name, 120);
  const email = text(payload.email, 254).toLowerCase();
  const phone = text(payload.phone, 40);
  const town = text(payload.town, 100);
  const region = text(payload.region, 100);
  const introduction = text(payload.introduction, 2000);
  const serviceAreas = text(payload.serviceAreas, 800);
  const categories = Array.isArray(payload.categories)
    ? Array.from(new Set(payload.categories.filter((item): item is string => typeof item === "string").map(item => item.trim())))
    : [];
  const websiteUrl = safeHttpsUrl(payload.websiteUrl);
  const portfolioUrl = safeHttpsUrl(payload.portfolioUrl);
  const instagramUrl = safeHttpsUrl(payload.instagramUrl, true);
  const additionalGalleryUrl = safeHttpsUrl(payload.additionalGalleryUrl, true);
  const otherSocialUrl = safeHttpsUrl(payload.otherSocialUrl);

  if (
    name.length < 2 || !validEmail(email) || phone.length < 7 ||
    !/^[+0-9().\s-]+$/.test(phone) || town.length < 2 || region.length < 2 ||
    categories.length < 1 || categories.length > CATEGORIES.length ||
    categories.some(category => !CATEGORIES.includes(category as typeof CATEGORIES[number])) ||
    introduction.length < 30 || serviceAreas.length < 2 ||
    websiteUrl === null || portfolioUrl === null || !instagramUrl ||
    !additionalGalleryUrl || otherSocialUrl === null ||
    payload.consent !== true
  ) {
    return noStore({ error: "Please check the required fields, links, categories and consent before submitting." }, 400);
  }

  if (!instagramUrl || !["instagram.com", "www.instagram.com"].includes(new URL(instagramUrl).hostname)) {
    return noStore({ error: "Please provide a valid Instagram profile link." }, 400);
  }

  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return noStore({ error: "The submission could not be safely identified. Please reload the form and try again." }, 400);
  }

  try {
    await migrateApplicationDatabase();
    const rate = await consumeRateLimit(request, email);
    if (rate.limited) return noStore({ error: "Too many application attempts. Please try again later." }, 429);

    const input: ApplicationSubmissionInput = {
      name, email, phone, town, region, categories, introduction, serviceAreas,
      websiteUrl, portfolioUrl, instagramUrl, additionalGalleryUrl, otherSocialUrl
    };
    const result = await createApplicationSubmission(input, idempotencyKey);
    if ("conflict" in result && result.conflict) {
      return noStore({ error: "This submission key was already used for different application details. Please reload the form and try again." }, 409);
    }
    if ("duplicate" in result && result.duplicate) {
      return noStore({
        ok: true,
        duplicate: true,
        message: "If you already have an active application, please continue using your existing private application link. Otherwise, contact the Lens & Light team for help."
      }, 202);
    }
    return noStore({
      ok: true,
      registrationId: result.registrationId,
      accessLink: result.accessLink ?? null,
      accessLinkExpiresAt: result.accessLinkExpiresAt ?? null,
      idempotentReplay: "idempotentReplay" in result && result.idempotentReplay,
      message: "Your application has been securely recorded and is awaiting review. Save your private application link so you can follow up with the team."
    }, result.created ? 201 : 200);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "23505") {
      return noStore({
        ok: true,
        duplicate: true,
        message: "If you already have an active application, please continue using your existing private application link. Otherwise, contact the Lens & Light team for help."
      }, 202);
    }
    const requestId = randomUUID();
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error("[application-intake] submission failed", {
      requestId,
      errorName,
      databaseCode: code || "unclassified"
    });
    return noStore({
      error: "Your application could not be saved just now. Please try again later.",
      requestId
    }, 503);
  }
}
