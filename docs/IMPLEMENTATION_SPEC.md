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
- Approval sends an account activation link; the photographer sets their own password through the authentication provider.
- Rejection sends a reason and next-step guidance.
- Authentication and membership approval are separate checks: a valid session is insufficient unless the linked photographer status is APPROVED and not suspended.
- Do not store passwords, session tokens or authentication secrets in Google Sheets.

## 5. Photographer dashboard

Sections: Overview, My Profile, Gallery, Services, Working Hours, Enquiries, Reviews, Appearance and Settings.

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
