"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Camera, Send, ShieldCheck } from "lucide-react";
import { PageSkeleton } from "@/components/page-skeleton";

type Message = {
  message_id: string;
  sender_type: "applicant" | "admin" | "system";
  body: string;
  delivery_state: string;
  created_at: string;
};

export default function ApplicationUpdatesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("Checking your private application access…");
  const [ready, setReady] = useState(false);

  const loadMessages = useCallback(async () => {
    const response = await fetch("/api/public/applications/messages", { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 ? "Your access link has expired. Please use a current link from your application email." : "Your conversation could not be loaded.");
    const data = await response.json();
    setMessages(Array.isArray(data.messages) ? data.messages : []);
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const token = fragment.get("access");
        if (token) {
          const response = await fetch("/api/public/applications/access", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token })
          });
          if (!response.ok) throw new Error("This application access link is invalid, expired or has been revoked.");
          window.history.replaceState(null, "", window.location.pathname);
        }
        await loadMessages();
        if (active) {
          setReady(true);
          setNotice("");
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "Applicant access could not be verified.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [loadMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = body.trim();
    if (!value || sending) return;
    setSending(true);
    setNotice("");
    try {
      const response = await fetch("/api/public/applications/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your message could not be saved.");
      setBody("");
      await loadMessages();
      setNotice(data.notification === "sent"
        ? "Your reply has been saved. The email provider accepted the owner notification."
        : data.notificationReason === "verified_sender_required"
          ? "Your reply has been saved. Owner email notifications need a configured sender."
          : data.notificationReason === "not_configured"
            ? "Your reply has been saved, but email notifications are not configured."
            : "Your reply has been saved, but the owner email notification could not be sent. The team can still read your message here.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your message could not be saved.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2ec", color: "#25231f", padding: "32px 18px 64px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 52 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "inherit", textDecoration: "none", letterSpacing: ".12em", fontSize: 13, fontWeight: 700 }}>
            <Camera size={20} /> LENS & LIGHT
          </Link>
          <Link href="/" style={{ color: "inherit", fontSize: 13 }}>Back to website</Link>
        </header>

        <p style={{ fontSize: 11, letterSpacing: ".18em", fontWeight: 700, color: "#777064" }}>PRIVATE APPLICANT SPACE</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(34px, 7vw, 54px)", lineHeight: 1.08, margin: "14px 0" }}>Your application,<br /><em>one conversation.</em></h1>
        <p style={{ maxWidth: 570, color: "#6d685f", lineHeight: 1.7 }}>Use this private space to follow up on your photographer application and reply if our verification team asks for more information.</p>

        <section style={{ marginTop: 34, padding: 22, border: "1px solid #ddd7cc", background: "#fffdf9", borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", marginBottom: 18 }}>
            <ShieldCheck size={17} /> PRIVATE APPLICATION CONVERSATION
          </div>
          {loading ? <p style={{ color: "#6d685f" }}>{notice}</p> : !ready ? (
            <div role="status" style={{ color: "#6d685f", lineHeight: 1.7 }}>{notice}<p>Open the latest private access link sent for your application. For your protection, this page does not ask you to sign in with Google.</p></div>
          ) : (
            <>
              <section style={{ padding: 16, marginBottom: 24, background: "#f8f6f1", border: "1px solid #e4ded3", borderRadius: 6 }}>
                <h2 style={{ margin: "0 0 8px", fontFamily: "Georgia, serif", fontSize: 23, fontWeight: 400 }}>Create your photographer sign-in</h2>
                <p style={{ margin: "0 0 12px", color: "#6d685f", fontSize: 13, lineHeight: 1.6 }}>Use this verified private application link to create your password. This does not approve your application or publish your profile.</p>
                <Link href="/application/create-account" style={{ display: "inline-block", padding: "11px 15px", background: "#282722", color: "white", borderRadius: 4, textDecoration: "none", fontSize: 13 }}>Create sign-in account</Link>
              </section>
              <div aria-live="polite" style={{ display: "grid", gap: 12, marginBottom: 24 }}>
                {messages.length === 0 ? <p style={{ color: "#777064" }}>Your conversation will appear here when a message is added.</p> : messages.map((message) => (
                  <article key={message.message_id} style={{ maxWidth: "88%", justifySelf: message.sender_type === "applicant" ? "end" : "start", background: message.sender_type === "applicant" ? "#eee9df" : "#f8f6f1", padding: 14, borderRadius: 7 }}>
                    <p style={{ margin: "0 0 7px", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#777064" }}>{message.sender_type === "applicant" ? "You" : message.sender_type === "admin" ? "Lens & Light team" : "Application update"}</p>
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>{message.body}</p>
                    <p style={{ fontSize: 10, color: "#8a8479", margin: "9px 0 0" }}>{new Date(message.created_at).toLocaleString()}</p>
                    {message.sender_type === "applicant" && (
                      <p style={{ fontSize: 10, color: message.delivery_state === "sent" ? "#52704f" : "#8a6b45", margin: "5px 0 0" }}>
                        {message.delivery_state === "sent"
                          ? "Owner email accepted by notification provider"
                          : message.delivery_state === "failed"
                            ? "Owner email notification failed — your reply is still saved"
                            : message.delivery_state === "pending"
                              ? "Owner email notification pending — your reply is still saved"
                              : "Email notification status unavailable"}
                      </p>
                    )}
                  </article>
                ))}
              </div>
              <form onSubmit={sendMessage} style={{ display: "grid", gap: 10 }}>
                <label htmlFor="application-reply" style={{ fontSize: 12, fontWeight: 700 }}>Write a reply</label>
                <textarea id="application-reply" value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} rows={4} required placeholder="Type your message…" style={{ width: "100%", boxSizing: "border-box", padding: 13, border: "1px solid #d7d0c4", borderRadius: 5, font: "inherit", resize: "vertical", background: "#fff" }} />
                <button disabled={sending || !body.trim()} type="submit" style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 17px", background: "#282722", color: "white", border: 0, borderRadius: 4, cursor: "pointer" }}>
                  {sending ? "Saving…" : "Send reply"} <Send size={14} />
                </button>
              </form>
            </>
          )}
          {notice && !loading && <p role="status" style={{ color: "#6d685f", lineHeight: 1.6, marginTop: 16 }}>{notice}</p>}
        </section>
        <p style={{ marginTop: 18, fontSize: 11, color: "#7a7469", lineHeight: 1.6 }}>Keep this access link private. It is tied to one application and can expire or be revoked. Messages are saved securely in this private conversation. Email notifications are a separate service and may not always be available.</p>
      </div>
    </main>
  );
}
