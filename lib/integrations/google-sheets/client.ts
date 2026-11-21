import "server-only";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleApiError = {
  error?: { message?: string; status?: string };
};

export type SpreadsheetMetadata = {
  spreadsheetId: string;
  properties?: { title?: string };
  sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
};

export class GoogleSheetsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSheetsConfigurationError";
  }
}

export class GoogleSheetsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "GoogleSheetsApiError";
  }
}

let cachedToken: { value: string; expiresAt: number } | undefined;
let tokenRequest: Promise<string> | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new GoogleSheetsConfigurationError(`Missing server configuration: ${name}`);
  return value;
}

export function getSpreadsheetId(): string {
  return requiredEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const body = new URLSearchParams({
      client_id: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: requiredEnv("GOOGLE_OAUTH_REFRESH_TOKEN"),
      grant_type: "refresh_token"
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store"
    });

    const payload = (await response.json()) as GoogleTokenResponse;
    if (!response.ok || !payload.access_token) {
      // Never include OAuth response bodies or credential values in thrown errors/logs.
      throw new GoogleSheetsApiError(
        "Google authorization could not be refreshed. Re-authorize the workbook integration if the refresh token was revoked or expired.",
        response.status,
        response.status === 429 || response.status >= 500
      );
    }

    cachedToken = {
      value: payload.access_token,
      expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000
    };
    return payload.access_token;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = undefined;
  }
}

async function sheetsRequest<T>(
  path: string,
  init: RequestInit = {},
  attempt = 0
): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers
    },
    cache: "no-store"
  });

  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    const delay = Math.min(250 * 2 ** attempt + Math.floor(Math.random() * 150), 2_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return sheetsRequest<T>(path, init, attempt + 1);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as GoogleApiError;
    throw new GoogleSheetsApiError(
      payload.error?.message ?? "Google Sheets request failed.",
      response.status,
      response.status === 429 || response.status >= 500
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function encodeRange(range: string): string {
  return encodeURIComponent(range);
}

export async function getSpreadsheetMetadata(): Promise<SpreadsheetMetadata> {
  const id = encodeURIComponent(getSpreadsheetId());
  return sheetsRequest<SpreadsheetMetadata>(
    `/spreadsheets/${id}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title)`
  );
}

export async function readValues(range: string): Promise<string[][]> {
  const id = encodeURIComponent(getSpreadsheetId());
  const result = await sheetsRequest<{ values?: string[][] }>(
    `/spreadsheets/${id}/values/${encodeRange(range)}`
  );
  return result.values ?? [];
}

export async function appendRows(
  range: string,
  values: Array<Array<string | number | boolean | null>>
): Promise<{ updatedRange?: string; updates?: { updatedRows?: number } }> {
  if (values.length === 0) throw new Error("Refusing to append an empty batch.");
  const id = encodeURIComponent(getSpreadsheetId());
  return sheetsRequest(
    `/spreadsheets/${id}/values/${encodeRange(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values }) }
  );
}

export async function updateValues(
  range: string,
  values: Array<Array<string | number | boolean | null>>
): Promise<{ updatedRange?: string; updatedRows?: number }> {
  if (values.length === 0) throw new Error("Refusing to write an empty batch.");
  const id = encodeURIComponent(getSpreadsheetId());
  return sheetsRequest(
    `/spreadsheets/${id}/values/${encodeRange(range)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ majorDimension: "ROWS", values }) }
  );
}
export async function batchUpdateSpreadsheet(
  requests: Array<Record<string, unknown>>
): Promise<{ replies?: unknown[] }> {
  if (requests.length === 0) throw new Error("Refusing to submit an empty spreadsheet batch.");
  const id = encodeURIComponent(getSpreadsheetId());
  return sheetsRequest(
    `/spreadsheets/${id}:batchUpdate`,
    { method: "POST", body: JSON.stringify({ requests }) }
  );
}
