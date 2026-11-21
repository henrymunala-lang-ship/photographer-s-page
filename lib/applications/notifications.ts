import "server-only";

type NotificationKind = "owner" | "applicant";

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

export async function sendApplicationNotification(input: {
  kind: NotificationKind;
  to: string;
  recipientName: string;
  subject: string;
  message: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !input.to) {
    console.warn("[application-notification] skipped: configuration missing", {
      kind: input.kind,
      apiKeyConfigured: Boolean(apiKey),
      recipientConfigured: Boolean(input.to)
    });
    return { state: "pending" as const, reason: "not_configured" as const };
  }

  // Resend's shared test sender can notify the verified account owner only.
  // Applicant-facing mail requires a sender on a verified custom domain.
  const from = input.kind === "owner"
    ? (process.env.RESEND_FROM_EMAIL || "Lens & Light <onboarding@resend.dev>")
    : process.env.RESEND_FROM_EMAIL;

  if (!from) return { state: "pending" as const, reason: "verified_sender_required" as const };

  const safeName = escapeHtml(input.recipientName || "there");
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br>");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: `Hello ${input.recipientName || "there"},\n\n${input.message}\n\nLens & Light`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#25231f"><p>Hello ${safeName},</p><p>${safeMessage}</p><p>Lens &amp; Light</p></div>`
      }),
      signal: AbortSignal.timeout(8000)
    });
    const responseText = await response.text();
    let result: { id?: string; name?: string; code?: string; message?: string } = {};
    try { result = JSON.parse(responseText) as typeof result; } catch { /* keep provider details private */ }
    if (!response.ok) {
      const providerCode = typeof result.name === "string" ? result.name
        : typeof result.code === "string" ? result.code : "unknown";
      console.warn("[application-notification] provider rejected request", {
        kind: input.kind,
        status: response.status,
        providerCode
      });
      return {
        state: "failed" as const,
        reason: "provider_rejected" as const,
        providerStatus: response.status,
        providerCode
      };
    }
    console.info("[application-notification] provider accepted request", {
      kind: input.kind,
      providerMessageId: result.id ?? null
    });
    return { state: "sent" as const, providerMessageId: result.id ?? null };
  } catch (error) {
    console.warn("[application-notification] provider request failed", {
      kind: input.kind,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    return { state: "failed" as const, reason: "provider_unavailable" as const };
  }
}
