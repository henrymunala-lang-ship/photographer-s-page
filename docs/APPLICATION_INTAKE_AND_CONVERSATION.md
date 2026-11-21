# Application intake and applicant conversation storage

**Status:** Approved implementation contract; workbook migration and live writes are not yet performed  
**Branch:** `integration-foundation` (Preview only)  
**Compatibility:** Preserve all existing 22 worksheets and their headers.

## Decisions

1. The application is its own workflow. It is not an enquiry and must never be written to `07_ENQUIRIES` or `08_MESSAGES`.
2. Every applicant clarification request, applicant reply, and administrator response belongs to the same application, linked by `registration_id`.
3. Applicant conversations are private. No customer or photographer Google sign-in is introduced.
4. Existing workbook records are preserved. New worksheets are additive and must be created only through a versioned, verified migration.
5. The existing `01_REGISTRATIONS` queue remains the established owner-facing registration record until a migration is explicitly implemented and tested. No silent replacement or repurposing.
6. No application submission is reported as successful until the complete persistence path and recovery behavior are verified.

## Proposed additive worksheet contracts

### `23_APPLICATION_DETAILS`

One row per application. This is the structured extension for fields that do not have dedicated columns in the current `01_REGISTRATIONS` schema. The row is keyed by `registration_id`.

| Column | Purpose |
|---|---|
| `registration_id` | Parent key; must match `01_REGISTRATIONS.registration_id` |
| `website_url` | Optional website |
| `portfolio_url` | Optional primary portfolio |
| `instagram_url` | Required Instagram profile |
| `additional_gallery_url` | Required additional gallery |
| `other_social_url` | Optional social/profile URL |
| `service_areas_text` | Applicant's original free-text service area answer |
| `service_areas_normalized_json` | Server-normalized candidate locations; never inferred from untrusted coordinates |
| `categories_json` | Validated category array |
| `created_at` | UTC ISO timestamp |
| `updated_at` | UTC ISO timestamp |

This preserves the original applicant wording while keeping later location normalization explicit. Do not silently convert free text into coordinates or create rows in `15_PHOTOGRAPHER_SERVICE_AREAS` before the application is approved and locations are verified.

### `24_APPLICATION_MESSAGES`

Append-only conversation events. Every row is linked to the application using `registration_id`.

| Column | Purpose |
|---|---|
| `message_id` | Unique message identifier |
| `registration_id` | Parent application |
| `sender_type` | `applicant`, `admin`, or `system` |
| `sender_ref` | Internal admin ID or non-identifying applicant reference |
| `body` | Plain-text message with strict length limits |
| `delivery_state` | `not_required`, `pending`, `sent`, `failed`; persistence and delivery are distinct |
| `provider_message_ref` | Optional provider message ID; never a secret |
| `created_at` | UTC ISO timestamp |
| `sent_at` | UTC ISO timestamp when delivery is confirmed; otherwise blank |

Messages are append-only. Corrections are new events; do not overwrite conversation history. Do not reuse `08_MESSAGES`, whose parent key is `enquiry_id`.

## Application lifecycle

Canonical lifecycle values must be enforced in server code and mapped explicitly to the current workbook vocabulary before writes are enabled:

- `pending`: received, awaiting review
- `under_review`: verification in progress
- `needs_information`: reviewer has requested clarification
- `approved`: approved; profile may remain unpublished
- `rejected`: not approved
- `withdrawn`: applicant withdrew

The proposed photographer publication rule remains separate: only an approved photographer with an explicitly published profile may appear in the public directory. Existing values in `02_PHOTOGRAPHERS.publish_state` are lowercase `draft`, `published`, and `unpublished`; do not change them as part of application intake.

## Applicant access and reply path

- Applicant access must use a high-entropy, revocable, expiring capability token. Store only a cryptographic hash server-side; never store or log the raw token.
- The token must be scoped to one `registration_id`, rate-limited, and compared in constant time.
- A token must not grant access to other applications, owner tools, photographer workspaces, or unrelated customer enquiries.
- A token should be rotated/revoked on suspected compromise and have an explicit expiry/recovery process.
- Applicant and administrator messages are stored in `24_APPLICATION_MESSAGES`; sending email is a separate delivery side effect.
- The current project has no configured transactional email provider. Until one is configured and delivery is verified, do not claim that acknowledgement or reply notifications are emailed. The initial secure access/recovery UX must be finalized alongside the delivery provider so applicants are not locked out if they lose a link.

## Write-safety gates — all required

Google Sheets does not enforce unique constraints or provide a multi-worksheet transaction. The current `appendRows` helper is not idempotent. Therefore the public form must remain explicitly preview-only until all of the following are implemented and tested:

1. **Schema migration:** read worksheet metadata and exact headers; create only the two additive tabs above; initialize exact headers; verify the resulting schema; never clear, rename, or rewrite existing tabs.
2. **Concurrency-safe idempotency:** use a durable shared uniqueness/locking primitive for submission keys and normalized active-applicant identity. An in-memory map or a pre-append scan alone is not sufficient on serverless instances.
3. **Recoverable persistence:** persist the parent registration, detail record, and initial conversation event through a durable operation ledger/outbox with explicit pending/completed/failed states and a repair/reconciliation path. Never return success if a partial write remains unresolved.
4. **Duplicate policy:** define how active applications, prior rejected applications, and resubmissions are handled. Do not disclose whether a particular email address has an application; use a privacy-safe response.
5. **Validation:** server-side limits and normalization for names, email, phone, URLs, categories, service-area text, message body, consent and request size. Reject unsafe URL schemes and malformed values.
6. **Abuse controls:** durable rate limiting, honeypot, origin/content-type checks, request IDs and redacted security logging. Do not rely on client-side validation alone.
7. **Audit and privacy:** audit privileged review/message actions; restrict applicant evidence and messages to the applicant capability and authorized administrators; define retention and deletion handling.
8. **Delivery:** choose and configure a transactional email provider, verify sender/domain and delivery webhooks, and track delivery separately from persisted messages.
9. **Tests:** cover retries, duplicate concurrent requests, partial failures, token expiry/revocation, unauthorized cross-application access, message length limits and workbook schema drift using synthetic data in Preview.

## Implementation sequence

1. Keep the current form labelled Preview Only while building the storage migration and persistence safeguards.
2. Add the additive worksheet migration and verify exact headers without changing the existing 22 tabs.
3. Implement a durable idempotency/operation ledger and application repository adapter.
4. Implement application submission and owner queue/detail integration.
5. Implement the applicant capability-link and application message thread.
6. Configure email delivery and test acknowledgement/reply notifications.
7. Only then remove Preview Only language and enable real submissions.

## Current verified boundary

The Google OAuth integration has previously passed a read-only workbook metadata check, and the public directory API has returned a valid empty result. Those checks do not verify application writes, message writes, email delivery, concurrency safety, or applicant access. No application data or worksheet structure is changed by this document.
