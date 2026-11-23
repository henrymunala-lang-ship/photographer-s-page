"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Camera } from "lucide-react";

export default function CreateApplicantAccountPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [created, setCreated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 12) { setNotice("Choose a password with at least 12 characters."); return; }
    if (password !== confirmation) { setNotice("The passwords do not match."); return; }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/public/applications/account-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your account could not be created.");
      setCreated(true);
      setPassword("");
      setConfirmation("");
      setNotice(data.message || "Your sign-in account is ready.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your account could not be created.");
    } finally { setBusy(false); }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2ec", color: "#25231f", padding: "32px 18px 64px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "inherit", textDecoration: "none", letterSpacing: ".12em", fontSize: 13, fontWeight: 700 }}><Camera size={20} /> LENS & LIGHT</Link>
        <section style={{ marginTop: 56, padding: 24, background: "#fffdf9", border: "1px solid #ddd7cc", borderRadius: 8 }}>
          <p style={{ fontSize: 11, letterSpacing: ".16em", fontWeight: 700, color: "#777064" }}>PRIVATE APPLICANT SPACE</p>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 38, margin: "12px 0" }}>Create your photographer sign-in</h1>
          <p style={{ color: "#6d685f", lineHeight: 1.7 }}>This page works only after you open your private application link. Creating sign-in access does not approve your application or publish your profile.</p>
          {created ? <p role="status" style={{ lineHeight: 1.7 }}>{notice} <Link href="/photographer/login" style={{ textDecoration: "underline", fontWeight: 700 }}>Sign in</Link>.</p> : (
            <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 22 }}>
              <label htmlFor="applicant-password" style={{ fontSize: 13, fontWeight: 700 }}>Password (at least 12 characters)</label>
              <input id="applicant-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: 13, border: "1px solid #d7d0c4", borderRadius: 5, font: "inherit", background: "#fff" }} />
              <label htmlFor="applicant-confirm" style={{ fontSize: 13, fontWeight: 700 }}>Confirm password</label>
              <input id="applicant-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: 13, border: "1px solid #d7d0c4", borderRadius: 5, font: "inherit", background: "#fff" }} />
              <button disabled={busy} type="submit" style={{ justifySelf: "start", marginTop: 6, padding: "13px 18px", background: "#282722", color: "white", border: 0, borderRadius: 4, cursor: "pointer" }}>{busy ? "Creating account…" : "Create sign-in account"}</button>
              {notice && <p role="status" style={{ color: "#8a5b35", fontSize: 13, lineHeight: 1.6 }}>{notice} {notice.toLowerCase().includes("sign in") && <Link href="/photographer/login" style={{ textDecoration: "underline", fontWeight: 700 }}>Go to sign in</Link>}</p>}
            </form>
          )}
          <p style={{ marginTop: 22, fontSize: 12, color: "#777064" }}><Link href="/application/updates" style={{ textDecoration: "underline" }}>Return to your application conversation</Link></p>
        </section>
      </div>
    </main>
  );
}
