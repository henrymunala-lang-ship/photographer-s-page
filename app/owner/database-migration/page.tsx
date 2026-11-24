"use client";

import { useState } from "react";

type MigrationResult = {
  ok?: boolean;
  version?: string;
  tablesVerified?: number;
  error?: string;
  code?: string;
};

export default function DatabaseMigrationPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  async function runMigration() {
    if (busy) return;
    const confirmed = window.confirm(
      "Run the additive Preview application-database migration? It creates or verifies the application tables and adds the photographer session-version column. It does not delete or rewrite application records and does not affect Production."
    );
    if (!confirmed) return;

    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/owner/database-migrations/application-storage", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" }
      });
      const payload = (await response.json()) as MigrationResult;
      setResult(payload);
    } catch {
      setResult({
        error: "The request could not be completed. Refresh this page and try again.",
        code: "REQUEST_FAILED"
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="owner-shell" style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px" }}>
      <a href="/owner" style={{ display: "inline-block", marginBottom: 24 }}>← Back to Owner Workspace</a>
      <h1>Preview database maintenance</h1>
      <p>Run the pending additive application-database migration required by photographer sign-in.</p>
      <section style={{ border: "1px solid var(--border, #d1d5db)", borderRadius: 12, padding: 20, margin: "24px 0" }}>
        <h2>What this action does</h2>
        <ul>
          <li>Applies the pending Preview application-storage schema migration.</li>
          <li>Adds the missing photographer session-version column if it is not present.</li>
          <li>Verifies the application database tables after the migration.</li>
        </ul>
        <h2>What it does not do</h2>
        <ul>
          <li>It does not delete or rewrite existing application or photographer records.</li>
          <li>It does not change Google Sheets or Google Drive content.</li>
          <li>It does not affect Production.</li>
        </ul>
      </section>
      <button type="button" onClick={runMigration} disabled={busy}
        style={{ padding: "12px 18px", borderRadius: 8, border: 0, cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Applying and verifying…" : "Run Preview database migration"}
      </button>
      {result && (
        <section aria-live="polite" style={{ border: "1px solid var(--border, #d1d5db)", borderRadius: 12, padding: 20, marginTop: 24 }}>
          {result.ok ? (
            <>
              <h2>Database migration verified</h2>
              <p>Schema version: <strong>{result.version}</strong></p>
              <p>Application tables verified: <strong>{result.tablesVerified}</strong></p>
              <p>You can now retry photographer sign-in.</p>
            </>
          ) : (
            <>
              <h2>Migration not confirmed</h2>
              <p>{result.error ?? "The server did not confirm the migration."}</p>
              {result.code && <p>Reference: <strong>{result.code}</strong></p>}
              <p>No success will be assumed unless the server returns a verified result.</p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
