import "server-only";
import { getDatabase } from "@/lib/database/neon";

export const APPLICATION_SCHEMA_VERSION = "application-storage-v11-client-portal";

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
  `ALTER TABLE application_messages ADD COLUMN IF NOT EXISTS idempotency_key text`,
  `ALTER TABLE application_messages ADD COLUMN IF NOT EXISTS payload_hash char(64)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS application_messages_idempotency_idx
    ON application_messages (registration_id, sender_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL`,
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
  `ALTER TABLE photographer_accounts ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1`,
  `CREATE TABLE IF NOT EXISTS photographer_password_reset_tokens (
    token_id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES photographer_accounts(account_id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    revoked_at timestamptz,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS photographer_password_reset_active_idx
    ON photographer_password_reset_tokens (account_id, expires_at)
    WHERE used_at IS NULL AND revoked_at IS NULL`,
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
  `CREATE TABLE IF NOT EXISTS client_enquiries (
    enquiry_id text PRIMARY KEY,
    photographer_id text NOT NULL,
    photographer_name text NOT NULL,
    photographer_slug text NOT NULL,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_email_hash char(64) NOT NULL,
    customer_phone text NOT NULL,
    event_type text NOT NULL,
    event_date date,
    event_location text NOT NULL,
    message text NOT NULL CHECK (char_length(message) BETWEEN 20 AND 4000),
    status text NOT NULL DEFAULT 'new'
      CHECK (status IN ('new','in_progress','responded','closed')),
    internal_note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS client_enquiries_photographer_idx
    ON client_enquiries (photographer_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS client_enquiries_email_hash_idx
    ON client_enquiries (customer_email_hash, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS client_enquiries_status_idx
    ON client_enquiries (status, created_at DESC)`,
  `ALTER TABLE client_enquiries ADD COLUMN IF NOT EXISTS photographer_email text NOT NULL DEFAULT ''`,
  `ALTER TABLE client_enquiries ADD COLUMN IF NOT EXISTS customer_notification_state text NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE client_enquiries ADD COLUMN IF NOT EXISTS photographer_notification_state text NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE client_enquiries ADD COLUMN IF NOT EXISTS owner_notification_state text NOT NULL DEFAULT 'not_recorded'`,
  `CREATE TABLE IF NOT EXISTS client_enquiry_messages (
    message_id text PRIMARY KEY,
    enquiry_id text NOT NULL REFERENCES client_enquiries(enquiry_id) ON DELETE CASCADE,
    sender_type text NOT NULL CHECK (sender_type IN ('customer','photographer','admin','system')),
    sender_ref text NOT NULL,
    sender_name text NOT NULL,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    customer_read_at timestamptz,
    photographer_read_at timestamptz,
    owner_read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE client_enquiry_messages ADD COLUMN IF NOT EXISTS idempotency_key text`,
  `ALTER TABLE client_enquiry_messages ADD COLUMN IF NOT EXISTS payload_hash char(64)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS client_enquiry_messages_idempotency_idx
    ON client_enquiry_messages (enquiry_id, sender_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS client_enquiry_messages_thread_idx
    ON client_enquiry_messages (enquiry_id, created_at, message_id)`,
  `INSERT INTO client_enquiry_messages
    (message_id, enquiry_id, sender_type, sender_ref, sender_name, body, created_at)
    SELECT 'msg_initial_' || md5(enquiry_id), enquiry_id, 'customer', customer_email_hash,
      customer_name, message, created_at
    FROM client_enquiries
    ON CONFLICT (message_id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS client_enquiry_access_tokens (
    token_id text PRIMARY KEY,
    enquiry_id text NOT NULL REFERENCES client_enquiries(enquiry_id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    session_expires_at timestamptz,
    used_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS client_enquiry_access_tokens_thread_idx
    ON client_enquiry_access_tokens (enquiry_id, expires_at)`,
  `CREATE TABLE IF NOT EXISTS client_portal_access_tokens (
    token_id text PRIMARY KEY,
    customer_email_hash char(64) NOT NULL,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    session_expires_at timestamptz,
    used_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS client_portal_access_tokens_email_idx
    ON client_portal_access_tokens (customer_email_hash, expires_at)`,
  `CREATE TABLE IF NOT EXISTS application_rate_limits (
    rate_key char(64) PRIMARY KEY,
    window_started_at timestamptz NOT NULL DEFAULT now(),
    request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`
] as const;

export async function migrateApplicationDatabase() {
  const sql = getDatabase();
  const applied = await sql`SELECT version FROM lens_light_schema_migrations WHERE version = ${APPLICATION_SCHEMA_VERSION} LIMIT 1`;
  if (applied.length) {
    const indexes = await sql`SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY(ARRAY['application_messages_idempotency_idx','client_enquiry_messages_idempotency_idx'])`;
    const verified = new Set(indexes.map((row) => String(row.indexname)));
    if (!verified.has("application_messages_idempotency_idx") || !verified.has("client_enquiry_messages_idempotency_idx")) {
      throw new Error("Message idempotency index verification failed.");
    }
    const portal = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'client_portal_access_tokens' LIMIT 1`;
    if (!portal.length) throw new Error('Client portal access table verification failed.');
    return { version: APPLICATION_SCHEMA_VERSION, tablesVerified: 17, indexesVerified: 2 };
  }
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
        'client_enquiries',
        'client_enquiry_messages',
        'client_enquiry_access_tokens',
        'client_portal_access_tokens',
        'photographer_accounts',
        'photographer_applicant_accounts',
        'photographer_account_setup_tokens',
        'photographer_invitations',
        'photographer_password_reset_tokens'
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
    "client_enquiries",
    "client_enquiry_messages",
    "client_enquiry_access_tokens",
    "client_portal_access_tokens",
    "photographer_accounts",
    "photographer_applicant_accounts",
    "photographer_account_setup_tokens",
    "photographer_invitations",
    "photographer_password_reset_tokens"
  ];
  const missing = expected.filter((table) => !found.has(table));
  if (missing.length) throw new Error("Application database schema verification failed.");
  const indexes = await sql`SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY(ARRAY['application_messages_idempotency_idx','client_enquiry_messages_idempotency_idx'])`;
  const verifiedIndexes = new Set(indexes.map((row) => String(row.indexname)));
  if (!verifiedIndexes.has("application_messages_idempotency_idx") || !verifiedIndexes.has("client_enquiry_messages_idempotency_idx")) {
    throw new Error("Message idempotency index verification failed.");
  }
  return { version: APPLICATION_SCHEMA_VERSION, tablesVerified: expected.length, indexesVerified: 2 };
}
