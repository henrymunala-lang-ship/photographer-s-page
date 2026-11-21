import { NextResponse } from "next/server";
import { readValues } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const keys = ["contact_email","contact_phone","contact_phone_secondary","contact_whatsapp","contact_website","contact_address","contact_instagram","contact_facebook","contact_tiktok","contact_hours","contact_visibility"] as const;
const approvedDefaults = {
  email: "henrymunala2@gmail.com",
  phone: "0711205316",
  phoneSecondary: "0713120290",
  whatsapp: "",
  website: "",
  address: "",
  instagram: "https://www.instagram.com/kynekenya/",
  facebook: "",
  tiktok: "",
  hours: "Monday–Friday: 8:00 AM–8:00 PM\nSaturday: 10:00 AM–6:00 PM\nSunday: Closed (EAT)",
  visibility: "public",
};
const noStore = { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };

function response(contact = approvedDefaults, source = "approved_public_defaults") {
  return NextResponse.json({ published: contact.visibility === "public", contact: contact.visibility === "public" ? contact : { ...approvedDefaults, email:"", phone:"", phoneSecondary:"", instagram:"", hours:"", visibility:"hidden" }, source }, { headers: noStore });
}

export async function GET() {
  try {
    const rows = await readValues("'13_SETTINGS'!A1:I1000");
    const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
    const scopeIndex = headers.indexOf("scope"), keyIndex = headers.indexOf("setting_key"), valueIndex = headers.indexOf("setting_value");
    if (scopeIndex < 0 || keyIndex < 0 || valueIndex < 0) return response();

    const values: Record<string,string> = {
      contact_email: approvedDefaults.email,
      contact_phone: approvedDefaults.phone,
      contact_phone_secondary: approvedDefaults.phoneSecondary,
      contact_whatsapp: approvedDefaults.whatsapp,
      contact_website: approvedDefaults.website,
      contact_address: approvedDefaults.address,
      contact_instagram: approvedDefaults.instagram,
      contact_facebook: approvedDefaults.facebook,
      contact_tiktok: approvedDefaults.tiktok,
      contact_hours: approvedDefaults.hours,
      contact_visibility: approvedDefaults.visibility,
    };
    for (const row of rows.slice(1)) {
      if (String(row[scopeIndex] ?? "") !== "platform") continue;
      const key = String(row[keyIndex] ?? "");
      if (keys.includes(key as typeof keys[number])) values[key] = String(row[valueIndex] ?? "");
    }
    const contact = {
      email: values.contact_email,
      phone: values.contact_phone,
      phoneSecondary: values.contact_phone_secondary,
      whatsapp: values.contact_whatsapp,
      website: values.contact_website,
      address: values.contact_address,
      instagram: values.contact_instagram,
      facebook: values.contact_facebook,
      tiktok: values.contact_tiktok,
      hours: values.contact_hours,
      visibility: values.contact_visibility,
    };
    return response(contact, "google_sheets_with_approved_defaults");
  } catch {
    // The owner explicitly approved these contact details for public display.
    // Keep the public page usable during a temporary Sheets read outage.
    return response();
  }
}
