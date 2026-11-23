import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function GoogleOwnerSetupPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const isPreviewHost = host.endsWith(".vercel.app") || host.includes("localhost");
  return (
    <main style={{ maxWidth: 680, margin: "64px auto", padding: "0 24px", fontFamily: "system-ui", color: "#222" }}>
      <p style={{ letterSpacing: 2, fontSize: 12 }}>LENS &amp; LIGHT · OWNER SETUP</p>
      <h1>Connect the private Google workbook</h1>
      <p>This restricted setup flow is for the verified workbook owner only. It authorizes the private workbook and image uploads to Google Drive. The added drive.file permission is limited to files created by this app; it does not add Google sign-in for photographers, customers or admins.</p>
      <p><strong>Before continuing:</strong> use the Preview deployment, sign in to Google as the configured owner, and confirm the OAuth client and redirect URI have been configured in Google Cloud.</p>
      {!isPreviewHost ? <p role="alert">This setup page is enabled only on a Preview or local development host.</p> : (
        <form method="post" action="/api/integrations/google/oauth/start">
          <label htmlFor="setupKey">One-time owner setup key</label>
          <input id="setupKey" name="setupKey" type="password" autoComplete="off" required minLength={32} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 12, margin: "8px 0 16px" }} />
          <button type="submit" style={{ padding: "12px 18px" }}>Continue to Google authorization</button>
        </form>
      )}
      <p style={{ marginTop: 32, fontSize: 13, color: "#666" }}>The setup key and OAuth credentials must never be shared in chat or committed to the repository. Google will ask you to approve Sheets access and the restricted Drive file permission. The refresh token will be shown once; replace the existing Preview-only GOOGLE_OAUTH_REFRESH_TOKEN Secret directly in Vercel. Never paste it into chat or source code.</p>
    </main>
  );
}
