# Lens & Light — Integration Architecture and Backend Readiness Plan

**Status:** Architecture plan for owner review; no provider credentials or live integrations configured  
**Date:** 20 November 2026  
**Branch:** `integration-foundation`  
**Purpose:** Complete the server-side integration design, security boundaries, service contracts and readiness checklist before building the customer-facing product interface.

---

## 1. Current implementation baseline

The repository currently contains a Next.js 14 / React 18 / TypeScript static portfolio demonstration. The existing `app/page.tsx` is a client-rendered single-photographer page with hard-coded portfolio images, service copy and a placeholder WhatsApp contact link.

The repository does not yet contain:
- A server-side data-access layer or live Google Sheets API integration.
- Authentication, OTP verification, secure sessions or trusted-device registration.
- Photographer/admin account mapping, roles, permissions or protected server routes.
- Registration, verification, photographer workspace or public directory services.
- Enquiry persistence, customer reply tokens, email delivery or notification tracking.
- Likes, profile views, review eligibility or rating calculations.
- Reporting, conduct investigations, appeals or moderation enforcement.
- Private image upload, derivative generation, original-file protection or licensing.
- Subscription, checkout, payment webhook, commission, payout or reconciliation services.
- Automated integration/security tests, observability, backups or restore verification.

The current portfolio must therefore be treated as a prototype, not as the first working version of the marketplace backend.

## 2. Architecture principles

1. **Server is authoritative.** Browser input is untrusted. The server validates every field, identity, role, ownership relationship, state transition, entitlement and payment event.
2. **No direct browser-to-business-store access.** The private Google workbook is accessed only from server-side code using the owner's delegated Google OAuth authorization, with the narrowest workable file scope.
3. **Authentication is separate from business records.** PIN hashes, OTPs, sessions, trusted-device secrets, recovery secrets and admin MFA material never enter Google Sheets.
4. **Repository abstraction.** Business services depend on typed repositories, not directly on Google API calls. A later relational database migration should replace repository adapters, not rewrite product rules or UI.
5. **Explicit state machines.** Applications, enquiries, reviews, reports, conduct cases, subscriptions, orders, payouts and notifications have named states and server-validated transitions.
6. **Least privilege and tenant isolation.** A photographer can access only their own records. Admin access is role-scoped and audited. Public visitors see only published, approved public data.
7. **Privacy by design.** Collect only necessary personal information, keep private evidence restricted, define retention/deletion/correction routes and avoid disclosing whether another person's record exists.
8. **Reliable side effects.** Email, webhook, payment, notification and download operations use idempotency, retries, delivery records and reconciliation.
9. **Real customer experience is a backend requirement.** Every workflow must support useful loading, validation, empty, success, error, retry, expiry and recovery states for the eventual interface.
10. **Preview first.** Use synthetic test data and Vercel Preview. Never use production secrets or real customer data in development; no Production deployment without explicit owner authorization.

## 3. Target service layout

Keep the current Next.js application and add server-side modules with clear boundaries. A proposed layout (names may be adjusted to fit the actual implementation):

```text
app/
  api/
    health/route.ts
    registrations/route.ts
    registrations/[registrationId]/status/route.ts
    photographer/profile/route.ts
    photographer/gallery/route.ts
    photographer/services/route.ts
    photographer/enquiries/route.ts
    enquiries/route.ts
    customer/replies/[token]/route.ts
    public/photographers/route.ts
    public/photographers/[slug]/route.ts
    public/likes/route.ts
    public/reports/route.ts
    public/reviews/route.ts
    admin/registrations/route.ts
    admin/reports/route.ts
    admin/conduct-cases/[caseId]/route.ts
    admin/reviews/route.ts
    webhooks/[provider]/route.ts
lib/
  auth/                 # provider adapter, session and role checks
  config/               # validated server-only environment configuration
  data/                 # typed repositories and storage adapters
  domain/               # entities, enums, invariants and state machines
  services/             # registration, enquiry, review, moderation, billing
  integrations/
    google-sheets/      # server-only Sheets client and row mappers
    email/              # transactional email provider adapter
    media/              # private object storage and derivative pipeline
    payments/           # provider adapter and webhook verification
    rate-limit/         # distributed throttling / abuse controls
  security/             # validation, normalization, idempotency, audit
  schemas/              # request and response schemas
  observability/        # structured redacted logs and error reporting
tests/
  unit/
  integration/
  security/
  journeys/
```

This is an architectural target, not a claim that these files already exist. Do not generate the entire tree with placeholder providers. Add modules only as their provider and required credentials are selected and verified.

### 3.1 Request lifecycle

Every protected request follows this order:
1. Parse and validate request size, content type and schema.
2. Establish the authenticated identity through the chosen authentication integration.
3. Resolve the internal photographer/admin account mapping.
4. Check account status, role, permissions and session/device risk.
5. Validate ownership and referenced record relationships on the server.
6. Apply rate limits, idempotency and anti-abuse controls.
7. Execute a domain service and repository operation.
8. Record a redacted audit/domain event where required.
9. Trigger reliable asynchronous side effects (email, notifications, webhooks) through an outbox/queue pattern where supported.
10. Return a stable response shape with a request/correlation ID and safe user-facing error.

Do not rely on route hiding, client state, opaque IDs or middleware alone as authorization. Every route handler and sensitive service must enforce authorization independently.

## 4. Integration inventory and dependencies

| Capability | Required integration | Current status | Must be ready before |
|---|---|---|---|
| Business data | Private Google Sheets + server-side Google OAuth refresh token | OAuth client and owner consent pending | Data integration |
| Identity and sessions | Authentication provider supporting required PIN/OTP and trusted-device policy | Provider not selected | Protected services |
| Distributed throttling/idempotency | Shared rate-limit/lock store or equivalent reliable service | Provider/design pending | Public forms, OTP, likes, reports, customer reply links |
| Media | Private object storage + image processing/derivative generation | Provider not selected | Photographer gallery |
| Transactional email | Email provider with delivery events/webhooks | Provider not selected | Registration, enquiries, OTP fallback, notifications |
| Error monitoring | Server error/trace monitoring | Not configured | Preview integration tests and launch |
| Payments | Marketplace-appropriate payment provider and webhook integration | Stage 9 scope approved; provider not selected | Live subscriptions/photo checkout |
| Durable async jobs | Queue/workflow or provider-supported reliable retry mechanism | Evaluate when email and payments are selected | Reliable notifications, reconciliation and payouts |
| Search | Initial server-side indexed filtering; dedicated search only if volume warrants | Not required for first backend slice | Public directory scale |
| Analytics | Privacy-conscious event aggregation | Not configured | Photographer analytics and product insight |

Provider names must not be hardcoded into domain logic. Each integration must have a narrow adapter and documented environment-variable contract.

## 5. Google Sheets business-data integration

### 5.1 Workbook and access

The owner confirmed `henrymunala2@gmail.com` as the Google account for the Cloud project and workbook. The spreadsheet ID is configured in Vercel Preview on `integration-foundation`. The Google OAuth client, API enablement, owner consent, file-specific authorization and live read test are still pending.

The initial business workbook retains the 22 approved tabs:
1. `01_REGISTRATIONS`
2. `02_PHOTOGRAPHERS`
3. `03_ADMINS`
4. `04_GALLERY`
5. `05_SERVICES`
6. `06_WORKING_HOURS`
7. `07_ENQUIRIES`
8. `08_MESSAGES`
9. `09_LIKES`
10. `10_PROFILE_VIEWS`
11. `11_REVIEWS`
12. `12_REPORTS`
13. `13_SETTINGS`
14. `14_AUDIT_LOG`
15. `15_PHOTOGRAPHER_SERVICE_AREAS`
16. `16_VERIFICATION_EVENTS`
17. `17_CONDUCT_CASES`
18. `18_PLANS_SUBSCRIPTIONS`
19. `19_PHOTO_PRODUCTS`
20. `20_PHOTO_ORDERS`
21. `21_ADMIN_INVITATIONS`
22. `22_PHOTOGRAPHER_ALBUMS`

No existing tab is to be removed, merged or repurposed without explicit agreement.

### 5.2 Repository/data-access requirements

Create typed repository interfaces for registrations, photographers, admins, gallery, albums, services, working hours, enquiries, messages, likes, profile views, reviews, reports, settings, audit events, service areas, verification events, conduct cases, subscriptions, photo products, photo orders and admin invitations.

The Google Sheets adapter must:
- Use the server-only Google OAuth client in `lib/integrations/google-sheets/client.ts`. Fail fast if required configuration is absent; never fall back to a public spreadsheet or browser-side API. OAuth client ID, client secret and refresh token are Vercel Sensitive variables, Preview-only during development.
- Map rows to typed domain records using named header mappings, not assumed column positions alone.
- Use UUIDs as record IDs; never expose sheet row numbers as public IDs.
- Validate required headers at startup/health-check and report missing/duplicate headers without exposing secrets.
- Normalize dates to ISO-8601 UTC timestamps and validate enums at the repository boundary.
- Validate foreign references and photographer ownership before writes.
- Batch reads/writes where possible, paginate/limit reads and avoid loading the entire workbook for every request.
- Handle Google API quotas, timeouts, retryable errors and transient failures with bounded retries and jitter.
- Use optimistic version/timestamp checks for updates where possible; detect conflicting writes rather than silently overwriting newer data.
- Use idempotency keys for repeatable create/transition requests.
- Redact customer contact data, tokens and sensitive evidence from logs.
- Keep a backup/export procedure and perform a restore exercise before real customer data is accepted.

### 5.3 Important Sheets limitation

Google Sheets does not provide relational constraints, transactions, row-level security, uniqueness constraints or safe multi-record atomic commits. A repository abstraction does not remove these limitations.

For high-risk operations (OTP attempts, rate limiting, session/device records, token hashes, webhook deduplication, payment ledger consistency, strike counters and concurrent state transitions), do not pretend a Sheets row update is an atomic lock. Use a suitable transactional/shared-state service or a carefully designed server-side serialization strategy. Before production, reassess whether the agreed Sheets-first store remains suitable for the volume and risk profile. Do not silently replace the user's chosen workbook; present any proposed additional service or migration for approval.

### 5.4 Workbook additions to consider (not approved or created)

The 22 tabs remain foundational. The following are candidates for additional worksheets because the current schema does not clearly provide a complete durable record for these operations:
- `23_NOTIFICATION_LOG`: notification_id, event_id, recipient reference, channel, template/version, status, provider reference, attempt count, last error code, created/updated/sent/delivered timestamps. Never store OTPs or customer reply bearer tokens.
- `24_MODERATION_APPEALS`: appeal_id, conduct_case_id, photographer_id, submitted_at, reason, evidence references, review_admin_id, outcome, decision_reason, decided_at.
- `25_PAYMENT_LEDGER`: ledger_entry_id, order/subscription reference, provider transaction reference, gross, currency, fees, tax, platform commission, photographer payable, adjustment/refund/chargeback type, reconciliation state and timestamps.
- `26_PAYOUTS`: payout_id, photographer_id, payee reference (not bank credentials), amount, currency, status, provider payout reference, failure reason code and timestamps.
- `27_PROVIDER_EVENTS`: event_id, provider, provider_event_id, event_type, received_at, signature_verified, processing_state, idempotency key and redacted error code. No raw secrets or card data.

Before adding any tab, verify whether the operation belongs in the external provider, an append-only audit ledger, or a separate transactional service. Ask the owner to approve additions; never reduce or consolidate the original 22.

## 6. Identity, authentication and authorization

### 6.1 Required photographer sign-in policy

Preserve the locked policy:
- Photographer first sign-in/new device: account identifier + PIN + OTP to a verified contact (or explicitly approved stronger passkey route).
- A valid trusted device can restore the signed-in state without an OTP prompt on every visit, subject to expiry and risk checks.
- New/unrecognized devices require fresh second-factor verification before trust is granted.
- Offer an explicit “Remember this device” choice and warn against shared/public devices.
- Provide active/trusted-device list, individual/all-session revocation and safe sign-out.
- PIN reset, account recovery, suspension and suspected compromise revoke relevant sessions/device trust.
- Admin accounts have a stronger MFA/passkey policy and must not inherit relaxed photographer session policy.

The PIN must be stored only as a salted slow hash in a suitable authentication system. Never store PINs, OTPs, raw recovery codes or bearer session tokens in Sheets, logs, analytics, URLs or browser localStorage.

**Provider selection is still a blocker.** Do not assume that a generic hosted sign-in widget natively implements a short PIN as a primary credential, the exact new-device OTP policy and trusted-device lifecycle. Evaluate provider capabilities against the full policy and document any required custom authentication flow before installation. A short PIN has low entropy; mandatory OTP, strict throttling, lockout/backoff, secure recovery and risk-based step-up are essential. Do not weaken the agreed security policy merely to fit a provider.

### 6.2 Internal identity mapping

External identity IDs map to internal `auth_user_id` fields in `02_PHOTOGRAPHERS` and `03_ADMINS`. The server must resolve:
- Principal type: customer/anonymous visitor, photographer, admin or super admin.
- Account status: pending, approved, rejected, active, suspended, disabled or invited as applicable.
- Photographer ownership and publication state.
- Admin role and specific permission set.
- Session age, trusted-device state and step-up requirements.

A valid provider session does not imply an approved photographer account. Every dashboard request must also verify approval and active/non-suspended status.

### 6.3 Authorization matrix

| Action | Public visitor | Photographer | Admin | Super admin |
|---|---:|---:|---:|---:|
| Browse published profiles/gallery | Yes | Yes | Yes | Yes |
| Like published profile/photo | Yes, abuse controlled | Yes, abuse controlled | Yes, abuse controlled | Yes, abuse controlled |
| Submit enquiry | Yes | As customer only; prevent self-dealing | As customer only | As customer only |
| View/edit own profile and gallery | No | Own only | Only if support role explicitly permits | Audited support access |
| View own enquiries/messages | No, via scoped customer reply link | Own only | Moderation-limited | Audited exceptional access |
| Approve applications | No | No | Initially no | Yes |
| Review complaints and evidence | No | Own case/appeal only | Assigned/authorized cases | Yes |
| Impose/release restrictions | No | No | Only if permission delegated | Yes |
| Approve/reject reviews | No | No | Only if permission delegated | Initially yes |
| Invite/manage admins | No | No | No | Yes |
| Configure platform-wide settings | No | No | Limited | Yes |

No photographer may approve their own review, alter verified ratings, view another photographer's private data or access admin routes. Admin support access to private messages/evidence must be purpose-limited, logged and visible in the audit trail.

## 7. Core domain services and workflows

### 7.1 Registration and verification

1. Public applicant submits validated name, email, phone, primary location and required profile details.
2. Normalize email/phone; check duplicate active applications without revealing another applicant's personal data.
3. Create registration UUID and verification event; set `UNDER_VERIFICATION`, `submitted_at`, `verification_due_at = submitted_at + 48 hours`.
4. Queue applicant acknowledgement and admin notification.
5. Admin reviews evidence and records decision, notes and timestamps.
6. Approve: provision/activate photographer identity securely and route to workspace onboarding.
7. Reject: send reason and resubmission route; preserve prior application history.
8. Overdue: remain pending, never auto-approve/reject; flag admin queue and provide request-update/complaint route.

### 7.2 Photographer profile and media

- Draft/published state with server-validated publish checks.
- Profile fields: name, bio, primary location, service areas, contact channels, categories, hero media and slug.
- Gallery: title, caption, category, optional date/location, alt text, order, featured flag, album and rights/consent confirmation.
- Services and working hours are photographer-owned records.
- Upload lifecycle: request upload → validate authorization and quota → issue short-lived upload authorization → upload to private storage → inspect MIME/magic bytes/dimensions/size → malware/content scan where supported → generate preview derivatives/watermark → store metadata → allow draft preview → publish eligible derivative only.
- Never trust filename, extension or browser-supplied MIME type alone. Reject oversized, malformed or unsupported files. Prevent SVG/HTML script execution and path traversal.
- Keep originals private; public pages only receive approved derivatives. Delete/replace operations must remove or revoke derivatives and update references safely.
- Photographer confirms rights/consent before publishing or offering an image for license.

### 7.3 Public directory and discovery

- Only approved, active, not-suspended and published photographers are publicly discoverable.
- Search by category, primary location and service area.
- Separate organic ranking (verified ratings and evidence volume, relevance, profile quality, freshness and safety eligibility) from popularity (likes) and sponsored placement.
- New photographers display “New”/“Not yet rated”, not zero stars.
- Premium does not buy a rating or guaranteed booking. Promoted placement is visibly labelled, bounded and relevant.
- Return only public-safe fields. Never leak email, phone (unless deliberately public), internal status notes, admin IDs, asset originals, provider references or moderation evidence.

### 7.4 Likes and profile views

- Profile and photo likes are independent targets.
- Use a privacy-preserving server-issued visitor identifier; do not accept a raw visitor ID from the client.
- Enforce one active like per visitor/target and rate-limit repeated actions.
- Profile views use a defined dedupe window (e.g. 24 hours), bot filtering and an “estimated visits” label.
- Use a shared store or atomic strategy for deduplication; Sheets alone is not a safe distributed uniqueness lock.

### 7.5 Enquiries and customer replies

- Hire Me requires customer name, email, phone, service and message. Optional preferred contact method/date may be included.
- General contact form also creates a photographer-linked enquiry.
- Validate/normalize contact details, length limits, content type and spam score; add CAPTCHA/risk challenge only when risk requires it.
- Return a stable enquiry reference and customer acknowledgement.
- Photographer inbox supports NEW, READ, RESPONDED, IN_DISCUSSION, CONVERTED and CLOSED with allowed transition rules and audit events.
- Photographer notes are private and never returned through customer reply endpoints.
- Customer replies use high-entropy random, expiring, revocable, enquiry-scoped bearer links; store only token hashes server-side. Never put customer PII or the token in analytics/logs. Revoke on expiry, abuse, case closure or account action.
- A customer reply token grants access only to the exact permitted enquiry conversation; changing IDs must never expose another enquiry.
- An enquiry alone is not proof of completed engagement and does not grant review eligibility.

### 7.6 Notifications and email

- Transactional events: application received, admin application alert, approval/rejection, overdue review reminder, enquiry received, photographer new-enquiry alert, customer acknowledgement, photographer reply, report/case updates, restriction/release, appeal outcome, subscription/order/refund events.
- Marketing consent is separate and optional; no marketing emails by default.
- Use template IDs and versions, localization-ready copy, safe variable escaping and preference/unsubscribe controls where legally required.
- Track queued, processing, sent, delivered (only on provider webhook), bounced, failed and retry-pending states.
- Retry transient errors with bounded backoff; do not retry permanent invalid-recipient errors indefinitely.
- Use idempotency per event/recipient/template so retries do not send duplicate notices.
- Provide an admin-visible failure queue and a way to resend safe notifications.
- Email is not the sole source of truth for an application, enquiry or payment state; the dashboard and persisted record remain authoritative.

### 7.7 Reviews and ratings

- Verify customer/engagement eligibility server-side against a qualifying engagement and associated contact.
- Photographer self-attestation alone is insufficient; require customer confirmation or a documented independent verification step.
- One review per eligible engagement.
- New review is pending moderation and excluded from public rating/count/ranking until approved.
- Record moderator, reason, decision and timestamps. Fair negative feedback must not be suppressed.
- Rating aggregates are recomputed from approved eligible reviews, not client-submitted totals.

### 7.8 Reports, investigations, restrictions and appeals

- Report form description 1–9 words, live counter; 10+ words rejected. Structured category and evidence follow-up may be supported.
- Validate reporter contact against a qualifying enquiry/booking for that photographer; unmatched reports receive a generic failed-eligibility response and create no conduct case.
- Reports are allegations, not strikes. Only investigated and upheld findings count.
- Deduplicate by incident/booking and investigate coordinated abuse.
- Ordinary policy: sixth upheld ordinary case triggers the specified account review/restriction path. Gross misconduct: third upheld gross case triggers the specified review/resolution path.
- Urgent credible safety concern may justify a temporary precautionary restriction with reason, start time, review deadline and appeal route. **It must not exceed 48 hours and must be lifted immediately when the issue is resolved.** No silent extension or indefinite precautionary lockout. Any further formal measure requires a separate documented and appealable decision.
- During a temporary restriction, pause only necessary activities; preserve account data and access to status, appeal and safe customer communication/history.
- Admin case view includes eligibility result, incident links, evidence references, history, investigation notes, finding, reason, restriction timestamps and appeal outcome.
- Review moderation and message moderation are purpose-limited and audited.

### 7.9 Subscriptions and photo commerce (Stage 9)

- Server-authoritative plan entitlements and subscription states.
- Hosted/secure checkout; never store card details.
- Verify webhook signatures, provider event IDs, idempotency and event ordering.
- A successful browser redirect is not proof of payment. Only verified server-side provider events can activate entitlements, create paid orders or issue download access.
- Persist versioned license acceptance and license snapshot per order.
- Original-file download requires verified payment, correct buyer/order entitlement and an unexpired scoped download authorization.
- Maintain ledger for gross, fee, tax, commission, photographer payable, refunds, chargebacks, adjustments and payouts.
- Reconcile provider records with internal records and expose unresolved mismatches to admin.
- Live payment provider, plan pricing, commission, payout terms, tax and license/refund rules remain explicit owner decisions.

## 8. API contract conventions for the later interface

All API routes return stable JSON envelopes. Suggested success shape:

```json
{
  "ok": true,
  "data": {},
  "meta": { "requestId": "uuid" }
}
```

Suggested error shape:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields.",
    "fieldErrors": { "email": "Enter a valid email address." }
  },
  "meta": { "requestId": "uuid" }
}
```

Rules:
- Use HTTP status codes consistently (400 malformed, 401 unauthenticated, 403 unauthorized/ineligible, 404 unavailable/not found, 409 conflict/state mismatch, 413 upload too large, 422 validation/business rule, 429 rate limit, 5xx unexpected failure).
- Error messages must not disclose whether another person's account, booking or enquiry exists.
- Use request IDs for support and incident investigation.
- Use cursor pagination for directory, inbox and admin queues; enforce maximum page sizes.
- Use explicit allowlists for sortable/filterable fields.
- Use optimistic concurrency/version checks for edits to prevent stale forms overwriting newer changes.
- Use idempotency keys for create/transition/payment operations where repeat submission is possible.
- Never expose stack traces, service-account details, provider secrets or raw upstream errors.

### 8.1 Endpoint inventory (initial contracts to implement)

| Domain | Endpoint intent | Access |
|---|---|---|
| Health | `GET /api/health` (dependency readiness without secrets) | Public-safe, limited detail |
| Registration | `POST /api/registrations` | Public, rate-limited |
| Application status | `GET /api/registrations/status` via scoped verification token or authenticated applicant | Applicant-scoped |
| Admin registrations | `GET/PATCH /api/admin/registrations` | Super admin initially |
| Photographer profile | `GET/PATCH /api/photographer/profile` | Approved photographer, own record |
| Gallery/media | `POST /api/photographer/media/upload`, `PATCH/DELETE /api/photographer/gallery/:id` | Approved photographer, own record |
| Services/hours | `GET/POST/PATCH/DELETE /api/photographer/services`, `/working-hours` | Approved photographer, own record |
| Public directory | `GET /api/public/photographers` | Public, published-only |
| Public profile | `GET /api/public/photographers/:slug` | Public-safe projection |
| Likes/views | `POST/DELETE /api/public/likes`, `POST /api/public/profile-views` | Public, abuse-controlled |
| Enquiry | `POST /api/public/photographers/:slug/enquiries` | Public, rate-limited |
| Photographer inbox | `GET/PATCH /api/photographer/enquiries` | Approved photographer, own records |
| Customer replies | `GET/POST /api/customer/replies/:token` | Token-scoped, expiring |
| Reviews | `POST /api/public/reviews`, `GET /api/admin/reviews`, `PATCH /api/admin/reviews/:id` | Verified customer / authorized moderator |
| Reports | `POST /api/public/reports`, `GET /api/admin/reports` | Public eligibility check / authorized admin |
| Conduct cases | `GET/PATCH /api/admin/conduct-cases/:id` | Authorized moderator |
| Appeals | `POST /api/photographer/appeals`, `GET/PATCH /api/admin/appeals/:id` | Photographer case owner / authorized reviewer |
| Billing | `POST /api/billing/checkout`, `GET /api/photographer/billing` | Authenticated photographer |
| Provider webhooks | `POST /api/webhooks/:provider` | Provider signature verified |

The exact route names can evolve, but access boundaries and domain contracts must remain.

## 9. Customer, photographer and admin experience requirements before UI implementation

The interface must be built around complete journeys, not isolated forms.

### 9.1 Public customer journeys

- Discover photographers using location/category filters; understand primary location vs areas served.
- Compare “New / Not yet rated”, verified ratings/review counts, likes and sponsored labels without confusing the signals.
- View a profile with meaningful gallery, albums, services, availability, contact and clear hire actions.
- Like/unlike profile and individual images with clear feedback and no forced account creation.
- Submit an enquiry with field-level validation, privacy explanation, loading state, duplicate-submit protection, clear confirmation and next-step expectations.
- Return to an enquiry conversation through a secure, expiring link; expired/revoked link explains the safe recovery route without exposing another customer's data.
- Report a photographer only when eligibility can be validated; provide generic ineligible response and a safe support path.
- Submit an eligible review only after verified engagement; show moderation-pending status and explain that public ratings update only after approval.
- Buy a licensed photograph only after clear license/price/checkout summary and payment confirmation; provide receipt, order history and secure download status.

### 9.2 Photographer journeys

- Apply and receive a clear acknowledgement, 48-hour review target, status page and overdue update route.
- Understand rejection reason and resubmit without losing prior application history.
- On approval, land in a guided workspace checklist with clear progress, save draft, preview and publish.
- Build profile, upload existing/historical work, create albums, manage services, locations and working hours.
- Understand upload progress, file restrictions, failed uploads, retry and image processing status.
- Manage enquiry inbox with unread counts, conversation history, private notes and clear status transitions.
- Know when a customer reply link is available and avoid exposing private notes.
- View verified reviews and understand pending moderation vs published ratings.
- View profile/photo likes and estimated visits with definitions, date ranges and anti-abuse caveats.
- Understand Free vs Premium features, promotion labels, limits, cancellation and billing state.
- Manage active sessions/trusted devices and recover access securely.
- During a restriction, see the reason/status, maximum precautionary period, review deadline, appeal route and what functionality is temporarily affected; if lifted, regain normal access promptly.

### 9.3 Admin journeys

- Secure MFA/passkey sign-in and session management.
- Queue views with filters, search, overdue badges, counts and pagination.
- Application detail with verification history, evidence references, decision notes and approval/rejection/resubmission actions.
- Reports queue distinguishes allegations, under-investigation, dismissed and upheld cases.
- Conduct case view supports evidence, deduplication, prior findings, 48-hour precautionary restriction countdown, appeals and documented decisions.
- Review moderation shows eligibility evidence and avoids exposing unnecessary customer PII.
- Admin invitation, role assignment and revocation are controlled by super admin and fully audited.
- Operational dashboards expose failed notifications, upload processing failures, webhook errors, reconciliation mismatches and backup status without exposing secrets.

### 9.4 Design-system and interaction acceptance

- Consistent navigation and role-specific layouts; no confusing public/admin route mixing.
- Responsive mobile/tablet/desktop behavior.
- Accessible labels, keyboard focus, contrast, alt text and screen-reader status announcements.
- Every async action has loading, disabled/deduplicated submission, success, recoverable error and retry behavior.
- Empty states explain what to do next; avoid blank tables and generic “No data”.
- Destructive actions require confirmation and explain consequences.
- Forms preserve safe input after recoverable errors; field-level validation is specific and understandable.
- Customer-facing language is calm, respectful and avoids exposing internal moderation/security mechanics.
- Realistic seeded examples must be clearly marked as demo/test data, never represented as actual photographers or customers.

## 10. Security, privacy and reliability controls

### Identity/session
- Secure, HttpOnly, SameSite cookies; Secure in hosted environments.
- Session rotation, idle and absolute expiry, revocation and risk-based step-up.
- New device OTP before trust; trusted-device credential stored securely and represented server-side by a revocable hash/record.
- OTP single-use, expiry, resend throttling, attempt limits and replay prevention.
- Admin MFA/passkey and separate admin session policy.
- No secrets in localStorage, URLs, Sheets, client bundles or logs.

### Authorization / data isolation
- Deny by default; server-side permission checks on every route.
- Cross-photographer IDOR tests for every resource family.
- Admin role changes, support access and moderation actions are audited.
- Public responses use allowlisted projections, never raw row objects.

### Input / abuse
- Schema validation, length limits, output encoding and HTML sanitization.
- CSRF/origin protections appropriate to the chosen auth/session architecture.
- Rate limits for OTP, registration, enquiry, customer reply, likes, views, reviews, reports, uploads and login recovery.
- CAPTCHA/risk challenge adaptive to suspicious behavior; avoid unnecessary friction for ordinary customers.
- Prevent duplicate form submissions and replayed state transitions.

### Media
- Verify magic bytes, file size, dimensions, actual image decoding and supported formats.
- Malware scanning where supported; reject active content and SVG unless sanitized/rasterized.
- Private originals, public derivatives only, signed scoped upload/download URLs, expiry and revocation.
- Rights/consent attestations, copyright/takedown route and audit history.

### Payment
- Signed webhook verification, idempotency, duplicate/out-of-order handling, reconciliation and refund/dispute state machine.
- No card data or payment secrets in Sheets or browser code.
- Browser redirect never grants entitlements without server-confirmed provider state.

### Privacy / legal
- Publish privacy notice and purpose/retention explanation at collection points.
- Restrict customer contact and report evidence to the minimum authorized roles.
- Define access/correction/deletion requests, retention schedules, legal holds and breach response.
- Review Kenya-first data protection, consumer, tax and payment requirements with qualified advice before live launch.

### Operations
- Structured redacted logs, request correlation IDs, error monitoring and alert thresholds.
- Health checks distinguish liveness from dependency readiness without leaking connection details.
- Backups and restore exercises, not just backup configuration.
- Retry policy, dead-letter/failed-job queue and admin visibility for side-effect failures.
- Incident response, rollback and support escalation runbooks.

## 11. Integration test plan

### Google Sheets
- Missing/renamed/duplicate headers fail safely.
- CRUD for every repository with UUID identity and enum/date validation.
- Quota/timeouts and transient errors are retried safely.
- Concurrent update conflict is detected; no silent lost update.
- Cross-photographer record references are rejected.
- Secrets and raw customer PII do not appear in logs.

### Authentication and permissions
- No session → 401 for protected API.
- Valid session but pending/rejected/suspended photographer → denied.
- Approved photographer can access own records.
- Photographer A cannot read/update/delete photographer B records even by guessing UUIDs.
- Non-admin cannot access admin endpoints.
- Admin cannot perform super-admin-only operations.
- OTP expiry, replay, resend throttle, attempt throttle and new-device verification.
- Trusted session restores only on same registered device/session and can be individually/all revoked.
- PIN reset, recovery and suspension revoke applicable trusted sessions.
- Admin MFA/passkey requirement is enforced.

### Workflow integrity
- Registration duplicate and overdue cases behave as specified.
- Enquiry create is idempotent; private notes never leak to customer.
- Expired/revoked customer reply token fails generically and cannot be replayed.
- Likes deduplicate by visitor/target; profile and photo targets remain independent.
- Views obey dedupe window.
- Review cannot publish or affect aggregate before eligibility and admin approval.
- Report eligibility mismatch creates no conduct case; same incident cannot count twice.
- Sixth ordinary / third gross upheld thresholds are tested, as well as dismissed/uninvestigated reports not counting.
- Precautionary restriction expires by 48 hours, lifts immediately when resolved, is audited and cannot silently extend.
- Upload original is never publicly retrievable; only approved derivatives are exposed.
- Payment success redirect without verified webhook does not create entitlement; duplicate/out-of-order webhooks are safe.

### UX / end-to-end
- Public customer can discover → profile → enquiry → acknowledgement → secure reply.
- Applicant can apply → track verification → approval → activate → publish first profile.
- Photographer can upload → preview → publish → manage inbox.
- Admin can investigate → decide → notify → appeal/review.
- Customer can submit eligible review → moderation → published aggregate.
- Buyer can accept license → pay → receive order → download securely (only when payment provider is integrated).
- Test mobile and desktop, keyboard-only, slow network, upload failure, email bounce, expired session, empty data and retry states.

## 12. Delivery sequence before frontend

Build and verify in this order:

**Integration slice A — foundation**
1. Owner creates the native private Google Sheet from the 22-tab workbook.
2. Owner enables Sheets API, creates service account and shares workbook privately.
3. Choose auth provider after a capability review against PIN + OTP + remembered-device + admin MFA requirements.
4. Choose private image storage and transactional email provider.
5. Decide shared-state/rate-limit mechanism for idempotency, abuse protection and concurrent operations.
6. Add validated server-only configuration and secret-name checklist.

**Integration slice B — server core**
1. Google Sheets client and header/health validation.
2. Typed repository interfaces and Google Sheets adapter.
3. Domain schemas, enums, state machines and validation.
4. Request IDs, redacted logs, error envelopes and audit service.
5. Authentication adapter, identity mapping, protected routes and role/ownership enforcement.
6. Integration tests for CRUD and access isolation.

**Integration slice C — core workflows**
1. Registration and manual verification.
2. Photographer account activation and secure sessions.
3. Profile/gallery/service/hours repositories and private media pipeline.
4. Public directory projection and filters.
5. Enquiry, inbox, secure customer reply and transactional notification.
6. Likes, views and verified review workflow.
7. Reports, investigations, 48-hour precautionary restriction, appeals and moderation.
8. Billing, photo commerce and ledger only after provider and commercial decisions.

**Integration slice D — readiness gate**
1. Full security test suite and cross-tenant isolation.
2. Restore test and operational runbooks.
3. End-to-end journeys against Preview with synthetic records.
4. API contract freeze and response examples.
5. Only then begin building the full public/customer, photographer and admin interfaces against the stable services.

## 13. Owner decisions and setup still required

These are real blockers, not details to guess:

1. **Google setup:** Upload/convert workbook, enable Sheets API, create service account, share workbook. Share only the spreadsheet ID and service-account email through a secure configuration workflow; never paste private keys into chat or GitHub.
2. **Authentication provider:** Approve a provider only after verifying it can satisfy the locked PIN + OTP, trusted-device, recovery and admin MFA requirements.
3. **Image storage:** Approve private original storage, derivative generation, upload constraints and signed download behavior.
4. **Email provider:** Approve transactional email, sender domain, bounce/delivery webhooks and templates.
5. **Shared state / rate limits:** Approve a reliable distributed store or equivalent for abuse counters, idempotency and concurrency-sensitive operations.
6. **Workbook additions:** Decide whether to add notification log, moderation appeals, payment ledger, payouts and provider-event worksheets, or store those records in an approved external service.
7. **Privacy/retention:** Approve retention schedule and customer data correction/deletion handling after legal review.
8. **Stage 9 commercial settings:** Payment provider, currencies, plan prices, commission, payout timing, tax treatment, license terms and refund/dispute rules remain open before live transactions.

No provider has been provisioned by this document. No credentials have been requested, copied or committed. No frontend rebuild, PR merge or Production deployment is implied.

## 14. Definition of backend-ready for frontend work

We should not call the backend ready until:
- The selected providers are connected in Preview and required environment-variable names are verified (values remain secret).
- Google Sheets can perform tested server-side CRUD against all required tabs.
- Authenticated identity maps to the internal account model and every protected route enforces role, approval, status and ownership.
- Trusted-device/new-device OTP and admin MFA policies pass tests.
- Registration, enquiry, message, review, report, moderation and restriction state machines work independently of UI.
- Media originals are private and previews are generated safely.
- Notifications are tracked and retryable.
- Audit records exist for sensitive admin/security actions.
- No critical cross-tenant, IDOR, secret-exposure or privacy defect remains.
- End-to-end API journeys pass with synthetic data.
- API contracts and all UI states are documented so frontend work can proceed without inventing business rules.


## 12.14 Google OAuth integration implementation update

The first server-side integration slice is now committed on `integration-foundation`:
- `lib/integrations/google-sheets/client.ts`: OAuth refresh-token exchange, short-lived access-token caching, Google Sheets API request wrapper, bounded retries, metadata/read/append/update methods.
- `scripts/verify-google-sheets.mjs`: read-only verification of workbook metadata and all 22 approved worksheet names.
- `.env.example`: names-only environment-variable template.

The following Vercel configuration is already present: `GOOGLE_SHEETS_SPREADSHEET_ID`, Preview target, branch `integration-foundation`. The OAuth client ID, client secret and refresh token are not present and must be entered by the owner directly in Vercel as Sensitive Preview variables. No OAuth secret is stored in GitHub.

**Important:** the OAuth app should use the narrow `drive.file` scope and explicitly authorize the selected workbook. This avoids requesting the broad Sheets scope across every spreadsheet in the owner's account. A dedicated owner-only setup/file-selection step is still required. Do not report the integration as connected until the read-only verification succeeds.
