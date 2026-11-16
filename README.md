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

## Next product milestone
Connect a photographer dashboard and Supabase so each photographer can manage their own profile, portfolio images, services, testimonials and enquiries. Add Supabase Row Level Security before enabling multi-photographer accounts.
