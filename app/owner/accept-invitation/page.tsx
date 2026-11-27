"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

export default function AcceptInvitation() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invitationToken = params.get("token") || "";
    if (invitationToken) {
      setToken(invitationToken);
      // Keep the one-time secret out of the address bar and subsequent browser history.
      params.delete("token");
      const remainingQuery = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname +
          (remainingQuery ? `?${remainingQuery}` : "") +
          window.location.hash,
      );
    }
    setTokenLoaded(true);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setMessage("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/owner/admin-invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          token: token.trim(),
          fullName: name.trim(),
          password,
          confirmPassword: confirm,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Could not accept the invitation. Please try again.");
        return;
      }
      setDone(true);
      setMessage(data.message || "Administrator account created. You can now sign in.");
    } catch {
      setMessage("We could not reach the server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="owner-login">
      <div className="owner-login-card">
        <div className="owner-brand">LENS <i>&</i> LIGHT</div>
        <p className="owner-eyebrow">ADMINISTRATOR INVITATION</p>
        <h1>Set up your<br /><em>account.</em></h1>
        {done ? (
          <p>{message}</p>
        ) : (
          <form onSubmit={submit}>
            {!tokenLoaded ? (
              <p>Loading your secure invitation…</p>
            ) : token ? (
              <p>Your secure invitation link has been recognised.</p>
            ) : (
              <>
                <label htmlFor="admin-invitation-token">Invitation token</label>
                <input
                  id="admin-invitation-token"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                  required
                />
                <small>Open the complete invitation link, or paste the token supplied by the Super Admin.</small>
              </>
            )}
            <label htmlFor="admin-full-name">Full name</label>
            <input
              id="admin-full-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
            <label htmlFor="admin-new-password">Password (12 characters minimum)</label>
            <div className="owner-password-field">
              <input
                id="admin-new-password"
                type={showPassword ? "text" : "password"}
                minLength={12}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="owner-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <label htmlFor="admin-confirm-password">Confirm password</label>
            <div className="owner-password-field">
              <input
                id="admin-confirm-password"
                type={showConfirm ? "text" : "password"}
                minLength={12}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
              <button
                type="button"
                className="owner-password-toggle"
                aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}
                aria-pressed={showConfirm}
                onClick={() => setShowConfirm((value) => !value)}
              >
                {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {message && <p className="owner-error" role="alert">{message}</p>}
            <button className="owner-primary" disabled={!tokenLoaded || !token.trim() || submitting}>
              {submitting ? "Creating account…" : "Create administrator account"}
            </button>
          </form>
        )}
        <small>Invitation links expire after 72 hours and can only be used once.</small>
        <Link href="/owner">Return to sign in</Link>
      </div>
    </main>
  );
}
