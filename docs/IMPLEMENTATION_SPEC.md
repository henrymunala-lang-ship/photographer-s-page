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
- **2.2 Workbook structure:** create all 15 worksheets, headers, enums, IDs, timestamps and validation conventions.
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

Before connecting Google Sheets, the product owner must identify the Google account that will own the Cloud project/workbook and create or authorize the required Google Cloud resources. Authentication provider choice and image storage provider must also be confirmed before adding provider-specific integration code. Do not commit credentials, service-account JSON or real customer data.


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
- Restrictions pause publishing, new enquiries/booking requests and paid visibility as appropriate, while preserving the photographer's data and giving access to a status/appeal channel. Admin may require identity/profile re-verification before reinstatement.
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
