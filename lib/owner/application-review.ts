import "server-only";
import { createHash } from "node:crypto";
import { appendRows, readValues, updateValues } from "@/lib/integrations/google-sheets/client";
import { getDatabase } from "@/lib/database/neon";
import type { AdminSession } from "@/lib/owner/admin-auth";

const REGISTRATION_HEADERS = [
  "registration_id", "full_name", "email", "phone", "primary_location",
  "status", "submitted_at", "verification_due_at"
] as const;
const PHOTOGRAPHER_HEADERS = [
  "photographer_id", "auth_user_id", "registration_id", "public_name", "email",
  "phone", "bio", "primary_location", "categories", "profile_image_url",
  "hero_image_url", "status", "publish_state", "membership_tier", "created_at", "updated_at"
] as const;
const AUDIT_HEADERS = [
  "audit_id", "actor_type", "actor_id", "action", "target_type",
  "target_id", "metadata_json", "ip_hash", "created_at"
] as const;
const EVENT_HEADERS = [
  "event_id", "registration_id", "status", "due_at", "reviewed_at",
  "reviewer_admin_id", "decision_reason", "resubmission_of", "created_at"
] as const;

type Decision = "under_review" | "needs_information" | "approved" | "rejected";
type SheetRow = string[];

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function cell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
function columnName(index: number) {
  let n = index + 1, result = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
function indexOf(headers: string[], key: string) {
  const index = headers.indexOf(key);
  if (index < 0) throw new Error("Workbook schema is missing required column: " + key);
  return index;
}
function rowFor(headers: string[], values: Record<string, unknown>, existing?: SheetRow) {
  const row = Array.from({ length: headers.length }, (_, index) => String(existing?.[index] ?? ""));
  for (const [key, value] of Object.entries(values)) {
    const index = headers.indexOf(key);
    if (index >= 0) row[index] = cell(value);
  }
  return row;
}
function rowNumber(rows: SheetRow[], headers: string[], key: string, value: string) {
  const index = indexOf(headers, key);
  const matches: number[] = [];
  rows.slice(1).forEach((row, offset) => {
    if (String(row[index] ?? "").trim() === value) matches.push(offset + 2);
  });
  if (matches.length > 1) throw new Error("Duplicate workbook records were found for " + key + ".");
  return matches[0] ?? 0;
}
async function writeRow(title: string, headers: string[], rows: SheetRow[], key: string, value: string, next: SheetRow) {
  const existing = rowNumber(rows, headers, key, value);
  if (existing) {
    const old = rows[existing - 1] ?? [];
    if (next.every((item, index) => String(old[index] ?? "") === item)) return;
    await updateValues("'" + title + "'!A" + existing + ":" + columnName(headers.length - 1) + existing, [next]);
    rows[existing - 1] = next;
    return;
  }
  await appendRows("'" + title + "'!A:" + columnName(headers.length - 1), [next]);
  rows.push(next);
}
async function claimOperation(key: string, registrationId: string, payloadHash: string) {
  const sql = getDatabase();
  const inserted = await sql`INSERT INTO application_operations
      (idempotency_key, registration_id, payload_hash, operation_state)
    VALUES (${key}, ${registrationId}, ${payloadHash}, 'started')
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING idempotency_key`;
  if (inserted.length) return "claimed" as const;
  const retried = await sql`UPDATE application_operations
    SET operation_state = 'started', payload_hash = ${payloadHash},
        attempt_count = attempt_count + 1, updated_at = now(), last_error_code = NULL
    WHERE idempotency_key = ${key} AND operation_state = 'failed'
    RETURNING idempotency_key`;
  if (retried.length) return "claimed" as const;
  const existing = await sql`SELECT operation_state FROM application_operations
    WHERE idempotency_key = ${key} LIMIT 1`;
  return String(existing[0]?.operation_state ?? "") === "completed"
    ? "completed" as const : "busy" as const;
}
async function finishOperation(key: string, state: "completed" | "failed", errorCode?: string) {
  const sql = getDatabase();
  await sql`UPDATE application_operations
    SET operation_state = ${state}, last_error_code = ${errorCode ?? null}, updated_at = now()
    WHERE idempotency_key = ${key}`;
}
async function appendOnce(
  title: string,
  headers: string[],
  rows: SheetRow[],
  keyColumn: string,
  keyValue: string,
  row: SheetRow
) {
  await writeRow(title, headers, rows, keyColumn, keyValue, row);
}
function exactHeaders(actual: string[], expected: readonly string[], title: string) {
  const missing = expected.filter((header) => !actual.includes(header));
  if (missing.length) throw new Error(title + " is missing required columns: " + missing.join(", "));
}
function safeCategories(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((item) => String(item).trim()).filter(Boolean).join(", ").slice(0, 1000);
}

export async function reviewApplication(input: {
  registrationId: string;
  decision: Decision;
  reason: string;
  actor: AdminSession;
}) {
  if (process.env.VERCEL_ENV !== "preview") throw new Error("PREVIEW_ONLY");
  if (!/^reg_[0-9a-f-]{36}$/i.test(input.registrationId)) throw new Error("APPLICATION_NOT_FOUND");
  if ((input.decision === "rejected" || input.decision === "needs_information") && !input.reason.trim()) {
    throw new Error("A reason is required for this decision.");
  }
  const reason = input.reason.trim().slice(0, 1000);
  const sql = getDatabase();
  const records = await sql`SELECT
      s.registration_id, s.applicant_name, s.applicant_email, s.applicant_phone,
      s.primary_location, s.introduction, s.status, s.created_at,
      s.created_at + interval '48 hours' AS verification_due_at,
      d.categories_json
    FROM application_submissions s
    LEFT JOIN application_details d ON d.registration_id = s.registration_id
    WHERE s.registration_id = ${input.registrationId} LIMIT 1`;
  if (!records.length) throw new Error("APPLICATION_NOT_FOUND");
  const application = records[0];
  const currentStatus = String(application.status ?? "").toLowerCase();
  if (currentStatus !== input.decision && !["pending", "under_review", "needs_information"].includes(currentStatus)) {
    throw new Error("This application can no longer be reviewed from its current status.");
  }

  const operationKey = "application-review:" + input.registrationId + ":" + input.decision;
  const payloadHash = digest(JSON.stringify({ registrationId: input.registrationId, decision: input.decision, reason }));
  const claim = await claimOperation(operationKey, input.registrationId, payloadHash);
  if (claim === "completed") return { state: "already_completed" as const, decision: input.decision };
  if (claim === "busy") throw new Error("This application review is already in progress. Refresh and try again.");

  try {
    const [registrationValues, photographerValues, eventValues, auditValues] = await Promise.all([
      readValues("'01_REGISTRATIONS'!A1:ZZ5001"),
      readValues("'02_PHOTOGRAPHERS'!A1:P2001"),
      readValues("'16_VERIFICATION_EVENTS'!A1:I5001"),
      readValues("'14_AUDIT_LOG'!A1:I5001")
    ]);
    const registrationHeaders = (registrationValues[0] ?? []).map((v) => String(v ?? "").trim());
    const photographerHeaders = (photographerValues[0] ?? []).map((v) => String(v ?? "").trim());
    const eventHeaders = (eventValues[0] ?? []).map((v) => String(v ?? "").trim());
    const auditHeaders = (auditValues[0] ?? []).map((v) => String(v ?? "").trim());
    exactHeaders(registrationHeaders, REGISTRATION_HEADERS, "01_REGISTRATIONS");
    exactHeaders(photographerHeaders, PHOTOGRAPHER_HEADERS, "02_PHOTOGRAPHERS");
    exactHeaders(eventHeaders, EVENT_HEADERS, "16_VERIFICATION_EVENTS");
    exactHeaders(auditHeaders, AUDIT_HEADERS, "14_AUDIT_LOG");

    const registrationId = String(application.registration_id);
    const createdAt = new Date(String(application.created_at));
    if (Number.isNaN(createdAt.getTime())) throw new Error("Application submission timestamp is invalid.");
    const reviewedAt = new Date().toISOString();
    const dueAt = new Date(createdAt.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const registrationRows = registrationValues as SheetRow[];
    const photographerRows = photographerValues as SheetRow[];
    const eventRows = eventValues as SheetRow[];
    const auditRows = auditValues as SheetRow[];

    const registrationExisting = rowNumber(registrationRows, registrationHeaders, "registration_id", registrationId);
    const registrationOld = registrationExisting ? registrationRows[registrationExisting - 1] : undefined;
    const registrationData: Record<string, unknown> = {
      registration_id: registrationId,
      full_name: application.applicant_name,
      email: application.applicant_email,
      phone: application.applicant_phone,
      primary_location: application.primary_location,
      status: input.decision,
      submitted_at: createdAt.toISOString(),
      verification_due_at: dueAt,
      last_reviewed_at: reviewedAt,
      updated_at: reviewedAt
    };
    if (input.decision === "rejected") registrationData.rejection_reason = reason;
    if (input.decision === "needs_information" || input.decision === "under_review") registrationData.verification_notes = reason;
    const registrationNext = rowFor(registrationHeaders, registrationData, registrationOld);
    await appendOnce("01_REGISTRATIONS", registrationHeaders, registrationRows, "registration_id", registrationId, registrationNext);

    let photographerId: string | null = null;
    if (input.decision === "approved") {
      const existingRow = rowNumber(photographerRows, photographerHeaders, "registration_id", registrationId);
      const existing = existingRow ? photographerRows[existingRow - 1] : undefined;
      const idIndex = indexOf(photographerHeaders, "photographer_id");
      photographerId = existing ? String(existing[idIndex] ?? "").trim() : "phot_" + digest(registrationId).slice(0, 32);
      if (!photographerId) throw new Error("An existing photographer record has no photographer ID.");
      const duplicateIdRow = rowNumber(photographerRows, photographerHeaders, "photographer_id", photographerId);
      if (duplicateIdRow && duplicateIdRow !== existingRow) throw new Error("The generated photographer ID is already assigned to another record.");
      const publishIndex = indexOf(photographerHeaders, "publish_state");
      if (existing && String(existing[publishIndex] ?? "").toUpperCase() === "PUBLISHED" && currentStatus !== "approved") {
        throw new Error("An existing published photographer record needs manual reconciliation before approval.");
      }
      const photographerData: Record<string, unknown> = {
        photographer_id: photographerId,
        auth_user_id: existing?.[indexOf(photographerHeaders, "auth_user_id")] ?? "",
        registration_id: registrationId,
        public_name: application.applicant_name,
        email: application.applicant_email,
        phone: application.applicant_phone,
        bio: application.introduction,
        primary_location: application.primary_location,
        categories: safeCategories(application.categories_json),
        status: "APPROVED",
        publish_state: existing?.[publishIndex] || "UNPUBLISHED",
        membership_tier: existing?.[indexOf(photographerHeaders, "membership_tier")] || "free",
        created_at: existing?.[indexOf(photographerHeaders, "created_at")] || reviewedAt,
        updated_at: reviewedAt
      };
      const photographerNext = rowFor(photographerHeaders, photographerData, existing);
      await appendOnce("02_PHOTOGRAPHERS", photographerHeaders, photographerRows, "registration_id", registrationId, photographerNext);
    }

    const eventId = "vev_" + digest(operationKey).slice(0, 32);
    const eventRow = rowFor(eventHeaders, {
      event_id: eventId,
      registration_id: registrationId,
      status: input.decision,
      due_at: dueAt,
      reviewed_at: reviewedAt,
      reviewer_admin_id: input.actor.adminId,
      decision_reason: reason,
      resubmission_of: "",
      created_at: reviewedAt
    });
    await appendOnce("16_VERIFICATION_EVENTS", eventHeaders, eventRows, "event_id", eventId, eventRow);

    await sql`UPDATE application_submissions
      SET status = ${input.decision}, updated_at = now()
      WHERE registration_id = ${registrationId}`;

    const auditId = "audit_" + digest(operationKey).slice(0, 32);
    const auditExists = rowNumber(auditRows, auditHeaders, "audit_id", auditId);
    if (!auditExists) {
      const auditRow = rowFor(auditHeaders, {
        audit_id: auditId, actor_type: "admin", actor_id: input.actor.adminId,
        action: "application." + input.decision, target_type: "application",
        target_id: registrationId,
        metadata_json: JSON.stringify({ decision: input.decision, reason, photographerId, membershipTier: input.decision === "approved" ? "free" : null, publishState: input.decision === "approved" ? "UNPUBLISHED" : null }),
        ip_hash: "", created_at: reviewedAt
      });
      await appendRows("'14_AUDIT_LOG'!A:I", [auditRow]);
    }

    await finishOperation(operationKey, "completed");
    return { state: "completed" as const, decision: input.decision, photographerId };
  } catch (error) {
    await finishOperation(operationKey, "failed", "WORKBOOK_REVIEW_FAILED").catch(() => undefined);
    throw error;
  }
}
