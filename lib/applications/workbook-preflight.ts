import "server-only";
import {
  getSpreadsheetMetadata,
  readValues
} from "@/lib/integrations/google-sheets/client";

const REGISTRATION_REQUIRED_HEADERS = [
  "registration_id",
  "full_name",
  "email",
  "phone",
  "primary_location",
  "status",
  "submitted_at",
  "verification_due_at"
] as const;

export const APPLICATION_DETAILS_HEADERS = [
  "registration_id",
  "website_url",
  "portfolio_url",
  "instagram_url",
  "additional_gallery_url",
  "other_social_url",
  "service_areas_text",
  "service_areas_normalized_json",
  "categories_json",
  "created_at",
  "updated_at"
] as const;

export const APPLICATION_MESSAGES_HEADERS = [
  "message_id",
  "registration_id",
  "sender_type",
  "sender_ref",
  "body",
  "delivery_state",
  "provider_message_ref",
  "created_at",
  "sent_at"
] as const;

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function compareHeaders(actual: string[], expected: readonly string[]) {
  const normalized = actual.map(normalizeHeader);
  const empty = normalized.every((value) => !value);
  return {
    empty,
    exact: expected.length === normalized.length &&
      expected.every((value, index) => normalized[index] === value),
    missing: expected.filter((value) => !normalized.includes(value)),
    unexpected: normalized.filter((value) => value && !expected.includes(value))
  };
}

export async function inspectApplicationWorkbookSchema() {
  const metadata = await getSpreadsheetMetadata();
  const tabs = new Map(
    (metadata.sheets ?? []).map((sheet) => [
      String(sheet.properties?.title ?? ""),
      Number(sheet.properties?.sheetId ?? -1)
    ])
  );

  const registrationTabExists = tabs.has("01_REGISTRATIONS");
  if (!registrationTabExists) {
    return {
      workbookTitle: metadata.properties?.title ?? null,
      safeToMigrate: false,
      registrationTab: { exists: false, missingHeaders: [...REGISTRATION_REQUIRED_HEADERS] },
      applicationDetailsTab: { exists: tabs.has("23_APPLICATION_DETAILS"), state: "not_checked" },
      applicationMessagesTab: { exists: tabs.has("24_APPLICATION_MESSAGES"), state: "not_checked" },
      statusVocabulary: [],
      note: "The existing registration worksheet is missing. No workbook changes were made."
    };
  }

  const registrationHeaders = await readValues("'01_REGISTRATIONS'!A1:ZZ1");
  const actualRegistrationHeaders = registrationHeaders[0] ?? [];
  const missingRegistrationHeaders = REGISTRATION_REQUIRED_HEADERS.filter(
    (header) => !actualRegistrationHeaders.map(normalizeHeader).includes(header)
  );
  const statusIndex = actualRegistrationHeaders.findIndex(
    (header) => normalizeHeader(header) === "status"
  );
  let statusVocabulary: Array<{ value: string; count: number }> = [];
  if (statusIndex >= 0) {
    const values = await readValues(
      "'01_REGISTRATIONS'!" + columnName(statusIndex) + "2:" + columnName(statusIndex) + "2000"
    );
    const counts = new Map<string, number>();
    for (const row of values) {
      const value = String(row[0] ?? "").trim();
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    statusVocabulary = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
      .slice(0, 30);
  }

  async function inspectAdditiveTab(title: string, expected: readonly string[]) {
    if (!tabs.has(title)) return { exists: false, state: "missing" as const, missingHeaders: [...expected] };
    const values = await readValues("'" + title + "'!A1:Z1");
    const comparison = compareHeaders(values[0] ?? [], expected);
    if (comparison.empty) return { exists: true, state: "empty" as const, missingHeaders: [...expected] };
    if (comparison.exact) return { exists: true, state: "verified" as const, missingHeaders: [] as string[] };
    return {
      exists: true,
      state: "header_mismatch" as const,
      missingHeaders: comparison.missing,
      unexpectedHeaders: comparison.unexpected
    };
  }

  const details = await inspectAdditiveTab("23_APPLICATION_DETAILS", APPLICATION_DETAILS_HEADERS);
  const messages = await inspectAdditiveTab("24_APPLICATION_MESSAGES", APPLICATION_MESSAGES_HEADERS);
  const safeToMigrate =
    missingRegistrationHeaders.length === 0 &&
    (details.state === "missing" || details.state === "empty" || details.state === "verified") &&
    (messages.state === "missing" || messages.state === "empty" || messages.state === "verified");

  return {
    workbookTitle: metadata.properties?.title ?? null,
    safeToMigrate,
    registrationTab: {
      exists: true,
      requiredHeadersFound: REGISTRATION_REQUIRED_HEADERS.filter(
        (header) => !missingRegistrationHeaders.includes(header)
      ),
      missingHeaders: missingRegistrationHeaders
    },
    applicationDetailsTab: details,
    applicationMessagesTab: messages,
    statusVocabulary,
    note: "Read-only preflight. No worksheet rows, headers, or workbook settings were changed."
  };
}
