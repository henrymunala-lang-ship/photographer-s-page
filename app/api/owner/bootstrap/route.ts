import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendRows, readValues, updateValues } from "@/lib/integrations/google-sheets/client";
import { hashPassword, getAdmins } from "@/lib/owner/admin-auth";

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
    return noStore({ error: "Administrator setup and recovery are restricted to Preview deployments." }, 404);
  }
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return noStore({ error: "Invalid request." }, 403);
  }

  try {
    const body = await request.json().catch(() => ({})) as {
      setupKey?: string;
      password?: string;
      confirmPassword?: string;
      fullName?: string;
    };
    const key = process.env.GOOGLE_OAUTH_SETUP_KEY ?? "";
    const submitted = String(body.setupKey ?? "");
    const expected = Buffer.from(key);
    const actual = Buffer.from(submitted);

    if (key.length < 32 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return noStore({ error: "The one-time setup or recovery key is incorrect." }, 401);
    }

    const email = (process.env.GOOGLE_OAUTH_OWNER_EMAIL ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.fullName ?? "").trim();
    if (!email || password.length < 12 || password.length > 128 ||
        password !== String(body.confirmPassword ?? "") || fullName.length > 120) {
      return noStore({ error: "Use the configured owner email and matching password of at least 12 characters." }, 400);
    }

    const admins = await getAdmins();
    const existing = admins.find(item =>
      item.email?.toLowerCase() === email && item.status === "active" && item.role === "super_admin"
    );
    const adminId = existing?.admin_id ?? "adm_" + randomUUID();
    const name = fullName || existing?.full_name || "Workspace Owner";
    const hash = await hashPassword(password);
    const now = new Date().toISOString();

    const settings = await readValues("'13_SETTINGS'!A1:I1000");
    const header = settings[0] ?? [];
    const keyIndex = header.indexOf("setting_key");
    const rowIndex = settings.findIndex((row, index) =>
      index > 0 && row[1] === "admin_auth" && row[keyIndex] === "password_hash:" + adminId
    );

    if (rowIndex > 0) {
      await updateValues("'13_SETTINGS'!E" + (rowIndex + 1) + ":E" + (rowIndex + 1), [[hash]]);
    } else {
      await appendRows("'13_SETTINGS'!A:I", [[
        "set_" + randomUUID(), "admin_auth", "", "password_hash:" + adminId, hash,
        "secret_hash", "Scrypt password hash for administrator authentication", adminId, now
      ]]);
    }

    if (!existing) {
      await appendRows("'03_ADMINS'!A:H", [[adminId, "", email, name, "super_admin", "active", "", now]]);
    }

    await appendRows("'14_AUDIT_LOG'!A:I", [[
      "audit_" + randomUUID(), "system", adminId,
      existing ? "super_admin.password_recovered" : "super_admin.bootstrap",
      "administrator", adminId, JSON.stringify({ email }), "", now
    ]]);

    return noStore({
      ok: true,
      message: existing
        ? "Super Admin password updated. Sign in with your configured owner email and the new password."
        : "Super Admin account created. Sign in with your configured owner email and the password you just chose."
    });
  } catch {
    return noStore({ error: "Administrator setup or recovery is temporarily unavailable." }, 503);
  }
}
