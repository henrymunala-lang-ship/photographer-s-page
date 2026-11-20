# Lens & Light — Photographer Portfolio

A premium, responsive single-page photography portfolio built with Next.js, React and TypeScript.

## Current implementation status

The deployed page is a static single-photographer prototype. It is not yet the multi-photographer marketplace or secure photographer/admin application. Authentication, Google Sheets integration, media storage, messaging, moderation and payment services are not yet implemented.

## Features in the prototype
- Editorial-style responsive one-page portfolio
- Sticky navigation with mobile menu
- Filterable portfolio gallery and image lightbox
- About, services and contact sections
- Demonstration copy, stock imagery and placeholder contact details

## Getting started
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## Product direction

Lens & Light is being developed as a multi-photographer discovery and hiring marketplace with photographer portfolio SaaS, verified reviews, customer enquiries, trust and safety moderation, and optional commercial features. The approved business workbook retains its original **22 worksheets**.

## Architecture and implementation planning

- `docs/IMPLEMENTATION_SPEC.md` — locked product requirements and staged roadmap.
- `docs/GOOGLE_SHEETS_SETUP.md` — private workbook and Google Cloud owner setup.
- `docs/INTEGRATION_ARCHITECTURE.md` — detailed backend integration boundaries, service contracts, data-access design, identity/security requirements, workflows, API inventory, test strategy and backend readiness gate.

The integration architecture is a plan, not evidence that external providers or backend services are already connected. Owner decisions and setup prerequisites are recorded in that document and in GitHub issue #4.

## Delivery policy

Build on feature branches and review changes through pull requests. Use Vercel Preview deployments and synthetic data for integration verification. Do not merge product changes or deploy to Production without explicit owner authorization.
