"use client";

import { useState } from "react";

type Result = {
  ok?: boolean;
  error?: string;
  code?: string;
  workbookChanged?: boolean;
  createdTabs?: string[];
  verifiedTabs?: string[];
  existingTabsPreserved?: number;
};

export default function WorkbookMigrationClient() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runMigration() {
    if (busy) return;
    const confirmed = window.confirm(
      "Create only 23_APPLICATION_DETAILS and 24_APPLICATION_MESSAGES in the connected Preview workbook? The original 22 tabs will be preserved. No application rows will be copied."
    );
    if (!confirmed) return;

    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/owner/workbook-migrations/application-storage", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" }
      });
      const payload = (await response.json()) as Result;
      setResult(payload);
    } catch {
      setResult({
        error: "The request could not be completed. Check your connection and refresh this page before retrying.",
        code: "REQUEST_FAILED"
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="owner-shell" style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px" }}>
      <a href="/owner" style={{ display: "inline-block", marginBottom: 24 }}>← Back to Owner Workspace</a>
      <h1>Application workbook setup</h1>
      <p>This one-time step adds two dedicated tabs to the connected Preview Google workbook.</p>
      <section style={{ border: "1px solid var(--border, #d1d5db)", borderRadius: 12, padding: 20, margin: "24px 0" }}>
        <h2>What this action will do</h2>
        <ul>
          <li>Create <strong>23_APPLICATION_DETAILS</strong> with its approved header row.</li>
          <li>Create <strong>24_APPLICATION_MESSAGES</strong> with its approved header row.</li>
          <li>Verify both tabs and their exact headers after creation.</li>
          <li>Preserve all 22 existing workbook tabs.</li>
        </ul>
        <h2>What it will not do</h2>
        <ul>
          <li>It will not edit, rename, or delete any existing tab.</li>
          <li>It will not copy application records or messages.</li>
          <li>It will not enable ongoing workbook sync.</li>
          <li>It will not affect the Production workbook.</li>
        </ul>
      </section>
      <button type="button" onClick={runMigration} disabled={busy}
        style={{ padding: "12px 18px", borderRadius: 8, border: 0, cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Creating and verifying tabs…" : "Create the two application tabs"}
      </button>
      <p style={{ marginTop: 20 }}>
        <a href="/owner/workbook-sync">Continue to the separate, confirmation-protected application sync</a>
      </p>
      {result && (
        <section aria-live="polite" style={{ border: "1px solid var(--border, #d1d5db)", borderRadius: 12, padding: 20, marginTop: 24 }}>
          {result.ok ? (
            <>
              <h2>Migration verified</h2>
              <p>{result.workbookChanged ? "The two tabs were created and verified." : "Both tabs already existed and their headers were verified; no workbook changes were needed."}</p>
              <p><strong>Created:</strong> {result.createdTabs?.length ? result.createdTabs.join(", ") : "None"}</p>
              <p><strong>Verified:</strong> {result.verifiedTabs?.join(", ")}</p>
              <p><strong>Original tabs preserved:</strong> {result.existingTabsPreserved ?? 22}</p>
              <p>Application records have not been copied yet. This completes tab setup only.</p>
            </>
          ) : (
            <>
              <h2>Migration not confirmed</h2>
              <p>{result.error ?? "The server did not confirm the migration."}</p>
              {result.code && <p><strong>Reference:</strong> {result.code}</p>}
              <p>No success will be assumed unless the server returns a verified result.</p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
