import "server-only";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character] ?? character));
}

export async function sendClientEnquiryEmail(input: {
  to: string;
  subject: string;
  greeting: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from || !input.to) {
    return { state: "pending" as const, reason: !apiKey ? "provider_not_configured" as const : "verified_sender_required" as const };
  }
  const safeGreeting = escapeHtml(input.greeting || "there");
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br>");
  const safeAction = escapeHtml(input.actionLabel);
  const safeUrl = escapeHtml(input.actionUrl);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: `Hello ${input.greeting || "there"},\n\n${input.message}\n\n${input.actionLabel}: ${input.actionUrl}\n\nLens & Light`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#292821;max-width:600px;margin:auto"><p>Hello ${safeGreeting},</p><p>${safeMessage}</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#292821;color:#fff;text-decoration:none;border-radius:4px">${safeAction}</a></p><p style="color:#777064;font-size:12px">Lens &amp; Light · Private client communication</p></div>`
      }),
      signal: AbortSignal.timeout(8000)
    });
    const body = await response.text();
    let result: { id?: string; name?: string; code?: string } = {};
    try { result = JSON.parse(body) as typeof result; } catch { /* provider response intentionally omitted */ }
    if (!response.ok) {
      return { state: "failed" as const, reason: "provider_rejected" as const, providerStatus: response.status, providerCode: result.name || result.code || "unknown" };
    }
    return { state: "sent" as const, providerMessageId: result.id ?? null };
  } catch (error) {
    return { state: "failed" as const, reason: error instanceof Error ? error.name : "provider_unavailable" };
  }
}
