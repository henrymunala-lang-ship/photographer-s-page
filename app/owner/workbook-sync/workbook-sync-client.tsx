"use client";

import { useState } from "react";

type Result = {
  ok?: boolean;
  error?: string;
  detail?: string;
  applicationsRead?: number;
  messagesRead?: number;
  registrationsAppended?: number;
  registrationsUpdated?: number;
  detailsAppended?: number;
  detailsUpdated?: number;
  messagesAppended?: number;
  messagesUpdated?: number;
  alreadyPresent?: number;
  deferred?: number;
  failed?: number;
  failedIds?: string[];
};

export default function WorkbookSyncClient() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runSync() {
    if (busy) return;
    const confirmed = window.confirm(
      "Sync application records and conversation messages from the Preview database to the connected Preview Google workbook now? This writes applicant contact details and message text to the workbook. Production will not be touched."
    );
    if (!confirmed) return;

    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/owner/applications/workbook-sync", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" }
      });
      const payload = (await response.json()) as Result;
      setResult(payload);
    } catch {
      setResult({ error: "The sync request could not be completed. Refresh this page and check the workbook before retrying." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="owner-shell" style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px" }}>
      <a href="/owner" style={{ display: "inline-block", marginBottom: 24 }}>← Back to Owner Workspace</a>
      <h1>Application workbook sync</h1>
      <p>One-way sync from the Preview application database to the connected Preview Google workbook. This does not enable continuous/background sync.</p>
      <section style={{ border: "1px solid var(--border, #d1d5db)", borderRadius: 12, padding: 20, margin: "24px 0" }}>
        <h2>Data that will be copied</h2>
        <ul>
          <li>Application contact and review status fields to <strong>01_REGISTRATIONS</strong>.</li>
          <li>Application profile links, categories and service-area text to <strong>23_APPLICATION_DETAILS</strong>.</li>
          <li>Application conversation messages and delivery metadata to <strong>24_APPLICATION_MESSAGES</strong>.</li>
        </ul>
        <h2>Safety checks</h2>
        <ul>
          <li>Only the Preview database and Preview workbook are used.</li>
          <li>Existing rows are matched by stable IDs; retries reconcile existing rows rather than blindly appending duplicates.</li>
          <li>Original worksheet columns and the original 22 tabs are preserved.</li>
          <li>Unsupported statuses, schema drift and duplicate workbook IDs stop the sync.</li>
          <li>Private access tokens, token hashes and encrypted token payloads are never copied.</li>
        </ul>
        <p><strong>Important:</strong> applicant contact details and conversation text are private data. Confirm only if the connected workbook is access-restricted to authorized administrators.</p>
      </section>
      <button type="button" onClick={runSync} disabled={busy}
        style={{ padding: "12px 18px", borderRadius: 8, border: 0, cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Syncing Preview records…" : "Confirm and sync Preview applications"}
      </button>
      {result && (
        <section aria-live="polite" style={{ border: "1px solid var(--border, #d1d5db)", borderRadius: 12, padding: 20, marginTop: 24 }}>
          <h2>{result.ok ? "Sync completed" : "Sync needs attention"}</h2>
          {result.error && <p>{result.error}</p>}
          {result.detail && <p>{result.detail}</p>}
          <p>Applications read: {result.applicationsRead ?? "—"} · Messages read: {result.messagesRead ?? "—"}</p>
          <ul>
            <li>Registration rows added: {result.registrationsAppended ?? 0}; updated: {result.registrationsUpdated ?? 0}</li>
            <li>Detail rows added: {result.detailsAppended ?? 0}; updated: {result.detailsUpdated ?? 0}</li>
            <li>Message rows added: {result.messagesAppended ?? 0}; updated: {result.messagesUpdated ?? 0}</li>
            <li>Already present: {result.alreadyPresent ?? 0}; deferred: {result.deferred ?? 0}; failed: {result.failed ?? 0}</li>
          </ul>
          {result.failedIds?.length ? <p>Some records need review. Reference IDs: {result.failedIds.join(", ")}</p> : null}
          <p>Only a completed response confirms the reported rows were synchronized. This is a one-time action, not ongoing sync.</p>
        </section>
      )}
    </main>
  );
}
