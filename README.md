# Lens & Light — Photographer Portfolio

A premium, responsive single-page photography portfolio built with Next.js, React, TypeScript and Tailwind-ready CSS foundations.

## Features
- Editorial-style, responsive one-page portfolio
- Sticky navigation with mobile menu
- Filterable portfolio gallery
- Image lightbox
- About, services and contact sections
- WhatsApp enquiry call to action
- Basic SEO metadata and Open Graph metadata

## Getting started
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## Personalize before publishing
The current page uses demonstration copy, stock photography and placeholder contact details. Update:
- Photographer name and brand in `app/page.tsx`
- Location, biography, services and portfolio images in the same file
- WhatsApp number in the `wa.me` CTA (international format, digits only)
- Email address and Instagram profile
- Page title and description in `app/layout.tsx`

## Deploy
Import this repository into Vercel, use the Next.js preset, and deploy. No environment variables are required for this static portfolio demo.

## Product direction

Lens & Light is being developed as a multi-photographer discovery and hiring marketplace with photographer portfolio SaaS, verified reviews, customer enquiries, trust and safety moderation, and optional commercial features. The current application remains a static single-photographer prototype; marketplace, authentication, multi-tenant dashboards, payments and Google Sheets integration are not yet implemented.

## Next implementation milestone
Stage 2: establish the private Google Sheets data foundation, authentication, secure sessions and admin authorization. The approved initial business workbook contains **22 worksheets**. See `docs/IMPLEMENTATION_SPEC.md` and `docs/GOOGLE_SHEETS_SETUP.md` for the agreed scope and owner setup prerequisites.
