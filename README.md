# Lens & Light

Lens & Light is a photographer discovery and hiring platform with photographer portfolio tools and an owner-managed operations workspace. The application is built with Next.js, React, and TypeScript, with Neon Postgres for application data and Google Sheets retained for selected owner-managed records and workbook workflows.

## Implemented capabilities

The current integration includes:

- Responsive photographer portfolio and gallery experiences.
- Photographer applications, owner review workflows, and applicant follow-up messaging.
- Photographer accounts, sign-in, session handling, and account management.
- Customer enquiries, private customer access links, and customer/photographer/owner conversations.
- Gallery image upload and moderation, including pending-review handling before publication.
- Owner notifications and email notification workflows.
- Database-backed application storage, schema migration, and rate limiting for sensitive authentication and messaging flows.
- Preview backup and recovery procedures documented outside the application repository.

Some external-service capabilities depend on environment configuration. In particular, reliable outbound email delivery requires a verified sender identity/domain with the email provider.

## Environments and release safety

The `integration-foundation` branch is the active integration and hardening branch. Changes are reviewed through Vercel Preview deployments and should be verified with synthetic/test records where practical.

Administrative application-management and owner session endpoints are intentionally restricted to Vercel Preview while the product is being hardened. A successful Preview build is not Production approval.

**Do not merge to the Production branch, deploy to Production, or change Production settings without explicit owner authorization.** Production readiness requires a separate review of environment configuration, security controls, operational recovery, and end-to-end workflows.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Use `.env.example` as a reference for required configuration. Never commit credentials, tokens, database URLs, or other secrets.

## Product and architecture documentation

- `docs/IMPLEMENTATION_SPEC.md` — product requirements and staged roadmap.
- `docs/GOOGLE_SHEETS_SETUP.md` — private workbook and Google Cloud setup.
- `docs/INTEGRATION_ARCHITECTURE.md` — backend boundaries, service contracts, data access, identity/security requirements, workflows, API inventory, and readiness gates.
- `docs/WORKBOOK_SCHEMA_MAPPING.md` — workbook-to-application data mapping.

The approved business workbook retains its original **22 worksheets**. Workbook integrations and database-backed application features have distinct responsibilities; consult the architecture and schema documents before changing either contract.

## Delivery policy

Work on `integration-foundation` or an explicitly approved feature branch. Validate changes in Preview, review database/schema implications, and preserve test data boundaries. Production changes require explicit owner approval.
