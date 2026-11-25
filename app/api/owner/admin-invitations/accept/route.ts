import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendRows, readValues, updateValues } from "@/lib/integrations/google-sheets/client";
import { hashPassword } from "@/lib/owner/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
  });
}

export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return noStore({ error: "Administrator invitations are restricted to Preview deployments." }, 404);
  }
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return noStore({ error: "Invalid request." }, 403);
  }

  try {
    const body = await request.json().catch(() => ({})) as {
      token?: string;
      password?: string;
      confirmPassword?: string;
      fullName?: string;
    };
    const token = String(body.token ?? "");
    const password = String(body.password ?? "");
    const fullName = String(body.fullName ?? "").trim();

    if (token.length < 32 || token.length > 256 || password.length < 12 || password.length > 128 ||
        password !== String(body.confirmPassword ?? "") || fullName.length > 120) {
      return noStore({ error: "Invitation token or password details are invalid." }, 400);
    }

    const digest = createHash("sha256").update(token).digest("hex");
    const rows = await readValues("'21_ADMIN_INVITATIONS'!A1:H501");
    const header = rows[0] ?? [];
    const idx = (key: string) => header.indexOf(key);
    const row = rows.slice(1).find(item => item[idx("token_hash")] === digest);

    if (!row || row[idx("status")] !== "pending" || !row[idx("expiry")] ||
        new Date(row[idx("expiry")]).getTime() < Date.now()) {
      return noStore({ error: "This invitation is invalid, expired or already used." }, 410);
    }

    const email = String(row[idx("email")] ?? "").trim().toLowerCase();
    const role = String(row[idx("role")] ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email) ||
        !["verification_admin", "content_admin", "support_admin"].includes(role)) {
      return noStore({ error: "Invitation details are invalid." }, 400);
    }

    const admins = await readValues("'03_ADMINS'!A2:H501");
    if (admins.some(item => String(item[2] ?? "").toLowerCase() === email && item[5] === "active")) {
      return noStore({ error: "An active administrator already exists for this email." }, 409);
    }

    const adminId = "adm_" + randomUUID();
    const now = new Date().toISOString();
    const hash = await hashPassword(password);

    await appendRows("'13_SETTINGS'!A:I", [[
      "set_" + randomUUID(), "admin_auth", "", "password_hash:" + adminId, hash,
      "secret_hash", "Scrypt password hash for administrator authentication", adminId, now
    ]]);
    await appendRows("'03_ADMINS'!A:H", [[
      adminId, "", email, fullName || email, role,
      "active", row[idx("invited_by_admin_id")] ?? "", now
    ]]);

    const sheetRow = rows.findIndex(item => item[idx("token_hash")] === digest) + 1;
    await updateValues("'21_ADMIN_INVITATIONS'!G" + (sheetRow + 1) + ":H" + (sheetRow + 1), [[now, "accepted"]]);
    await appendRows("'14_AUDIT_LOG'!A:I", [[
      "audit_" + randomUUID(), "system", adminId, "admin.invitation_accepted",
      "administrator_invitation", row[0], JSON.stringify({ email, role }), "", now
    ]]);

    return noStore({ ok: true, message: "Administrator account created. You can now sign in." });
  } catch {
    return noStore({ error: "Administrator account setup is temporarily unavailable. Ask the Super Admin to check the invitation before retrying." }, 503);
  }
}
