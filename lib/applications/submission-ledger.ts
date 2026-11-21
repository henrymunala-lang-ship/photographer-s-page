import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/database/neon";

export type ApplicationSubmissionInput = {
  name: string;
  email: string;
  phone: string;
  town: string;
  region: string;
  categories: string[];
  introduction: string;
  serviceAreas: string;
  websiteUrl?: string;
  portfolioUrl?: string;
  instagramUrl: string;
  additionalGalleryUrl: string;
  otherSocialUrl?: string;
};

function signingSecret() {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (value.length < 32) throw new Error("Application signing is not configured.");
  return value;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function emailFingerprint(email: string) {
  return createHmac("sha256", signingSecret()).update(email).digest("hex");
}

function encryptAccessToken(token: string) {
  const key = createHash("sha256").update(signingSecret()).update(":applicant-link-encryption-v1").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

function decryptAccessToken(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Stored applicant access token is invalid.");
  const key = createHash("sha256").update(signingSecret()).update(":applicant-link-encryption-v1").digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function stablePayload(input: ApplicationSubmissionInput) {
  return JSON.stringify({
    name: input.name,
    email: input.email,
    phone: input.phone,
    town: input.town,
    region: input.region,
    categories: [...input.categories].sort(),
    introduction: input.introduction,
    serviceAreas: input.serviceAreas,
    websiteUrl: input.websiteUrl ?? "",
    portfolioUrl: input.portfolioUrl ?? "",
    instagramUrl: input.instagramUrl,
    additionalGalleryUrl: input.additionalGalleryUrl,
    otherSocialUrl: input.otherSocialUrl ?? ""
  });
}

export async function createApplicationSubmission(
  input: ApplicationSubmissionInput,
  idempotencyKey: string
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const payloadHash = hash(stablePayload({ ...input, email: normalizedEmail }));
  const registrationId = "reg_" + randomUUID();
  const messageId = "appmsg_" + randomUUID();
  const tokenId = randomUUID();
  const rawAccessToken = randomBytes(32).toString("base64url");
  const tokenHash = hash(rawAccessToken);
  const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const workbookEventId = "appout_" + randomUUID();
  const emailEventId = "appout_" + randomUUID();
  const encryptedToken = encryptAccessToken(rawAccessToken);
  const sql = getDatabase();

  const created = await sql`WITH inserted_application AS (
      INSERT INTO application_submissions (
        registration_id, idempotency_key, payload_hash, applicant_name,
        applicant_email, applicant_email_hash, applicant_phone,
        primary_location, introduction, status, workbook_sync_state
      ) VALUES (
        ${registrationId}, ${idempotencyKey}, ${payloadHash}, ${input.name},
        ${normalizedEmail}, ${emailFingerprint(normalizedEmail)}, ${input.phone},
        ${input.town + ", " + input.region}, ${input.introduction}, 'pending', 'pending'
      )
      ON CONFLICT DO NOTHING
      RETURNING registration_id
    ), inserted_details AS (
      INSERT INTO application_details (
        registration_id, website_url, portfolio_url, instagram_url,
        additional_gallery_url, other_social_url, service_areas_text, categories_json
      )
      SELECT registration_id, ${input.websiteUrl || null}::text, ${input.portfolioUrl || null}::text,
        ${input.instagramUrl}::text, ${input.additionalGalleryUrl}::text, ${input.otherSocialUrl || null}::text,
        ${input.serviceAreas}::text, ${JSON.stringify(input.categories)}::jsonb
      FROM inserted_application
      RETURNING registration_id
    ), inserted_message AS (
      INSERT INTO application_messages (
        message_id, registration_id, sender_type, sender_ref, body, delivery_state
      )
      SELECT ${messageId}, registration_id, 'system', 'system',
        'Your application has been received and is awaiting review.', 'not_required'
      FROM inserted_application
      RETURNING message_id
    ), inserted_token AS (
      INSERT INTO applicant_access_tokens (token_id, registration_id, token_hash, expires_at)
      SELECT ${tokenId}, registration_id, ${tokenHash}, ${tokenExpiry}::timestamptz
      FROM inserted_application
      RETURNING token_id
    ), inserted_operation AS (
      INSERT INTO application_operations (
        idempotency_key, registration_id, payload_hash, operation_state
      )
      SELECT ${idempotencyKey}, registration_id, ${payloadHash}, 'completed'
      FROM inserted_application
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING idempotency_key
    ), inserted_workbook_event AS (
      INSERT INTO application_outbox (event_id, registration_id, event_type, payload)
      SELECT ${workbookEventId}, registration_id, 'application.workbook_sync',
        jsonb_build_object('registrationId', registration_id)
      FROM inserted_application
      RETURNING event_id
    ), inserted_email_event AS (
      INSERT INTO application_outbox (event_id, registration_id, event_type, payload)
      SELECT ${emailEventId}, registration_id, 'application.acknowledgement_email',
        jsonb_build_object('registrationId', registration_id, 'encryptedAccessToken', ${encryptedToken})
      FROM inserted_application
      RETURNING event_id
    )
    SELECT registration_id FROM inserted_application`;

  if (created.length) {
    return {
      created: true,
      registrationId: String(created[0].registration_id),
      accessLink: "/application/updates#access=" + encodeURIComponent(rawAccessToken),
      accessLinkExpiresAt: tokenExpiry
    };
  }

  const existing = await sql`SELECT registration_id, payload_hash
    FROM application_submissions WHERE idempotency_key = ${idempotencyKey} LIMIT 1`;
  if (!existing.length) {
    const duplicate = await sql`SELECT registration_id
      FROM application_submissions
      WHERE applicant_email_hash = ${emailFingerprint(normalizedEmail)}
        AND status IN ('pending','under_review','needs_information','approved')
      LIMIT 1`;
    if (duplicate.length) return { created: false, duplicate: true as const };
    throw new Error("The application submission could not be committed.");
  }
  if (String(existing[0].payload_hash).trim() !== payloadHash) {
    return { created: false, conflict: true as const };
  }
  const accessRows = await sql`SELECT payload->>'encryptedAccessToken' AS encrypted_access_token
    FROM application_outbox
    WHERE registration_id = ${String(existing[0].registration_id)}
      AND event_type = 'application.acknowledgement_email'
    ORDER BY created_at DESC LIMIT 1`;
  const encrypted = String(accessRows[0]?.encrypted_access_token ?? "");
  const replayToken = encrypted ? decryptAccessToken(encrypted) : "";
  const tokenRows = replayToken
    ? await sql`SELECT expires_at FROM applicant_access_tokens WHERE token_hash = ${hash(replayToken)} LIMIT 1`
    : [];
  return {
    created: false,
    registrationId: String(existing[0].registration_id),
    ...(replayToken && tokenRows.length ? {
      accessLink: "/application/updates#access=" + encodeURIComponent(replayToken),
      accessLinkExpiresAt: new Date(String(tokenRows[0].expires_at)).toISOString()
    } : {}),
    idempotentReplay: true as const
  };
}
