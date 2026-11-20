# Google Sheets setup — Lens & Light

## Confirmed ownership and workbook

- Google account that owns the workbook and authorizes the integration: `henrymunala2@gmail.com`.
- Spreadsheet ID: `1Q_VsdIMo1FSSKVv_JnUds_8Kh7ht-PkBT7Z_lQaRy9Q`.
- Vercel variable `GOOGLE_SHEETS_SPREADSHEET_ID` is already configured for Preview deployments on branch `integration-foundation` only.
- The private workbook must remain restricted. Do not publish it or enable public link access.
- All 22 approved worksheets are retained; this integration does not remove, merge or repurpose them.

## Authentication model

Lens & Light will use **Google OAuth 2.0 server-side authorization**, granted by the owner account above. This is an infrastructure connection, not a Google sign-in option for photographers, customers or admins.

The Vercel backend uses an OAuth refresh token to obtain short-lived access tokens and call the Google Sheets API. The refresh token and OAuth client secret must never be placed in source control, Google Sheets, browser storage, client-side code, GitHub issues or chat messages.

Use the narrow `https://www.googleapis.com/auth/drive.file` scope where possible. This scope is per-file and is the recommended non-sensitive scope for Sheets API access. It requires the workbook to be explicitly authorized for the app (normally using Google Picker or the app's file-selection flow). Do not silently substitute the broad `spreadsheets` scope, which can grant access to all spreadsheets in the Google account. See the official [Sheets API scopes](https://developers.google.com/workspace/sheets/api/scopes) and [Drive API scope guidance](https://developers.google.com/drive/api/guides/api-specific-auth).

## Owner setup required before live connection

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/) as `henrymunala2@gmail.com` and select the Cloud project that will own the integration.
2. Enable **Google Sheets API** and **Google Drive API** in that project.
3. Configure the OAuth consent screen. For a personal Gmail account, configure an External app and add `henrymunala2@gmail.com` as a test user while testing. Do not publish the app or request public verification as part of this Preview setup.
4. Create an OAuth 2.0 **Web application** client. Keep its client secret private.
5. Add the exact authorized redirect URI for the one-time authorization flow when provided by the integration setup step. Redirect URI matching is exact.
6. Authorize the app as `henrymunala2@gmail.com` with offline access and the narrowest suitable scope. The workbook must be explicitly selected/authorized for the app before the read-only verification can pass.
7. Add the resulting OAuth client ID, client secret and refresh token to Vercel project environment variables as **Sensitive**, scoped to **Preview** and branch `integration-foundation` only:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REFRESH_TOKEN`
8. Do not send credentials or tokens in chat. Enter them directly in the Vercel dashboard. Do not configure them for Production.
9. Redeploy the Preview branch after adding the variables.
10. Run the read-only verification script described below. It checks access and confirms all 22 expected tabs; it does not write data.

Google's web-server OAuth flow must request offline access to obtain a refresh token. Google documents that the refresh token is returned on initial authorization and should be stored securely for future token refreshes: [OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server). If the OAuth consent screen remains in Testing, refresh-token lifetime restrictions apply; do not treat a Testing-mode token as a production-ready long-lived connection.

## Preview environment variables

`GOOGLE_SHEETS_SPREADSHEET_ID` is already present in Vercel Preview on `integration-foundation`.

The following are still missing and must be added by the owner directly in Vercel as Sensitive variables, Preview-only, branch `integration-foundation`:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

The repository includes `.env.example` as a names-only template. Never commit real values or put any of these values under a `NEXT_PUBLIC_` name.

## Read-only connection verification

After adding the three OAuth values and redeploying, run:

```bash
node scripts/verify-google-sheets.mjs
```

The script requires the four environment variables to be present in the shell. It exchanges the refresh token, reads workbook metadata, confirms the configured spreadsheet ID and checks for the exact 22 approved worksheet names. It performs **no writes**.

For local development, use a private `.env.local` file (never commit it). For Vercel Preview, use the Vercel environment configuration. If the script reports an authorization error, check that:
- The correct Cloud project has both APIs enabled.
- The refresh token was issued to the same OAuth client ID/secret.
- The token includes the required `drive.file` scope.
- The exact workbook was authorized for the app.
- The workbook remains accessible to `henrymunala2@gmail.com`.

## Implementation status

Implemented on `integration-foundation`:
- Server-only OAuth token refresh client.
- Google Sheets API request wrapper with bounded retries for transient errors.
- Metadata, read-range, append and update primitives.
- Read-only workbook verification script for the 22-tab structure.
- Preview-only spreadsheet ID environment variable.

Not yet completed:
- Google Cloud OAuth client configuration and owner consent.
- Secure refresh-token configuration in Vercel.
- File-specific workbook authorization for the OAuth app.
- Successful live read verification.
- Header/schema validation and typed repositories for all workbook tabs.
- Any live business-data writes.

No live connection is claimed until the read-only verification succeeds. Use synthetic test records only after the connection is verified, and do not use real customer/photographer data until authorization, access controls, backups and restore procedures have been tested.

## Security rules

- Never store passwords, PINs, OTPs, session tokens, OAuth refresh tokens, payment credentials or identity-document images in Sheets.
- Keep OAuth credentials server-side in Vercel Sensitive environment variables.
- Never expose access tokens to the browser or logs.
- Keep authentication and trusted-device/session state in a separate identity/session system, not the workbook.
- Store image metadata and private asset references only; keep original image binaries in private object storage.
- Keep the workbook private and use least-privilege OAuth scopes.
- Use synthetic test records during development.
