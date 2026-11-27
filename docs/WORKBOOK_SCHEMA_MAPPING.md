# Lens & Light workbook-to-application mapping

**Status:** Step 2 schema mapping, based on the owner-only read-only header audit  
**Environment:** `integration-foundation` Preview only  
**Source of truth:** Existing private Google Sheets workbook  
**Safety boundary:** This mapping uses header names only. No worksheet data rows were read and no workbook values or structure were changed.

## 1. Worksheet mapping

| Worksheet | Application responsibility | Key columns and relationships |
|---|---|---|
| `01_REGISTRATIONS` | Photographer application intake and verification queue | Primary record: `registration_id`. Applicant fields: `full_name`, `email`, `phone`, `primary_location`. Workflow: `status`, `verification_notes`, `rejection_reason`, `submitted_at`, `verification_due_at`, `last_reviewed_at`, `resubmission_of`. |
| `02_PHOTOGRAPHERS` | Published and managed photographer accounts/profiles | Primary record: `photographer_id`; links to registration via `registration_id`; identity link `auth_user_id`; profile: `public_name`, `email`, `phone`, `bio`, `primary_location`, `categories`, `profile_image_url`, `hero_image_url`; lifecycle: `status`, `publish_state`, `membership_tier`. |
| `03_ADMINS` | Internal administrator identities and roles | Primary record: `admin_id`; identity: `auth_user_id`, `email`, `full_name`; permissions/lifecycle: `role`, `status`, `created_by_admin_id`, `last_login_at`. |
| `04_GALLERY` | Photographer portfolio media items | Primary record: `photo_id`; owner `photographer_id`; optional album `album_id`; content: `title`, `caption`, `image_preview_url`, `original_asset_ref`, `category`, `alt_text`, `photo_date`, `photo_location`, `sort_order`, `featured`; rights and visibility: `available_to_license`, `rights_confirmed`, `publish_state`. |
| `05_SERVICES` | Photographer service catalogue | Primary record: `service_id`; owner `photographer_id`; `name`, `description`, `price_amount`, `currency`, `image_url`, `publish_state`, `sort_order`. |
| `06_WORKING_HOURS` | Weekly availability display and scheduling constraints | Primary record: `hours_id`; owner `photographer_id`; `weekday`, `start_time`, `end_time`, `availability`, `timezone`. |
| `07_ENQUIRIES` | Client-to-photographer enquiry/booking lead | Primary record: `enquiry_id`; recipient `photographer_id`; client details `customer_name`, `customer_email`, `customer_phone`; `source`, `requested_service`, `message`; workflow `status`, `completion_state`, `verification_state`, `booking_reference`, timestamps. |
| `08_MESSAGES` | Conversation messages associated with an enquiry | Primary record: `message_id`; parent `enquiry_id`; `sender_type`, `sender_ref`, `body`, `delivery_state`, `sent_at`, `created_at`. |
| `09_LIKES` | Likes/reactions on photographers or other supported targets | Primary record: `like_id`; owner `photographer_id`; target pair `target_type` + `target_id`; visitor deduplication `visitor_hash`; `active`. |
| `10_PROFILE_VIEWS` | Privacy-preserving profile view analytics | Primary record: `view_id`; owner `photographer_id`; `visitor_hash`, `viewed_at`, `dedupe_window_hours`. |
| `11_REVIEWS` | Reviews tied to a verifiable engagement | Primary record: `review_id`; owner `photographer_id`; links `enquiry_id`, `engagement_id`, `customer_match_ref`; content `rating`, `review_text`; verification/moderation `verification_state`, `moderation_state`, `moderator_admin_id`, `moderation_reason`; review timestamps. |
| `12_REPORTS` | Customer reports and issue intake | Primary record: `report_id`; target `photographer_id`; reporter details; optional `booking_enquiry_id`; `category`, `description`, `word_count`, `eligibility_state`, `status`, `resolution_notes`. |
| `13_SETTINGS` | Platform-wide and photographer-scoped configuration | Primary record: `setting_id`; scope `scope`; optional owner `photographer_id`; key/value `setting_key`, `setting_value`, `value_type`, `description`; provenance `updated_by`, `updated_at`. |
| `14_AUDIT_LOG` | Append-only record of privileged and sensitive actions | Primary record: `audit_id`; actor `actor_type` + `actor_id`; action `action`; target `target_type` + `target_id`; `metadata_json`, `ip_hash`, `created_at`. |
| `15_PHOTOGRAPHER_SERVICE_AREAS` | Searchable service locations and geographic coverage | Primary record: `service_area_id`; owner `photographer_id`; `place_name`, `county_region`, `country`, `latitude`, `longitude`, `active`. |
| `16_VERIFICATION_EVENTS` | History of registration review decisions and deadlines | Primary record: `event_id`; parent `registration_id`; `status`, `due_at`, `reviewed_at`, `reviewer_admin_id`, `decision_reason`, `resubmission_of`. |
| `17_CONDUCT_CASES` | Internal investigations, outcomes and restrictions | Primary record: `case_id`; subject `photographer_id`; references `reporter_customer_match_id`, `booking_enquiry_id`; `category`, `incident_key`, `evidence_refs`, `investigation_status`, `outcome`, `admin_id`, `decision_reason`, restriction and appeal fields. |
| `18_PLANS_SUBSCRIPTIONS` | Photographer plan entitlements and subscription lifecycle | Primary record: `subscription_id`; `plan_id`; owner `photographer_id`; `tier`, `entitlement_state`, `provider_name`, `provider_reference`, period, renewal and cancellation fields. |
| `19_PHOTO_PRODUCTS` | Licensable products derived from portfolio photos | Primary record: `product_id`; owner `photographer_id`; source `photo_id`; `sale_state`, `price_amount`, `currency`, `license_type`, `license_terms`, `territory`, `permitted_use`, asset references. |
| `20_PHOTO_ORDERS` | Purchases, payment state and download entitlements | Primary record: `order_id`; references `product_id`, `photographer_id`; buyer fields; `amount`, `currency`, `payment_state`, `provider_name`, `provider_reference`, `license_snapshot`, `download_entitlement_ref`, `receipt_ref`, `refund_state`, timestamps. |
| `21_ADMIN_INVITATIONS` | Secure invitation and onboarding of administrators | Primary record: `invitation_id`; `email`, `role`, `invited_by_admin_id`, `token_hash`, `expiry`, `accepted_at`, `status`. |
| `22_PHOTOGRAPHER_ALBUMS` | Photographer portfolio album grouping | Primary record: `album_id`; owner `photographer_id`; `title`, `description`, `sort_order`, `publish_state`, `cover_photo_id`. |

## 2. Core relationship map

- Registration `01_REGISTRATIONS.registration_id` → photographer `02_PHOTOGRAPHERS.registration_id`.
- Photographer `02_PHOTOGRAPHERS.photographer_id` is the parent key used by services, hours, gallery, albums, enquiries, likes, views, reviews, reports, settings, service areas, conduct cases, subscriptions, products and orders.
- Album `22_PHOTOGRAPHER_ALBUMS.album_id` → gallery `04_GALLERY.album_id`; album cover `cover_photo_id` points to a gallery `photo_id`.
- Enquiry `07_ENQUIRIES.enquiry_id` → messages `08_MESSAGES.enquiry_id`; reviews may reference the enquiry.
- Gallery photo `04_GALLERY.photo_id` → photo product `19_PHOTO_PRODUCTS.photo_id`; product `19_PHOTO_PRODUCTS.product_id` → order `20_PHOTO_ORDERS.product_id`.
- Admin `03_ADMINS.admin_id` is referenced by review moderation, verification events, conduct cases, audit records and invitations.
- These are schema-level relationships inferred from column names; referential integrity and uniqueness still need validation before writes are enabled.

## 3. Application feature mapping and current gaps

| Existing application area | Intended workbook path | Current state observed in Preview code | Required next integration |
|---|---|---|---|
| Photographer application form | `01_REGISTRATIONS`; approved profile later in `02_PHOTOGRAPHERS`; service coverage in `15_PHOTOGRAPHER_SERVICE_AREAS` | Client-side preview only; it does not submit or store | Server-side validation, duplicate/idempotency handling, registration append, safe receipt response |
| Public photographer directory/profile | `02_PHOTOGRAPHERS`, `04_GALLERY`, `05_SERVICES`, `15_PHOTOGRAPHER_SERVICE_AREAS`, `22_PHOTOGRAPHER_ALBUMS` | Three hard-coded demonstration profiles | Public read API restricted to approved/published records and safe public columns |
| Public enquiry form | `07_ENQUIRIES`; later conversation in `08_MESSAGES` | Client-side preview only | Server-side validation, spam/rate limiting, append enquiry, privacy-safe response |
| Profile likes | `09_LIKES` | Local component state only | Visitor token/hash strategy, idempotent toggle, abuse controls |
| Profile views | `10_PROFILE_VIEWS` | No persistent event observed | Privacy-preserving deduplication and rate limits |
| Reviews | `11_REVIEWS` | No live review workflow observed | Verified-engagement eligibility and moderation before publication |
| Owner application queue | `01_REGISTRATIONS`, `16_VERIFICATION_EVENTS`, `14_AUDIT_LOG` | Three fabricated demo records | Owner-authenticated read endpoint and audited review/decision actions |
| Owner photographer management | `02_PHOTOGRAPHERS`, `15_PHOTOGRAPHER_SERVICE_AREAS`, `13_SETTINGS`, `14_AUDIT_LOG` | Three fabricated profiles; actions inactive | Owner-authenticated read/update endpoints and audit events |
| Owner enquiries/messages | `07_ENQUIRIES`, `08_MESSAGES` | Staged/empty demo area | Protected reads, status transitions, message handling and audit trail |
| Reports and conduct | `12_REPORTS`, `17_CONDUCT_CASES` | No live workflow observed | Restricted owner/admin workflows with evidence access controls |
| Plans and photo commerce | `18_PLANS_SUBSCRIPTIONS`, `19_PHOTO_PRODUCTS`, `20_PHOTO_ORDERS` | No live commerce workflow observed | Payment-provider verification, immutable order/license snapshots and entitlement controls |
| Admin access | `03_ADMINS`, `21_ADMIN_INVITATIONS` | Existing Preview owner setup-key session is separate; no customer Google sign-in | Preserve owner-only Google OAuth; design admin roles/invitations separately before enabling |

## 4. Schema gaps and decisions required before writing

1. **Application portfolio/social fields:** the application form requires an Instagram URL and an additional gallery URL. Website, primary portfolio URL and other social/profile URLs are optional. The audited `01_REGISTRATIONS` and `02_PHOTOGRAPHERS` headers do not expose dedicated columns for these values. Do not silently discard them, overload `verification_notes` or `bio`, or add columns. Before accepting live submissions, define a structured profile-metadata record in `13_SETTINGS`, keyed to the registration while pending and to `photographer_id` after approval, with explicit keys for website, portfolio, Instagram, additional gallery and other social links. Validate URLs server-side and retain optional fields as empty/absent rather than blocking applicants.
2. **Service areas:** the form currently collects a free-text area list, while the workbook has structured rows in `15_PHOTOGRAPHER_SERVICE_AREAS`. Define a parser/normalisation and country/county policy before writes.
3. **Customer identity:** no dedicated customer account worksheet appears in the 22-tab schema. Do not introduce customer Google OAuth or assume a customer auth ID exists. Enquiry/review eligibility must use an explicitly designed privacy-safe matching mechanism.
4. **Assets:** `original_asset_ref`, `image_preview_url`, `profile_image_url` and related fields imply asset storage/hosting responsibilities not established by the Sheets schema alone. Do not upload binary files into cells.
5. **State vocabularies:** allowed values for registration, publish, enquiry, moderation, payment, refund, subscription, appeal and conduct fields are not defined by headers. Establish enums and transition rules before enabling updates.
6. **Identifiers and concurrency:** determine ID generation, duplicate detection, append idempotency and race handling before any write path. Sheets is not a relational database and does not enforce foreign keys or unique constraints.
7. **Sensitive data:** keep admin-only, buyer, reporter, evidence, provider references, token hashes and audit metadata out of public APIs. Public reads must use explicit allowlists, not entire row objects.
8. **Auditability:** privileged state changes should write an audit event with actor, action, target and minimal metadata. Never log credentials, raw OAuth tokens, invitation tokens or full payment secrets.

## 5. Application conversation storage decision

The application intake and applicant-reply design is specified in [`APPLICATION_INTAKE_AND_CONVERSATION.md`](./APPLICATION_INTAKE_AND_CONVERSATION.md). It keeps application messages separate from customer enquiry messages and proposes additive `23_APPLICATION_DETAILS` and `24_APPLICATION_MESSAGES` worksheets. These tabs have **not** been created. The form remains Preview Only until schema migration, durable idempotency/locking, recoverable multi-write handling, applicant access, abuse controls and transactional email delivery are implemented and verified. No existing worksheet or header is changed by this decision.

## 6. Recommended implementation order

1. Define and validate column-level contracts and allowed state values for registrations, photographers, gallery, services, service areas and enquiries.
2. Define the structured photographer-link metadata contract in `13_SETTINGS`, then implement public application submission to `01_REGISTRATIONS` plus its linked metadata record only after duplicate/idempotency and multi-write recovery rules are in place.
3. Implement owner-authenticated application list/detail and review decisions, writing related `16_VERIFICATION_EVENTS` and `14_AUDIT_LOG` entries.
4. Implement approved/published photographer directory reads and profile content reads.
5. Implement enquiries/messages, then likes and profile views.
6. Implement reviews/reports/conduct moderation.
7. Implement subscriptions and photo commerce only after payment and asset/entitlement security design.

## 7. Non-negotiable safeguards

- Preserve all 22 existing worksheets and their current headers.
- Keep all work on `integration-foundation` and Preview deployments; do not deploy Production or alter Production settings.
- Keep Google OAuth owner-only. Customers and photographers do not sign in with Google.
- Use server-side Google Sheets access only; never expose OAuth credentials or the refresh token to the browser.
- Public endpoints must return only allowlisted published fields.
- Keep the schema audit read-only. No application writes are authorised by this mapping document.
- Do not describe the application as workbook-integrated until the corresponding workflow has been exercised against Preview and verified end-to-end.
