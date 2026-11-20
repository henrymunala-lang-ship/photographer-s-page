# Google Sheets setup — Lens & Light

## Confirmed ownership
The user confirmed `henrymunala2@gmail.com` as the Google account that will own the initial Google Cloud project and private Lens & Light database workbook.

## Current status
- The 22-tab workbook template has been generated in this project conversation as `Lens_and_Light_Google_Sheets_Workbook.xlsx`.
- The live Google Sheet has **not** yet been created or connected.
- Google Drive access is not currently available to the project automation, so the owner must perform the initial Google-side authorization and sharing steps.
- Do not treat this document or the downloadable workbook as evidence that a live spreadsheet exists.

## Owner setup checklist
1. Sign in to Google Drive as `henrymunala2@gmail.com`.
2. Upload `Lens_and_Light_Google_Sheets_Workbook.xlsx` from the project handoff.
3. Open the uploaded file with Google Sheets and use **File → Save as Google Sheets** (or the equivalent Drive conversion action).
4. Rename it **Lens & Light — Database** and keep General access restricted. Do not publish it to the web or share it with public links.
5. In Google Cloud Console, create/select a project owned by this Google account and enable the Google Sheets API.
6. Create a dedicated service account for the Vercel application. Do not use a personal Google password or user OAuth token in the deployed app.
7. Share the private workbook with the service account email, granting only the access needed by the application (Editor if the application must write rows).
8. Supply the service-account credentials only through Vercel encrypted environment variables or a supported secret manager. Never commit credentials, put them in client-side variables, or paste them into GitHub issues/chat.
9. Record the spreadsheet ID and service-account email in the private deployment configuration. Do not put credentials or private identifiers in public client code.
10. Verify server-side read/write access in a Vercel Preview environment before adding production data.

## Security rules
- Never store passwords, PINs, OTPs, session tokens, payment credentials, or identity-document images in Sheets.
- Keep auth provider identities and trusted-device/session state in the authentication/session system, not in the workbook.
- Store image metadata and private asset references only; keep original image binaries in private object storage.
- Restrict workbook access to the owner and the application service account. Give human collaborators only the minimum required access.
- Use synthetic test records during development; avoid real customer/photographer data until access controls and backups are verified.

## Not yet selected
Authentication provider, image/object storage provider, payment provider, marketplace commission, and launch-specific licensing/refund rules still require explicit selection before those integrations are configured.
