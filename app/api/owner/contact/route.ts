import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendRows, readValues, updateValues } from "@/lib/integrations/google-sheets/client";
import { appendAudit, can, currentAdmin } from "@/lib/owner/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = {
  email: "contact_email",
  phone: "contact_phone",
  phoneSecondary: "contact_phone_secondary",
  whatsapp: "contact_whatsapp",
  website: "contact_website",
  address: "contact_address",
  instagram: "contact_instagram",
  facebook: "contact_facebook",
  tiktok: "contact_tiktok",
  hours: "contact_hours",
  visibility: "contact_visibility",
} as const;
type ContactKey = keyof typeof FIELDS;
type Contact = Record<ContactKey, string>;
const defaults: Contact = { email: "henrymunala2@gmail.com", phone: "0711205316", phoneSecondary: "0713120290", whatsapp: "0705830142", website: "", address: "", instagram: "https://www.instagram.com/kynekenya/", facebook: "", tiktok: "", hours: "Monday–Friday: 8:00 AM–8:00 PM\nSaturday: 10:00 AM–6:00 PM\nSunday: Closed (EAT)", visibility: "public" };
const descriptions: Record<ContactKey, string> = {
  email: "Public platform contact email", phone: "Public platform phone number", phoneSecondary: "Second public platform phone number", whatsapp: "Public platform WhatsApp number",
  website: "Official platform website", address: "Public business address", instagram: "Official Instagram profile",
  facebook: "Official Facebook profile", tiktok: "Official TikTok profile", hours: "Public business hours and timezone",
  visibility: "Whether platform contact details are approved for public display",
};
const noStore = { "Cache-Control": "private, no-store" };

async function authorize() {
  const actor = await currentAdmin();
  return actor && can(actor, "contacts:manage") ? actor : null;
}

function validate(body: Record<string, unknown>): Contact | string {
  const result = { ...defaults };
  for (const key of Object.keys(FIELDS) as ContactKey[]) {
    const value = String(body[key] ?? "").trim();
    if (value.length > 500) return "Each contact field must be 500 characters or fewer.";
    result[key] = value;
  }
  if (result.email && !/^\S+@\S+\.\S+$/.test(result.email)) return "Enter a valid contact email address.";
  for (const key of ["website", "instagram", "facebook", "tiktok"] as const) {
    if (!result[key]) continue;
    try { const url = new URL(result[key]); if (url.protocol !== "https:" && url.protocol !== "http:") return "Contact links must use http or https."; }
    catch { return "Enter valid website and social profile URLs, including https://."; }
  }
  if (!["hidden", "public"].includes(result.visibility)) return "Choose a valid public visibility setting.";
  return result;
}

export async function GET() {
  const actor = await authorize();
  if (!actor) return NextResponse.json({ error: "Super Admin access required." }, { status: 403, headers: noStore });
  try {
    const rows = await readValues("'13_SETTINGS'!A1:I1000");
    const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
    const keyIndex = headers.indexOf("setting_key"), valueIndex = headers.indexOf("setting_value");
    if (keyIndex < 0 || valueIndex < 0 || headers.indexOf("scope") < 0) return NextResponse.json({ error: "The settings worksheet headers do not match the approved schema." }, { status: 502, headers: noStore });
    const contact = { ...defaults };
    for (const row of rows.slice(1)) {
      if (String(row[headers.indexOf("scope")] ?? "") !== "platform") continue;
      const key = (Object.keys(FIELDS) as ContactKey[]).find(item => FIELDS[item] === String(row[keyIndex] ?? ""));
      if (key) contact[key] = String(row[valueIndex] ?? "");
    }
    return NextResponse.json({ contact, source: "google_sheets", readOnly: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Contact settings could not be loaded from the private workbook." }, { status: 502, headers: noStore });
  }
}

export async function PUT(req: NextRequest) {
  const origin = req.headers.get("origin");
  let originMatches = false;
  try { originMatches = !!origin && new URL(origin).host === req.headers.get("host"); } catch { originMatches = false; }
  if (!originMatches || !req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "A same-origin JSON request is required." }, { status: 403, headers: noStore });
  }
  const actor = await authorize();
  if (!actor) return NextResponse.json({ error: "Super Admin access required." }, { status: 403, headers: noStore });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const validated = validate(body);
  if (typeof validated === "string") return NextResponse.json({ error: validated }, { status: 400, headers: noStore });
  try {
    const rows = await readValues("'13_SETTINGS'!A1:I1000");
    const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
    const required = ["setting_id", "scope", "photographer_id", "setting_key", "setting_value", "value_type", "description", "updated_by", "updated_at"];
    if (required.some(key => !headers.includes(key))) return NextResponse.json({ error: "The settings worksheet headers do not match the approved schema." }, { status: 502, headers: noStore });
    const index = Object.fromEntries(required.map(key => [key, headers.indexOf(key)])) as Record<string, number>;
    const now = new Date().toISOString(), pending: Array<Array<string>> = [];
    for (const key of Object.keys(FIELDS) as ContactKey[]) {
      const settingKey = FIELDS[key];
      const rowIndex = rows.findIndex((row, i) => i > 0 && String(row[index.scope] ?? "") === "platform" && String(row[index.setting_key] ?? "") === settingKey);
      if (rowIndex > 0) {
        const row = [...rows[rowIndex]];
        while (row.length < required.length) row.push("");
        row[index.setting_value] = validated[key];
        row[index.updated_by] = actor.adminId;
        row[index.updated_at] = now;
        await updateValues("'13_SETTINGS'!A" + (rowIndex + 1) + ":I" + (rowIndex + 1), [required.map(name => String(row[index[name]] ?? ""))]);
      } else {
        pending.push([ "set_" + randomUUID(), "platform", "", settingKey, validated[key], key === "visibility" ? "enum" : "text", descriptions[key], actor.adminId, now ]);
      }
    }
    if (pending.length) await appendRows("'13_SETTINGS'!A:I", pending);
    await appendAudit(actor, "platform.contact_settings.updated", "platform_contact_settings", "platform", { fields: Object.keys(FIELDS), visibility: validated.visibility });
    return NextResponse.json({ ok: true, contact: validated }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Some contact settings may not have been saved. Check the workbook before retrying; the operation is not transactional." }, { status: 502, headers: noStore });
  }
}
