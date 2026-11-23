import "server-only";
import { getDatabase } from "@/lib/database/neon";

export const APPLICATION_SCHEMA_VERSION = "application-storage-v4-photographer-self-service-accounts";

const statements = [
  `CREATE TABLE IF NOT EXISTS lens_light_schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS application_submissions (
    registration_id text PRIMARY KEY,
    idempotency_key text NOT NULL UNIQUE,
    payload_hash char(64) NOT NULL,
    applicant_name text NOT NULL,
    applicant_email text NOT NULL,
    applicant_email_hash char(64) NOT NULL,
    applicant_phone text NOT NULL,
    primary_location text NOT NULL,
    introduction text NOT NULL,
    status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','under_review','needs_information','approved','rejected','withdrawn')),
    workbook_sync_state text NOT NULL DEFAULT 'pending'
      CHECK (workbook_sync_state IN ('pending','synced','failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS application_submissions_email_hash_idx
    ON application_submissions (applicant_email_hash, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS application_active_email_unique_idx
    ON application_submissions (applicant_email_hash)
    WHERE status IN ('pending','under_review','needs_information','approved')`,
  `CREATE TABLE IF NOT EXISTS application_details (
    registration_id text PRIMARY KEY REFERENCES application_submissions(registration_id) ON DELETE CASCADE,
    website_url text,
    portfolio_url text,
    instagram_url text NOT NULL,
    additional_gallery_url text NOT NULL,
    other_social_url text,
    service_areas_text text NOT NULL,
    service_areas_normalized_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    categories_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS application_messages (
    message_id text PRIMARY KEY,
    registration_id text NOT NULL REFERENCES application_submissions(registration_id) ON DELETE CASCADE,
    sender_type text NOT NULL CHECK (sender_type IN ('applicant','admin','system')),
    sender_ref text NOT NULL,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    delivery_state text NOT NULL DEFAULT 'not_required'
      CHECK (delivery_state IN ('not_required','pending','sent','failed')),
    provider_message_ref text,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS application_messages_thread_idx
    ON application_messages (registration_id, created_at, message_id)`,
  `CREATE TABLE IF NOT EXISTS applicant_access_tokens (
    token_id text PRIMARY KEY,
    registration_id text NOT NULL REFERENCES application_submissions(registration_id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    last_used_at timestamptz,
    last_message_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS applicant_access_tokens_registration_idx
    ON applicant_access_tokens (registration_id, expires_at)`,
  `CREATE TABLE IF NOT EXISTS application_operations (
    idempotency_key text PRIMARY KEY,
    registration_id text,
    payload_hash char(64) NOT NULL,
    operation_state text NOT NULL CHECK (operation_state IN ('started','completed','failed')),
    attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS application_outbox (
    event_id text PRIMARY KEY,
    registration_id text NOT NULL REFERENCES application_submissions(registration_id) ON DELETE CASCADE,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','completed','failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS application_outbox_due_idx
    ON application_outbox (state, next_attempt_at, created_at)`,
  `CREATE TABLE IF NOT EXISTS photographer_accounts (
    account_id text PRIMARY KEY,
    photographer_id text NOT NULL UNIQUE,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    account_state text NOT NULL DEFAULT 'active' CHECK (account_state IN ('active','suspended')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS photographer_applicant_accounts (
    account_id text PRIMARY KEY,
    registration_id text NOT NULL UNIQUE REFERENCES application_submissions(registration_id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    account_state text NOT NULL DEFAULT 'active' CHECK (account_state IN ('active','suspended','converted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS photographer_account_setup_tokens (
    token_id text PRIMARY KEY,
    registration_id text NOT NULL REFERENCES application_submissions(registration_id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS photographer_account_setup_tokens_active_idx
    ON photographer_account_setup_tokens (registration_id, expires_at)
    WHERE used_at IS NULL AND revoked_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS photographer_invitations (
    invitation_id text PRIMARY KEY,
    photographer_id text NOT NULL,
    email text NOT NULL,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    revoked_at timestamptz,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS photographer_invitations_active_idx
    ON photographer_invitations (photographer_id, expires_at)
    WHERE used_at IS NULL AND revoked_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS application_rate_limits (
    rate_key char(64) PRIMARY KEY,
    window_started_at timestamptz NOT NULL DEFAULT now(),
    request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`
] as const;

export async function migrateApplicationDatabase() {
  const sql = getDatabase();
  const queries = statements.map((statement) => sql.query(statement, []));
  await sql.transaction(queries);
  await sql`INSERT INTO lens_light_schema_migrations (version)
    VALUES (${APPLICATION_SCHEMA_VERSION}) ON CONFLICT (version) DO NOTHING`;
  const rows = await sql`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(ARRAY[
        'lens_light_schema_migrations',
        'application_submissions',
        'application_details',
        'application_messages',
        'applicant_access_tokens',
        'application_operations',
        'application_outbox',
        'application_rate_limits',
        'photographer_accounts',
        'photographer_applicant_accounts',
        'photographer_account_setup_tokens',
        'photographer_invitations'
      ])`;
  const found = new Set(rows.map((row) => String(row.table_name)));
  const expected = [
    "lens_light_schema_migrations",
    "application_submissions",
    "application_details",
    "application_messages",
    "applicant_access_tokens",
    "application_operations",
    "application_outbox",
    "application_rate_limits",
    "photographer_accounts",
    "photographer_applicant_accounts",
    "photographer_account_setup_tokens",
    "photographer_invitations"
  ];
  const missing = expected.filter((table) => !found.has(table));
  if (missing.length) throw new Error("Application database schema verification failed.");
  return { version: APPLICATION_SCHEMA_VERSION, tablesVerified: expected.length };
}
