# Lens & Light — Product & Implementation Specification

**Status:** Product decisions locked; Stage 2 foundation is the next development milestone  
**Last updated:** 19 November 2026  
**Repository:** `henrymunala-lang-ship/photographer-s-page`

## 1. Product definition

Lens & Light is a curated photographer discovery and hiring marketplace with self-managed photographer portfolios. It is not merely a single-photographer portfolio template.

- Visitors can browse, discover, like, contact and report photographers without creating accounts.
- Photographers apply for membership and must be reviewed and approved before dashboard access.
- Approved photographers manage their public profile, portfolio, services, working hours and enquiries.
- Administrators manage applications, reports, moderation and platform operations.

The proposed public domain is `lens&light.com`; domain ownership/configuration is not assumed.

## 2. Locked product decisions

These decisions are requirements, not defaults:

1. **Ratings — verified customers only.** A rating must be linked to a qualifying, verified customer engagement. A public profile visit or anonymous enquiry alone does not grant rating eligibility. Enquiry/engagement records must have a completion/verification state; each eligible engagement may produce at most one review. Store the engagement reference, customer reference or privacy-safe customer identity, rating (1–5), review text, moderation state and timestamps. Do not accept client-supplied claims of verification.
2. **Likes — profile and photograph likes.** Support both target types. Store a like type and target identifier, linked to the owning photographer. Enforce one active like per privacy-preserving visitor identifier per target; profile likes and each photograph's likes are independent. Add server-side rate limiting and abuse controls. Do not treat likes as verified reviews.
3. **Locations — one primary location plus multiple service areas.** Every photographer has exactly one primary location for display and search defaults. Additional service areas are zero or more separately stored locations (for example towns/counties/regions served). Search can match either primary location or a service area; profile cards clearly distinguish base location from areas served.
4. **Administration — one super administrator initially, extensible to more admins.** Bootstrap the initial super administrator through a controlled server-side provisioning process, not public registration or a hardcoded client-side email check. The admin identity model supports future additional administrators and role/permission checks. Initially only the super administrator can approve/reject photographers, manage reports and create additional admins. Record sensitive actions in the audit log.

## 3. Public experience

- Landing page with a featured photographer area and a clear **Hire Someone** discovery CTA.
- Photographer directory with name, primary location, profile image, verified service rating and review count, profile likes, service areas, **Hire me**, **Report me** and portfolio link.
- Sort/rank by trustworthy verified service ratings and review volume; likes are a separate popularity signal, not the sole ranking input. Avoid presenting an unreviewed photographer as a zero-star rated photographer; show “New” or “Not yet rated”.
- Directory filters include photography category and location/service area.
- Public photographer profile includes biography, location/service areas, categories, hero image, gallery, services, working days/hours and contact actions.
- Hire Me form captures customer name, email, phone, requested service and message. General profile contact form is also available. Both create photographer-linked enquiries.
- Report form submits to the platform moderation queue, never directly to the photographer. Report statuses: NEW, UNDER_INVESTIGATION, RESOLVED, DISMISSED.
- Visitors do not need accounts to browse, like, enquire or report. Apply privacy-conscious abuse prevention.

## 4. Photographer onboarding and access

Registration captures full name, email, phone and primary location (plus any required profile context). Validate input and prevent duplicate active applications.

Application lifecycle:
- PENDING → APPROVED or REJECTED; suspended/disabled access is supported for later moderation.
- A pending or rejected applicant cannot enter the photographer dashboard.
- Acknowledgement email follows submission; administrator receives a notification.
- Admin reviews details, records verification notes and approves or rejects with a reason.
- Approval sends an account activation link. Photographer access uses a memorable username/name identifier plus a short PIN and a second factor (one-time code or passkey); a PIN alone is not accepted for remote sign-in. The PIN is stored only as a salted, slow password hash in the authentication system, never in Sheets. Provide rate limiting, lockout/backoff, recovery and device/session revocation.
- Rejection sends a reason and next-step guidance.
- Authentication and membership approval are separate checks: a valid session is insufficient unless the linked photographer status is APPROVED and not suspended.
- Do not store passwords, session tokens or authentication secrets in Google Sheets.

## 5. Photographer dashboard

After approval and account activation, the photographer is taken directly to an onboarding workspace where they can build their public page immediately, including uploading earlier work. They can return through a persistent photographer sign-in page whenever they leave or their session expires.

Sections: Overview, My Profile, Gallery, Services, Working Hours, Enquiries, Reviews, Appearance, Plans & Billing and Settings.

Overview metrics: estimated profile visits, published photo count, profile/photo likes, verified service rating and review count, unread enquiries.

Profile editing:
- Name, biography, primary location, service areas, contact details, categories and hero image.
- Upload/delete/reorder gallery images; mark featured images.
- Services with custom name, description, price and image.
- Working days and hours.
- Save Draft → Preview → Publish workflow.
- Changes become public only when published.

Enquiries:
- Both general contact and Hire Me submissions appear in the correct photographer's inbox.
- Notify photographer by email and acknowledge customer submission.
- Photographer replies through dashboard; send reply to customer by email and retain message history.

## 6. Reviews, likes, visits and ranking

- Only server-verified eligible engagements can create reviews. Use a unique engagement/review constraint and moderation state. Rating values are integers 1–5.
- Profile likes and photograph likes have distinct target types and target IDs. Use a server-generated or signed first-party anonymous visitor identifier; never trust a raw browser-provided photographer/visitor identity.
- Count profile visits with deduplication (for example one qualifying visit per visitor/profile per 24-hour window). Label as estimated visits, not unique verified people.
- Directory ranking prioritizes verified average rating and review volume with a minimum-evidence approach; likes remain a separate popularity indicator. Avoid a ranking formula that rewards a single unverified or low-volume rating disproportionately.
- Rate-limit like, view, enquiry and report endpoints. Provide moderation/anti-abuse monitoring.

## 7. Administrator experience

Initial super administrator dashboard:
- Registration queue with Pending/Approved/Rejected counts and application detail.
- Verification notes, approval/rejection reason and notification workflow.
- Report queue with investigation status and resolution notes.
- Photographer suspension/unpublishing controls.
- Admin activity/audit log.

The data model supports future ADMIN accounts, but there is no public admin signup. Authorization is enforced server-side for every admin operation. Initially only SUPER_ADMIN can provision additional administrators and perform all privileged actions. Never rely on hidden UI controls as authorization.

## 8. Stage 2 data architecture — Google Sheets

Google Sheets is the initial business-data store to control validation-stage costs. Authentication remains separate; images live in dedicated object/image storage. All Sheets access occurs server-side through a service account whose credentials are held only in Vercel environment variables.

Use a data-access layer so the business-data store can later be migrated to a relational database without rewriting product UI. Sheets are not relational and do not provide transactions or foreign-key constraints: validate references, ownership and state transitions in server code; batch requests; handle concurrent updates carefully; monitor quotas; back up regularly.

Recommended private workbook: `LENS_LIGHT_DATABASE`.

| Worksheet | Purpose / key fields |
|---|---|
| `01_REGISTRATIONS` | registration_id, applicant details, primary_location, status, verification_notes, rejection_reason, timestamps |
| `02_PHOTOGRAPHERS` | photographer_id, auth_user_id, public profile, primary_location, status, publish_state, timestamps |
| `03_ADMINS` | admin_id, auth_user_id, role (SUPER_ADMIN/ADMIN), status, created_by, timestamps |
| `04_GALLERY` | photo_id, photographer_id, image_url, category, sort_order, featured, publish_state |
| `05_SERVICES` | service_id, photographer_id, name, description, price, image_url, publish_state |
| `06_WORKING_HOURS` | hours_id, photographer_id, weekday, start_time, end_time, availability |
| `07_ENQUIRIES` | enquiry_id, photographer_id, customer contact, source, requested_service, message, status, completion/verification fields, timestamps |
| `08_MESSAGES` | message_id, enquiry_id, sender_type, body, delivery_state, sent_at |
| `09_LIKES` | like_id, photographer_id, target_type (PROFILE/PHOTO), target_id, visitor_hash, active, created_at |
| `10_PROFILE_VIEWS` | view_id, photographer_id, visitor_hash, viewed_at, dedupe_window |
| `11_REVIEWS` | review_id, photographer_id, enquiry_id/engagement_id, rating, review_text, verification_state, moderation_state, created_at |
| `12_REPORTS` | report_id, photographer_id, reporter details, reason, description, status, resolution_notes, timestamps |
| `13_SETTINGS` | setting_id, photographer_id, theme, preferences, publish settings |
| `14_AUDIT_LOG` | audit_id, actor_admin_id/photographer_id, action, target_type, target_id, metadata, created_at |
| `15_PHOTOGRAPHER_SERVICE_AREAS` | service_area_id, photographer_id, place_name, county/region, country, optional coordinates, active |
| `16_VERIFICATION_EVENTS` | application verification status history, due/review timestamps, reviewer and decision reason |
| `17_CONDUCT_CASES` | investigated misconduct cases, incident deduplication key, evidence references, upheld/dismissed outcome and decision audit |
| `18_PLANS_SUBSCRIPTIONS` | photographer plan, tier, entitlement state, provider reference, billing period and cancellation state |
| `19_PHOTO_PRODUCTS` | licensable photo product, price, currency, license terms and private original/preview asset references |
| `20_PHOTO_ORDERS` | buyer/order reference, amount, payment state, license snapshot and download entitlement |
| `21_ADMIN_INVITATIONS` | invitee email, role, inviter, hashed invitation token, expiry and acceptance state |
| `22_PHOTOGRAPHER_ALBUMS` | photographer-owned album metadata, order and publish state |

Use UUIDs, ISO-8601 timestamps and explicit status enums. Never use row numbers as identifiers. Keep registrations separate from approved photographer accounts. Store service areas as separate records, not a comma-delimited cell. Likes use a target type plus target ID so profile and photo likes can be enforced independently. Reviews must reference an eligible verified engagement. The workbook remains private and is never shared publicly.

## 9. Authentication, security and integrations

- Use a dedicated authentication provider; do not implement password storage in Sheets.
- Map provider user IDs to photographer/admin records.
- Enforce role, approval status and record ownership on the server for every private operation.
- Keep service-account credentials and provider secrets in Vercel environment variables; never expose them in client bundles or logs.
- Use an email provider for acknowledgement, admin notification, approval/rejection, enquiry notification and customer replies. Verify provider free-tier limits before choosing.
- Use separate image/object storage; Sheets stores metadata and URLs, not image binaries.
- Add validation, CSRF/session protections as appropriate to the auth stack, rate limits, safe upload validation, audit logging and privacy-aware retention.
- Public profile data may be cached; private dashboard/admin data must not be publicly cached.

## 10. Delivery stages

1. Public portfolio prototype — completed; Preview checks previously passed.
2. Database, authentication and admin foundation — next milestone.
3. Photographer registration and verification workflow.
4. Photographer dashboard and profile editor.
5. Public discovery and photographer listings.
6. Likes, visits and verified ratings.
7. Enquiries, messaging and email.
8. Reports, security and QA.
9. Commercial launch and monetization.

### Stage 2 work packages

- **2.1 Google Cloud/Sheets setup:** create/identify Cloud project, enable Sheets API, create service account, create private workbook and grant the service account access.
- **2.2 Workbook structure:** create all 22 worksheets, headers, enums, IDs, timestamps and validation conventions.
- **2.3 Server integration:** server-only Google API client, typed data-access layer, CRUD helpers and connection tests.
- **2.4 Authentication foundation:** configure provider, login/logout/session, protected routes, identity mapping and controlled super-admin bootstrap.
- **2.5 Authorization:** photographer ownership checks, admin role checks, approved-status gate and cross-account isolation tests.
- **2.6 Integration and Preview:** CRUD tests, two-photographer isolation, unauthenticated route denial, secret-exposure checks, build and explicit Vercel Preview deployment.

### Stage 2 acceptance criteria

- Server can connect to the private workbook and perform tested create/read/update/delete operations.
- Authenticated identity maps to a photographer/admin record.
- Unauthenticated users cannot access private dashboard or admin routes.
- Pending/rejected/suspended photographers cannot access the dashboard.
- Photographer A cannot read or modify Photographer B's private records.
- Non-admin users cannot access admin operations; only the initial super admin can bootstrap further admins.
- Service credentials never appear in client bundles or public responses.
- All changes are committed to a feature branch and deployed to Vercel Preview; no Production deployment without explicit authorization.
- Preview build is READY and security tests pass with no critical defects.

## 11. Current repository state and immediate prerequisites

The current repository is a static single-photographer portfolio prototype (Next.js 14, React 18, TypeScript). It has no implemented authentication, database integration, marketplace directory or multi-tenant dashboard yet. The next coding work must build the Stage 2 foundation rather than treating the existing demo as a completed SaaS.

Before connecting Google Sheets, the owner must complete the Google Cloud and private workbook setup described in `docs/GOOGLE_SHEETS_SETUP.md`. The owner has confirmed `henrymunala2@gmail.com` as the Google account for the initial Cloud project and workbook; this does not mean the live workbook or service account already exists. Authentication provider and image storage provider must still be selected before provider-specific integration code is added. Do not commit credentials, service-account JSON or real customer data.


## 12. Additional product requirements — verification, conduct, tiers and photo commerce

### 12.1 Manual verification service level

- On application submission, show **Under verification** and state that manual review normally takes up to 48 hours. Store `submitted_at`, `verification_due_at` (submitted_at + 48 hours), `last_reviewed_at`, status and admin notes.
- Statuses: `PENDING`, `UNDER_VERIFICATION`, `APPROVED`, `REJECTED`, `MORE_INFORMATION_REQUIRED`, `EXPIRED_REVIEW`. Pending applicants see a clear countdown/expected response date, not a promise of automatic approval.
- If rejected, show the reason and a **Resubmit verification** route. Preserve prior application history; create a new application/revision rather than overwriting the audit trail.
- If 48 hours pass without a decision, keep the account under verification (do not auto-approve or auto-reject), show an overdue notice and offer **Request verification update / Raise a verification complaint**. Admin queue flags overdue cases. If the applicant disputes a rejection or believes records were missed, they can request review; admin may reopen, request information or permit resubmission.
- Send applicant acknowledgement and admin notification on submission; send status-change emails. The 48-hour period is a target for manual review, not an automatic grant of access.

### 12.2 Photographer workspace and historical portfolio

- Once approved and activated, direct the photographer to their dashboard/profile editor immediately. Provide a guided first-publish checklist, profile completion indicator, preview and publish controls.
- Gallery must support uploading work completed before joining Lens & Light, with title/caption, category, date (optional), location (optional), image alt text, ordering, featured flag and rights/consent confirmation.
- Every photographer's public profile contains a prominent portfolio/gallery of their work. Support multiple gallery collections/albums and responsive image viewing. The photographer controls draft/published visibility.
- Require the photographer to confirm they own or have permission to display each uploaded image. Provide a copyright/takedown contact route.

### 12.3 Free membership and premium packages

- Approval grants a **Free/Standard** account with core profile creation, basic gallery, basic services, working hours and enquiry receipt. Do not make basic profile editing or the ability to display prior work dependent on payment.
- Premium is an optional paid subscription/add-on unlocking clearly described advanced features and enhanced marketplace visibility (for example expanded gallery capacity, advanced analytics, additional presentation options and eligible promoted placement).
- Publish plan comparison, price, billing period, renewal/cancellation terms, feature limits and payment status before checkout. Never imply that paying guarantees bookings or ratings.
- Label paid/promoted placement as sponsored/promoted and keep organic verified-rating ranking distinguishable. A premium payment must not buy or alter customer ratings.
- Keep entitlements server-enforced; subscription expiry/failure downgrades features gracefully without deleting the photographer's content.

### 12.4 Customer reports and photographer conduct

- Public report form includes category and a short description. The requested description limit is **1–9 words**; show a live word counter and reject 10 or more words with a clear prompt. This short summary can be supplemented by structured reason codes and evidence upload/contact follow-up where appropriate.
- A customer report about a photographer is accepted only if the submitted customer contact details can be matched server-side to an existing booking/enquiry record associated with that photographer. Match conservatively (normalized email/phone plus booking reference where available); do not disclose whether another person's records exist. If no qualifying match exists, return a generic failed-eligibility response and do not create a misconduct strike.
- Distinguish ordinary conduct complaints from **gross misconduct**. An unreviewed allegation is a report, not a confirmed violation. Admin investigates, records evidence and outcome, and can dismiss, uphold, request more information or escalate.
- **Ordinary misconduct policy:** up to five upheld ordinary misconduct cases may be recorded. On the sixth upheld case, automatically restrict the account pending administrator review and re-verification. Do not restrict solely because six unreviewed reports were submitted.
- **Gross misconduct policy:** up to two upheld gross-misconduct cases may be recorded. On the third upheld case, restrict the account pending administrator review and resolution. For credible urgent safety allegations, the super administrator may impose a temporary precautionary restriction before the threshold, with reason, review and appeal.
- During a temporary precautionary restriction, pause only the activities reasonably necessary to manage the urgent risk (such as publishing, new enquiries/booking requests or paid visibility); preserve existing data and provide access to account status, customer communication history where safe, and an appeal channel. Lift the restriction promptly when the issue is resolved, and no later than 48 hours unless a separate formal decision is made. Admin may require identity/profile re-verification under that documented decision.
- If a complaint is upheld, admin may apply a documented ranking penalty or reduce/discontinue visibility for a defined period. Do not silently erase historical ratings. Any rating exclusion/withholding must be tied to a specific moderation decision, shown accurately in internal audit records, and appealable. Customer ratings remain visible only after admin approval under section 12.5.
- Maintain separate counts for submitted reports, investigated reports and upheld findings. A single customer cannot manufacture multiple strikes by resubmitting the same incident; deduplicate by incident/booking and investigate coordinated abuse.

### 12.5 Review eligibility and moderation

- A review submission must match an existing booking/enquiry for that photographer and a customer identity/contact already associated with that record. An unverified visitor cannot submit a rating.
- New reviews enter `PENDING_ADMIN_REVIEW`; they do not affect public rating, ranking or displayed review count until approved. Admin can approve, reject or request clarification and must record a reason.
- Store booking/enquiry reference, verified customer match, rating, review text, moderation state, moderator and timestamps. Enforce at most one approved review per eligible engagement.
- Ratings and written reviews must be moderated consistently for authenticity, relevance, abusive content and conflicts of interest; moderation must not be used to suppress fair negative feedback.

### 12.6 High-liked featured photographs and paid downloads

- Photographers may nominate selected portfolio images as **Featured / Available to License** and set sale metadata (title, description, price, license type/terms, territory/use where applicable). The photographer must confirm ownership or authority to license the image.
- Public visitors can like photographs. The home page may automatically surface high-liked eligible photographs using a transparent, abuse-resistant popularity score, recency window and minimum engagement threshold. Apply rate limits and fraud detection; likes do not automatically grant commercial rights or guarantee placement.
- A photograph may be purchased only after the buyer sees the price, license/usage terms and payment summary and confirms checkout. Use a payment provider appropriate to the launch market; do not store card details in Sheets.
- After server-confirmed payment, create an order/receipt and issue a short-lived, single-purpose signed download URL or authenticated download entitlement. Log purchases and downloads; support refunds/disputes and a photographer payout/commission ledger before launch.
- Protect preview images with visible or forensic watermarks, serve appropriately sized previews, restrict original-file access to the server, use expiring signed URLs and add buyer/order watermarking where practical.
- **Screenshot limitation:** browsers and websites cannot reliably disable screenshots, screen recording, photography of a display or copying by every device. Do not claim screenshot prevention. Market the protection accurately as discouraging casual copying and securing original-file downloads, not making displayed previews uncopyable.
- Define marketplace commission, photographer revenue share, tax/receipt handling, refund rules, image license terms and dispute process before enabling paid downloads in production.

### 12.7 Admin account identity and provisioning

- The initial super administrator is the platform owner, provisioned from an explicitly supplied and verified admin email/contact identity using a server-side one-time bootstrap secret or controlled invite. Do not infer the owner's name/email from their ChatGPT account: this application cannot read private account profile details.
- Store admin identity and role in the private admin registry; protect admin sign-in with MFA/passkey and strong session controls. Allow the super administrator to invite additional admins later with least-privilege roles and audit every role change.
- Never place an admin email, PIN, bootstrap secret or service-account credential in public client code or source control.

### 12.8 Additional workbook worksheets

Add these worksheets to the initial workbook design:
- `16_VERIFICATION_EVENTS`: event_id, registration_id, status, due_at, reviewed_at, reviewer_admin_id, decision_reason, resubmission_of, created_at.
- `17_CONDUCT_CASES`: case_id, photographer_id, reporter_customer_match_id, booking_enquiry_id, category (ORDINARY/GROSS_MISCONDUCT), incident_key, evidence_refs, investigation_status, outcome (UPHELD/DISMISSED/INCONCLUSIVE), admin_id, decision_reason, timestamps.
- `18_PLANS_SUBSCRIPTIONS`: plan_id, photographer_id, tier, entitlement_state, provider_reference, period_start/end, cancellation_state, timestamps.
- `19_PHOTO_PRODUCTS`: product_id, photographer_id, photo_id, sale_state, price, currency, license_terms, original_asset_ref, preview_asset_ref.
- `20_PHOTO_ORDERS`: order_id, product_id, buyer_contact_ref, amount, currency, payment_state, provider_reference, license_snapshot, download_entitlement, timestamps.
- `21_ADMIN_INVITATIONS`: invitation_id, email, role, invited_by_admin_id, token_hash, expiry, accepted_at, status.
- `22_PHOTOGRAPHER_ALBUMS`: album_id, photographer_id, title, description, sort_order, publish_state.

Do not store raw payment credentials, raw PINs, one-time codes, full identity documents or original image binaries in Sheets. Store secure references and minimum necessary metadata only.

### 12.9 New acceptance tests

- Application shows the 48-hour verification target; overdue cases remain pending and can raise an update request; rejection supports resubmission with history retained.
- Approved photographer is directed to an editable dashboard immediately and can upload pre-existing portfolio work before purchasing premium.
- A photographer cannot access another photographer's gallery, services, enquiries, subscriptions or sales records.
- PIN sign-in has a second factor, throttling, recovery and secure server-side verification; raw PIN never appears in Sheets or logs.
- A complaint with no matching booking/enquiry is rejected generically; a matching complaint is queued, but does not create a strike until upheld by admin.
- Ordinary and gross-misconduct thresholds trigger only on upheld, deduplicated cases: sixth ordinary, third gross. Admin precautionary restriction is separately audited.
- Review is invisible and excluded from rating/ranking until admin approval and verified engagement matching.
- Photo popularity surfaces eligible images using anti-abuse rules; checkout requires explicit license acceptance; original download is unavailable until payment confirmation.
- Preview/download protection is described honestly; no claim of universal screenshot blocking.
- Initial super admin is provisioned only from an explicitly supplied, verified identity; additional admins are invite-only and audited.


### 12.10 Two-factor login, preview quality and tiered discovery (owner-confirmed)

- **Photographer authentication:** Every photographer sign-in must require the account identifier/PIN plus a second factor. Preferred initial flow is a time-limited, single-use OTP delivered to the photographer's verified contact channel; a passkey may be offered as a stronger alternative. Do not allow PIN-only login or treat OTP as a substitute for server-side session security. Enforce OTP expiry, one-time use, resend limits, attempt throttling, recovery and session/device revocation. Store only a salted slow hash for the PIN in the authentication system; never store PINs or OTPs in Google Sheets or logs.
- **Public image previews:** Serve public portfolio/product previews at deliberately reduced pixel dimensions and/or quality, with visible or forensic watermarking where appropriate. Keep original/high-resolution assets private and deliver them only after server-confirmed purchase and license acceptance using a short-lived download entitlement. Generate separate preview derivatives; do not expose original asset URLs or rely on client-side resizing. The preview should remain attractive enough to assess the work while being unsuitable as the purchased full-resolution deliverable. This reduces casual reuse but cannot prevent screenshots, screen recording or re-photography.
- **Free and premium discovery:** Free photographers remain publicly listed and eligible for customer discovery. Premium membership provides a higher allocation/likelihood of eligible recommendations and access to clearly labelled sponsored/promoted placements, not guaranteed bookings. Premium exposure must be bounded by relevance, location/service fit, quality and safety eligibility; it must not buy ratings, verified-review status or erase organic ranking. Keep organic results distinguishable from sponsored placements and disclose promotion labels. Define a transparent weighting/cap so free members retain meaningful organic discovery opportunities.
- **Initial super-admin identity (owner supplied):** Use `henrymunala2@gmail.com` as the intended email identity for the initial SUPER_ADMIN bootstrap/invitation. Verify control of that email through the authentication provider before granting the role. This is an identity/configuration input only; do not request or store the mailbox password or OTP, and do not hardcode the address in public client code. Provision through a one-time server-side bootstrap or controlled invitation and record the event in the audit log.


### 12.11 Remembered trusted devices and new-device verification (owner-confirmed)

- After a photographer successfully signs in with their account identifier/PIN and completes the required second-factor verification, offer to remember that device as a trusted device. On that same device/browser, preserve a secure session so the photographer is not repeatedly asked for an OTP on every visit.
- Use a secure server-managed session with appropriately scoped, rotated refresh credentials in Secure, HttpOnly, SameSite cookies; do not store session secrets in localStorage, expose them to JavaScript, or place them in Google Sheets. Apply inactivity and absolute session expiry, rotation/reuse detection, CSRF protections as appropriate, and safe logout.
- A sign-in from a new or unrecognized device/browser must require a fresh OTP to the photographer's verified contact channel (or a registered passkey/stronger approved factor) before granting access, even if the same account identifier and PIN are supplied.
- Provide a **Trusted devices / Active sessions** settings page showing device/browser, approximate last activity and session status, with the ability to revoke an individual device or all other sessions. Logout must invalidate the current server-side session; account recovery, suspected compromise, PIN change and admin/security events can revoke trusted-device status and require fresh verification.
- Treat a cleared browser profile, deleted cookies, private/incognito session, materially changed device/browser signals, expired session or elevated-risk login as untrusted and require OTP again. Do not rely on IP address alone as device identity, and do not promise perfect physical-device recognition.
- A remembered device reduces repeat OTP prompts; it does not bypass server-side account approval/suspension checks or re-authentication for sensitive actions (e.g. changing email/phone/PIN, payout/payment settings, or account recovery).
- Explain the trade-off to photographers: only mark a personally controlled device as trusted; do not trust public/shared computers. Provide **Remember this device** as an explicit opt-in and a way to turn it off.


### 12.11 Trusted-device sessions (owner-confirmed)

- First sign-in on a device requires account identifier + PIN + OTP to a verified contact channel (or approved passkey step-up).
- After successful verification, register that device as trusted and issue a revocable, secure, persistent session using an HttpOnly, Secure, SameSite cookie. Never store PINs, OTPs or bearer session tokens in localStorage, Sheets or client-readable storage.
- On the same device, a valid unexpired trusted session should restore the photographer's signed-in state without prompting for OTP on every visit. Apply idle/absolute expiry and risk-based step-up verification.
- A new/unrecognized device must complete OTP verification before it is trusted. Do not rely solely on user-agent strings; use a random device-bound credential stored securely and a server-side hashed/revocable device record.
- Provide account settings to view/revoke trusted devices and sign out individual/all sessions. Revoke sessions on PIN reset, account recovery, suspension or suspected compromise. Cleared cookies, expired sessions, private browsing or browser/device changes may require fresh OTP.
- Admin accounts use stronger MFA/passkey requirements and must not inherit photographer trusted-device relaxations without a separate admin policy.


### 12.12 Google Sheets ownership and access

- Designated Google account owner for the initial Lens & Light Google Cloud project and private database workbook: `henrymunala2@gmail.com` (owner account confirmed by the user).
- The workbook must remain private. The deployed application accesses it server-side through a dedicated Google service account shared only to the workbook with the minimum required permissions.
- Never request or store the owner's Google password or OTP. Never expose service-account credentials to browser code, public repository files, logs or the workbook.


### 12.13 Stage 9 — commercialisation and launch (owner-approved scope)

Stage 9 is approved as the implementation scope. Approval of this scope is not authorization to activate live payments or deploy to Production; provider accounts, commercial terms, legal readiness and a separate Production go-ahead remain required.

**Photographer subscriptions and entitlements**
- Offer Free and Premium plans. Free retains meaningful public discoverability and core profile, gallery, services, working hours and enquiry functionality.
- Define Premium features and limits clearly, including any expanded gallery capacity, advanced analytics, presentation features and eligible promoted placement.
- Before checkout, disclose price, currency, billing period, renewal behavior, feature limits, cancellation method/effective date, failed-payment handling and any grace period.
- Enforce entitlements server-side. Track subscription lifecycle events (pending, active, renewal due, past due, grace, cancelled, expired/refunded as applicable). On expiry or failed renewal, downgrade gracefully without deleting photographer content.
- Provide self-service billing status, invoices/receipts where supported, cancellation and support routes. Never imply that Premium guarantees enquiries, bookings, ratings or revenue.

**Sponsored discovery**
- Keep organic discovery available to Free and Premium photographers.
- Clearly label every paid placement as Sponsored or Promoted and visually distinguish it from organic ranking.
- Apply eligibility checks for relevance, location/service fit, profile quality and safety status; set transparent exposure caps/weighting so paid placement cannot overwhelm organic discovery.
- Payment must not buy ratings, verified-review status or moderation outcomes. Record promotion campaign, spend/period, placement and delivery metrics for audit.

**Photo licensing and checkout**
- Before purchase, show the image, photographer/seller identity, price/currency, exact license scope (permitted use, territory, duration, media/channel, exclusivity if any), restrictions, refund/dispute terms and payment summary. Require affirmative acceptance and preserve a versioned license snapshot with the order.
- Keep original assets private. Only a server-confirmed payment and accepted license may create an order and short-lived download entitlement. Log order, receipt, download issue/use, refunds and disputes. Prevent order-ID or URL guessing from granting access.
- Provide buyers with order history and a way to obtain receipts/support. Provide photographers with sales/order history and transparent earnings statements.

**Marketplace money flow**
- Before live commerce, define the platform commission, photographer share, payout eligibility/timing/minimums, reserve/hold policy where justified, refund allocation, chargeback responsibility, currency conversion and reconciliation rules.
- Maintain an auditable ledger of gross amount, fees, tax, commission, photographer payable, adjustments, refunds, chargebacks and payouts. Do not treat a payment-provider dashboard balance as the sole accounting record.
- Reconcile provider transactions, internal orders, subscription events, refunds and payouts; flag unmatched/failed events for administrator action. Use idempotency keys and signed provider webhooks; verify webhook authenticity and handle retries/out-of-order events safely.
- Do not store card details or payment secrets in Google Sheets. Use a suitable payment provider for the launch market and its hosted/secure payment flow.

**Tax, legal and customer protection**
- Confirm applicable tax treatment, invoice/receipt requirements, seller identity and marketplace reporting obligations before production payments.
- Publish and obtain acceptance of platform terms, privacy notice, photographer/seller terms, buyer license terms, refund/cancellation policy, acceptable-use rules and copyright/takedown process.
- Establish a clear customer support and dispute escalation process, including payment-provider disputes and photographer/buyer complaints.
- For a Kenya-first launch, obtain an appropriate review of applicable Kenya data-protection, consumer, tax and payment requirements before launch; do not assume a generic template alone is sufficient.

**Production operations and launch gates**
- Configure production secrets separately from Preview, least-privilege access, MFA/passkeys for administrators, secure domains and HTTPS, monitoring/alerts, error tracking, email delivery monitoring, upload/payment failure visibility and incident response contacts.
- Verify backup schedules and complete a restore exercise. Document rollback, data recovery, payment reconciliation and support procedures.
- Run end-to-end tests for signup/verification, trusted-device authentication, photographer ownership, public discovery, enquiry/customer replies, complaint/review moderation, subscription checkout/renewal/cancellation, promoted placement labels, photo purchase/license acceptance/download, refunds, disputes and payout reconciliation.
- Complete accessibility, responsive mobile/desktop, performance, SEO, privacy and security checks. Test loading, empty, validation, error, success and recovery states—not only the happy path.
- Keep all deployment work on Vercel Preview until the owner separately authorizes Production.

**Commercial decisions required before enabling live transactions**
- Payment provider and supported launch currencies.
- Free/Premium prices, billing periods and exact entitlement limits.
- Marketplace commission and photographer payout terms.
- Tax/invoice treatment and payout verification requirements.
- Photo license templates, refund rules and dispute allocation.
- Production domain, support contact and legal document approval.

**Stage 9 acceptance criteria**
- Subscription and entitlement state is server-authoritative, auditable and resilient to duplicate/out-of-order webhooks.
- Free photographers remain discoverable; sponsored placement is labelled, bounded and never represented as organic ranking.
- A buyer cannot download an original before verified payment and affirmative acceptance of the displayed license; download entitlements expire and are scoped to the order.
- Orders, subscription charges, commissions, refunds, disputes and payouts reconcile to provider events and internal ledger entries.
- Buyers and photographers can access accurate transaction records and support routes.
- Tax/legal/privacy/security/operational launch gates are reviewed and signed off before Production.
- Backup restoration, monitoring, rollback and end-to-end tests pass; no critical security or privacy defects remain.
