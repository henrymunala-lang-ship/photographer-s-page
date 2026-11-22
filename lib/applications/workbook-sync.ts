import "server-only";
import { createHash } from "node:crypto";
import {
  appendRows,
  getSpreadsheetMetadata,
  readValues,
  updateValues
} from "@/lib/integrations/google-sheets/client";
import { getDatabase } from "@/lib/database/neon";
import {
  APPLICATION_DETAILS_HEADERS,
  APPLICATION_MESSAGES_HEADERS
} from "@/lib/applications/workbook-preflight";

const REGISTRATION_HEADERS = [
  "registration_id", "full_name", "email", "phone", "primary_location",
  "status", "submitted_at", "verification_due_at"
] as const;
const ALLOWED_STATUSES = new Set([
  "pending", "under_review", "needs_information", "approved", "rejected", "withdrawn"
]);
const MAX_APPLICATIONS = 500;
const MAX_MESSAGES = 5000;

type SheetSnapshot = {
  headers: string[];
  rows: string[][];
  rowById: Map<string, number>;
  duplicates: string[];
};

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function columnName(index: number) {
  let value = index + 1, result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
function cell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
function iso(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("An application timestamp is invalid.");
  return date.toISOString();
}
function makeSnapshot(values: string[][], key: string): SheetSnapshot {
  const headers = (values[0] ?? []).map((value) => String(value ?? "").trim());
  const index = headers.indexOf(key);
  if (index < 0) throw new Error("A required worksheet key column is missing.");
  const rows = values.slice(1);
  const rowById = new Map<string, number>();
  const duplicates = new Set<string>();
  rows.forEach((row, offset) => {
    const id = String(row[index] ?? "").trim();
    if (!id) return;
    if (rowById.has(id)) duplicates.add(id);
    else rowById.set(id, offset + 2);
  });
  return { headers, rows, rowById, duplicates: [...duplicates] };
}
function valuesFor(headers: string[], source: Record<string, unknown>, existing?: string[]) {
  const row = Array.from({ length: headers.length }, (_, index) => String(existing?.[index] ?? ""));
  for (const [key, value] of Object.entries(source)) {
    const index = headers.indexOf(key);
    if (index >= 0) row[index] = cell(value);
  }
  return row;
}
function changed(existing: string[] | undefined, next: string[]) {
  return next.some((value, index) => String(existing?.[index] ?? "") !== value);
}
async function claimOperation(idempotencyKey: string, registrationId: string, payloadHash: string) {
  const sql = getDatabase();
  const inserted = await sql`INSERT INTO application_operations
      (idempotency_key, registration_id, payload_hash, operation_state)
    VALUES (${idempotencyKey}, ${registrationId}, ${payloadHash}, 'pending')
    ON CONFLICT (idempotency_key) DO UPDATE
      SET operation_state = 'pending', payload_hash = EXCLUDED.payload_hash
      WHERE application_operations.operation_state = 'failed'
    RETURNING idempotency_key`;
  if (inserted.length) return "claimed" as const;
  const existing = await sql`SELECT operation_state FROM application_operations
    WHERE idempotency_key = ${idempotencyKey} LIMIT 1`;
  return String(existing[0]?.operation_state ?? "") === "completed"
    ? "completed" as const : "busy" as const;
}
async function finishOperation(key: string, state: "completed" | "failed") {
  const sql = getDatabase();
  await sql`UPDATE application_operations SET operation_state = ${state}
    WHERE idempotency_key = ${key}`;
}
async function writeRow(
  title: string,
  snapshot: SheetSnapshot,
  id: string,
  row: string[]
) {
  const existingRowNumber = snapshot.rowById.get(id);
  if (existingRowNumber) {
    const old = snapshot.rows[existingRowNumber - 2] ?? [];
    if (!changed(old, row)) return "unchanged" as const;
    const range = "'" + title + "'!A" + existingRowNumber + ":" +
      columnName(snapshot.headers.length - 1) + existingRowNumber;
    await updateValues(range, [row]);
    snapshot.rows[existingRowNumber - 2] = row;
    return "updated" as const;
  }
  await appendRows("'" + title + "'!A:" + columnName(snapshot.headers.length - 1), [row]);
  snapshot.rows.push(row);
  snapshot.rowById.set(id, snapshot.rows.length + 1);
  return "appended" as const;
}
async function syncEntity(input: {
  key: string;
  registrationId: string;
  payload: unknown;
  alreadyApplied: boolean;
  write: () => Promise<"appended" | "updated" | "unchanged">;
}) {
  const payloadHash = hash(input.payload);
  const state = await claimOperation(input.key, input.registrationId, payloadHash);
  if (state === "completed") return { state: "completed" as const, action: "already_synced" as const };
  if (state === "busy") {
    if (input.alreadyApplied) {
      await finishOperation(input.key, "completed");
      return { state: "completed" as const, action: "reconciled" as const };
    }
    return { state: "deferred" as const, action: "in_progress" as const };
  }
  try {
    const action = await input.write();
    await finishOperation(input.key, "completed");
    return { state: "completed" as const, action };
  } catch (error) {
    await finishOperation(input.key, "failed").catch(() => undefined);
    throw error;
  }
}

export async function syncApplicationsToWorkbook() {
  const metadata = await getSpreadsheetMetadata();
  const titles = new Set((metadata.sheets ?? []).map((sheet) => sheet.properties?.title));
  const requiredTabs = ["01_REGISTRATIONS", "23_APPLICATION_DETAILS", "24_APPLICATION_MESSAGES"];
  const missingTabs = requiredTabs.filter((title) => !titles.has(title));
  if (missingTabs.length) throw new Error("Required application worksheets are missing: " + missingTabs.join(", "));

  const [registrationValues, detailValues, messageValues] = await Promise.all([
    readValues("'01_REGISTRATIONS'!A1:ZZ5001"),
    readValues("'23_APPLICATION_DETAILS'!A1:K5001"),
    readValues("'24_APPLICATION_MESSAGES'!A1:I10001")
  ]);
  const registrations = makeSnapshot(registrationValues, "registration_id");
  const details = makeSnapshot(detailValues, "registration_id");
  const messages = makeSnapshot(messageValues, "message_id");

  const required = REGISTRATION_HEADERS.filter((header) => !registrations.headers.includes(header));
  if (required.length) throw new Error("The registration worksheet is missing required columns: " + required.join(", "));
  if (APPLICATION_DETAILS_HEADERS.some((header, i) => details.headers[i] !== header) ||
      details.headers.length !== APPLICATION_DETAILS_HEADERS.length) {
    throw new Error("The application details worksheet headers do not match the approved schema.");
  }
  if (APPLICATION_MESSAGES_HEADERS.some((header, i) => messages.headers[i] !== header) ||
      messages.headers.length !== APPLICATION_MESSAGES_HEADERS.length) {
    throw new Error("The application messages worksheet headers do not match the approved schema.");
  }
  const duplicates = [
    ...registrations.duplicates.map((id) => "01_REGISTRATIONS:" + id),
    ...details.duplicates.map((id) => "23_APPLICATION_DETAILS:" + id),
    ...messages.duplicates.map((id) => "24_APPLICATION_MESSAGES:" + id)
  ];
  if (duplicates.length) throw new Error("Duplicate workbook keys must be reconciled before sync: " + duplicates.slice(0, 10).join(", "));

  const sql = getDatabase();
  const applications = await sql`SELECT
      s.registration_id, s.applicant_name, s.applicant_email, s.applicant_phone,
      s.primary_location, s.status, s.created_at,
      s.created_at + interval '48 hours' AS verification_due_at,
      d.website_url, d.portfolio_url, d.instagram_url, d.additional_gallery_url,
      d.other_social_url, d.service_areas_text, d.categories_json
    FROM application_submissions s
    LEFT JOIN application_details d ON d.registration_id = s.registration_id
    ORDER BY s.created_at ASC, s.registration_id ASC
    LIMIT ${MAX_APPLICATIONS}`;
  const messagesFromDb = await sql`SELECT
      message_id, registration_id, sender_type, sender_ref, body,
      delivery_state, provider_message_ref, created_at, sent_at
    FROM application_messages
    ORDER BY created_at ASC, message_id ASC
    LIMIT ${MAX_MESSAGES}`;

  const counts = {
    applicationsRead: applications.length,
    messagesRead: messagesFromDb.length,
    registrationsAppended: 0, registrationsUpdated: 0,
    detailsAppended: 0, detailsUpdated: 0,
    messagesAppended: 0, messagesUpdated: 0,
    alreadyPresent: 0, deferred: 0, failed: 0
  };
  const failedIds: string[] = [];
  const completedRegistrations = new Set<string>();
  const incompleteRegistrations = new Set<string>();

  for (const app of applications) {
    const registrationId = String(app.registration_id);
    try {
      const status = String(app.status ?? "").trim().toLowerCase();
      if (!ALLOWED_STATUSES.has(status)) throw new Error("Unsupported application status.");
      const submittedAt = iso(app.created_at);
      const dueAt = iso(app.verification_due_at);
      const registrationData = {
        registration_id: registrationId,
        full_name: cell(app.applicant_name),
        email: cell(app.applicant_email),
        phone: cell(app.applicant_phone),
        primary_location: cell(app.primary_location),
        status,
        submitted_at: submittedAt,
        verification_due_at: dueAt
      };
      const registrationRow = valuesFor(registrations.headers, registrationData,
        registrations.rowById.has(registrationId)
          ? registrations.rows[registrations.rowById.get(registrationId)! - 2] : undefined);
      const registrationResult = await syncEntity({
        key: "workbook-sync:registration:" + registrationId + ":" + hash(registrationData),
        registrationId, payload: registrationData,
        alreadyApplied: !changed(
          registrations.rowById.has(registrationId)
            ? registrations.rows[registrations.rowById.get(registrationId)! - 2] : undefined,
          registrationRow
        ),
        write: () => writeRow("01_REGISTRATIONS", registrations, registrationId, registrationRow)
      });
      if (registrationResult.state === "deferred") { counts.deferred++; incompleteRegistrations.add(registrationId); continue; }
      if (registrationResult.action === "appended") counts.registrationsAppended++;
      else if (registrationResult.action === "updated") counts.registrationsUpdated++;
      else counts.alreadyPresent++;

      const detailData = {
        registration_id: registrationId,
        website_url: cell(app.website_url),
        portfolio_url: cell(app.portfolio_url),
        instagram_url: cell(app.instagram_url),
        additional_gallery_url: cell(app.additional_gallery_url),
        other_social_url: cell(app.other_social_url),
        service_areas_text: cell(app.service_areas_text),
        service_areas_normalized_json: "[]",
        categories_json: JSON.stringify(Array.isArray(app.categories_json) ? app.categories_json : []),
        created_at: submittedAt,
        updated_at: submittedAt
      };
      const detailRow = valuesFor(details.headers, detailData,
        details.rowById.has(registrationId)
          ? details.rows[details.rowById.get(registrationId)! - 2] : undefined);
      const detailResult = await syncEntity({
        key: "workbook-sync:details:" + registrationId + ":" + hash(detailData),
        registrationId, payload: detailData,
        alreadyApplied: !changed(
          details.rowById.has(registrationId)
            ? details.rows[details.rowById.get(registrationId)! - 2] : undefined,
          detailRow
        ),
        write: () => writeRow("23_APPLICATION_DETAILS", details, registrationId, detailRow)
      });
      if (detailResult.state === "deferred") { counts.deferred++; incompleteRegistrations.add(registrationId); continue; }
      if (detailResult.action === "appended") counts.detailsAppended++;
      else if (detailResult.action === "updated") counts.detailsUpdated++;
      else counts.alreadyPresent++;
      completedRegistrations.add(registrationId);
    } catch {
      counts.failed++;
      failedIds.push(registrationId);
      incompleteRegistrations.add(registrationId);
    }
  }

  for (const message of messagesFromDb) {
    const messageId = String(message.message_id);
    const registrationId = String(message.registration_id);
    if (!completedRegistrations.has(registrationId)) { counts.deferred++; incompleteRegistrations.add(registrationId); continue; }
    try {
      const createdAt = iso(message.created_at);
      const sentAt = message.sent_at ? iso(message.sent_at) : "";
      const messageData = {
        message_id: messageId,
        registration_id: registrationId,
        sender_type: cell(message.sender_type),
        sender_ref: cell(message.sender_ref),
        body: cell(message.body),
        delivery_state: cell(message.delivery_state),
        provider_message_ref: cell(message.provider_message_ref),
        created_at: createdAt,
        sent_at: sentAt
      };
      const messageRow = valuesFor(messages.headers, messageData,
        messages.rowById.has(messageId)
          ? messages.rows[messages.rowById.get(messageId)! - 2] : undefined);
      const result = await syncEntity({
        key: "workbook-sync:message:" + messageId + ":" + hash(messageData),
        registrationId, payload: messageData,
        alreadyApplied: !changed(
          messages.rowById.has(messageId)
            ? messages.rows[messages.rowById.get(messageId)! - 2] : undefined,
          messageRow
        ),
        write: () => writeRow("24_APPLICATION_MESSAGES", messages, messageId, messageRow)
      });
      if (result.state === "deferred") { counts.deferred++; incompleteRegistrations.add(registrationId); continue; }
      if (result.action === "appended") counts.messagesAppended++;
      else if (result.action === "updated") counts.messagesUpdated++;
      else counts.alreadyPresent++;
    } catch {
      counts.failed++;
      failedIds.push(messageId);
      incompleteRegistrations.add(registrationId);
    }
  }

  const capped = applications.length === MAX_APPLICATIONS || messagesFromDb.length === MAX_MESSAGES;
  if (!capped) {
    for (const registrationId of completedRegistrations) {
      if (!incompleteRegistrations.has(registrationId)) {
        await sql`UPDATE application_submissions SET workbook_sync_state = 'synced'
          WHERE registration_id = ${registrationId}`;
      }
    }
  }
  return { ...counts, failedIds: failedIds.slice(0, 20), capped };
}
