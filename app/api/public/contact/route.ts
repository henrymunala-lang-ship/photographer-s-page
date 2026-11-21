import { NextResponse } from "next/server";
import { readValues } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const keys = ["contact_email","contact_phone","contact_whatsapp","contact_website","contact_address","contact_instagram","contact_facebook","contact_tiktok","contact_hours","contact_visibility"] as const;
const empty = { email:"", phone:"", whatsapp:"", website:"", address:"", instagram:"", facebook:"", tiktok:"", hours:"", visibility:"hidden" };
const noStore = { "Cache-Control":"public, max-age=60, stale-while-revalidate=300" };

export async function GET() {
  try {
    const rows = await readValues("'13_SETTINGS'!A1:I1000");
    const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
    const scopeIndex = headers.indexOf("scope"), keyIndex = headers.indexOf("setting_key"), valueIndex = headers.indexOf("setting_value");
    if (scopeIndex < 0 || keyIndex < 0 || valueIndex < 0) return NextResponse.json({ published:false, contact:empty }, { headers:noStore });
    const values: Record<string,string> = {};
    for (const row of rows.slice(1)) {
      if (String(row[scopeIndex] ?? "") !== "platform") continue;
      const key = String(row[keyIndex] ?? "");
      if (keys.includes(key as typeof keys[number])) values[key] = String(row[valueIndex] ?? "");
    }
    const published = values.contact_visibility === "public";
    if (!published) return NextResponse.json({ published:false, contact:empty }, { headers:noStore });
    return NextResponse.json({ published:true, contact:{
      email:values.contact_email ?? "", phone:values.contact_phone ?? "", whatsapp:values.contact_whatsapp ?? "",
      website:values.contact_website ?? "", address:values.contact_address ?? "", instagram:values.contact_instagram ?? "",
      facebook:values.contact_facebook ?? "", tiktok:values.contact_tiktok ?? "", hours:values.contact_hours ?? "", visibility:"public"
    } }, { headers:noStore });
  } catch {
    return NextResponse.json({ published:false, contact:empty }, { status:503, headers:noStore });
  }
}
