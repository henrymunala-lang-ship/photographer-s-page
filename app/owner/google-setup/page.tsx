import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, currentAdmin } from "@/lib/owner/admin-auth";

export const dynamic = "force-dynamic";

export default async function GoogleOwnerSetupPage() {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "admins:manage")) redirect("/owner");

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const isPreviewHost = host.endsWith(".vercel.app") || host.includes("localhost");
  const ownerEmail = process.env.GOOGLE_OAUTH_OWNER_EMAIL ?? "the configured workbook owner";
  return (
    <main style={{ minHeight: "100vh", background: "#f5f2ec", padding: "clamp(24px,6vw,64px) 18px", color: "#292821" }}>
      <section style={{ width: "min(720px,100%)", margin: "0 auto", background: "#fffdf8", border: "1px solid #ded8cc", borderRadius: 14, padding: "clamp(22px,5vw,42px)", boxShadow: "0 18px 55px rgba(31,29,25,.08)" }}>
        <p style={{ fontSize: 10, letterSpacing: ".18em", fontWeight: 700, color: "#8b7658", margin: "0 0 12px" }}>LENS &amp; LIGHT · LEAD ADMIN SETUP</p>
        <h1 style={{ font: "400 clamp(30px,5vw,42px)/1.15 Georgia,serif", margin: "0 0 12px" }}>Connect your <em>Google account.</em></h1>
        <p style={{ color: "#68645c", fontSize: 13, lineHeight: 1.8, margin: "0 0 26px" }}>This secure connection lets Lens &amp; Light access its private workbook and store profile and portfolio images in Google Drive.</p>
        <div style={{ display: "grid", gap: 12, marginBottom: 22 }}>
          <section style={{ border: "1px solid #e2ddd3", borderRadius: 9, padding: 17, background: "#faf8f3" }}>
            <strong style={{ fontSize: 13 }}>What this connection allows</strong>
            <ul style={{ color: "#68645c", fontSize: 12, lineHeight: 1.9, paddingLeft: 19, margin: "9px 0 0" }}>
              <li>Read and update the private Lens &amp; Light Google workbook.</li>
              <li>Create and manage image files created by this application in Google Drive.</li>
              <li>Keep Google sign-in restricted to the configured owner account.</li>
            </ul>
          </section>
          <section style={{ border: "1px solid #e2ddd3", borderRadius: 9, padding: 17 }}>
            <strong style={{ fontSize: 13 }}>Account and environment checks</strong>
            <div style={{ display: "grid", gap: 8, marginTop: 11, fontSize: 12, color: "#68645c" }}>
              <p style={{ margin: 0 }}><b style={{ color: "#292821" }}>Authorized account:</b> {ownerEmail}</p>
              <p style={{ margin: 0 }}><b style={{ color: "#292821" }}>Environment:</b> Preview only</p>
              <p style={{ margin: 0 }}><b style={{ color: "#292821" }}>Photographer and customer Google sign-in:</b> Not enabled</p>
            </div>
          </section>
          <section style={{ border: "1px solid #ead9c9", borderRadius: 9, padding: 17, background: "#fbf6ef" }}>
            <strong style={{ fontSize: 13 }}>Before you continue</strong>
            <p style={{ color: "#68645c", fontSize: 12, lineHeight: 1.8, margin: "8px 0 0" }}>Continue only if the Google account shown above is yours and you are using the Lens &amp; Light Preview site. Google will display its own permission screen next; review the requested access there before approving.</p>
          </section>
        </div>
        {!isPreviewHost ? <p role="alert" style={{ borderRadius: 8, padding: 14, background: "#fff0ed", color: "#8d281d", fontSize: 12 }}>For safety, this connection can only be started from a Preview or local development host.</p> : (
          <form method="post" action="/api/integrations/google/oauth/start" style={{ display: "grid", gap: 10 }}>
            <button type="submit" style={{ padding: 14, borderRadius: 5, border: 0, background: "#292821", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Continue to Google authorization</button>
            <a href="/owner" style={{ textAlign: "center", color: "#68645c", fontSize: 12, padding: 8 }}>Cancel and return to the owner workspace</a>
          </form>
        )}
        <p style={{ margin: "22px 0 0", paddingTop: 18, borderTop: "1px solid #e8e3da", fontSize: 11, lineHeight: 1.8, color: "#777064" }}>Google may show a refresh token once after authorization. Store it directly as the Preview-only GOOGLE_OAUTH_REFRESH_TOKEN Secret in Vercel. Never paste it into chat, share it with another administrator, or add it to source code.</p>
      </section>
    </main>
  );
}
