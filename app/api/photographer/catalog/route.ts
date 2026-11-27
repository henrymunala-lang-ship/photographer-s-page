import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPhotographerSession } from "@/lib/photographers/auth";
import { readValues, batchUpdateValues, appendRows } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
function cell(row: string[], headers: string[], key: string) {
  const index = headers.indexOf(key);
  return index < 0 ? "" : String(row[index] ?? "").trim();
}
function required(headers: string[], keys: string[]) {
  return keys.every(key => headers.includes(key));
}
function col(index: number) {
  let n = index + 1, result = "";
  while (n) { const rem = (n - 1) % 26; result = String.fromCharCode(65 + rem) + result; n = Math.floor((n - 1) / 26); }
  return result;
}
function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function list(value: unknown) { return Array.isArray(value) ? value : []; }

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return reply({ error: "Photographer editing is restricted to Preview deployments." }, 404);
  try {
    const session = await getPhotographerSession(request);
    if (!session) return reply({ error: "Photographer sign-in is required." }, 401);
    const [serviceRows, areaRows] = await Promise.all([
      readValues("'05_SERVICES'!A1:Z1001"),
      readValues("'15_PHOTOGRAPHER_SERVICE_AREAS'!A1:Z1001")
    ]);
    const sh = (serviceRows[0] ?? []).map(v => String(v ?? "").trim());
    const ah = (areaRows[0] ?? []).map(v => String(v ?? "").trim());
    if (!required(sh, ["service_id","photographer_id","name","description","price_amount","currency","publish_state","sort_order"]) ||
        !required(ah, ["service_area_id","photographer_id","place_name","county_region","country","active"])) {
      return reply({ error: "The services or service-areas worksheet needs administrator attention." }, 503);
    }
    const services = serviceRows.slice(1).filter(r => cell(r, sh, "photographer_id") === session.photographerId)
      .filter(r => cell(r, sh, "publish_state").toUpperCase() !== "UNPUBLISHED")
      .map(r => ({ id: cell(r, sh, "service_id"), name: cell(r, sh, "name"), description: cell(r, sh, "description"),
        priceAmount: cell(r, sh, "price_amount"), currency: cell(r, sh, "currency"), publishState: cell(r, sh, "publish_state") }));
    const serviceAreas = areaRows.slice(1).filter(r => cell(r, ah, "photographer_id") === session.photographerId)
      .filter(r => ["TRUE","1","YES","ACTIVE"].includes(cell(r, ah, "active").toUpperCase()))
      .map(r => ({ id: cell(r, ah, "service_area_id"), placeName: cell(r, ah, "place_name"),
        countyRegion: cell(r, ah, "county_region"), country: cell(r, ah, "country") }));
    return reply({ services, serviceAreas });
  } catch {
    return reply({ error: "Your services and service areas could not be loaded." }, 503);
  }
}

export async function PUT(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return reply({ error: "Photographer editing is restricted to Preview deployments." }, 404);
  if (!sameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) return reply({ error: "Invalid request." }, 403);
  try {
    const session = await getPhotographerSession(request);
    if (!session) return reply({ error: "Photographer sign-in is required." }, 401);
    const payload = await request.json();
    const servicesIn = list(payload?.services), areasIn = list(payload?.serviceAreas);
    if (servicesIn.length > 30 || areasIn.length > 50) return reply({ error: "You can list up to 30 services and 50 service areas." }, 400);

    const [serviceRows, areaRows] = await Promise.all([
      readValues("'05_SERVICES'!A1:Z1001"),
      readValues("'15_PHOTOGRAPHER_SERVICE_AREAS'!A1:Z1001")
    ]);
    const sh = (serviceRows[0] ?? []).map(v => String(v ?? "").trim());
    const ah = (areaRows[0] ?? []).map(v => String(v ?? "").trim());
    const serviceRequired = ["service_id","photographer_id","name","description","price_amount","currency","publish_state","sort_order"];
    const areaRequired = ["service_area_id","photographer_id","place_name","county_region","country","active"];
    if (!required(sh, serviceRequired) || !required(ah, areaRequired)) return reply({ error: "The services or service-areas worksheet schema has changed. Ask an administrator to review it." }, 409);

    const existingServices = serviceRows.slice(1).map((row, i) => ({ row, rowNumber: i + 2 }))
      .filter(x => cell(x.row, sh, "photographer_id") === session.photographerId);
    const existingAreas = areaRows.slice(1).map((row, i) => ({ row, rowNumber: i + 2 }))
      .filter(x => cell(x.row, ah, "photographer_id") === session.photographerId);
    const serviceById = new Map(existingServices.map(x => [cell(x.row, sh, "service_id"), x]));
    const areaById = new Map(existingAreas.map(x => [cell(x.row, ah, "service_area_id"), x]));
    const seenServices = new Set<string>(), seenAreas = new Set<string>();
    const updates: Array<{ range: string; values: Array<Array<string>> }> = [];
    const newServices: string[][] = [], newAreas: string[][] = [];
    const changed: string[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < servicesIn.length; i++) {
      const item = servicesIn[i];
      const id = text(item?.id, 128);
      const name = text(item?.name, 120), description = text(item?.description, 1000);
      const priceRaw = item?.priceAmount === "" || item?.priceAmount == null ? "" : String(item.priceAmount).trim();
      const currency = text(item?.currency, 8).toUpperCase();
      if (!name || (priceRaw && (!/^\\d+(?:\\.\\d{1,2})?$/.test(priceRaw) || !Number.isFinite(Number(priceRaw)) || Number(priceRaw) < 0)) ||
          (priceRaw && !currency) || (!priceRaw && currency)) return reply({ error: "Each service needs a name. Enter a valid non-negative price and currency together, or leave both blank." }, 400);
      if (id && (!serviceById.has(id) || seenServices.has(id))) return reply({ error: "A service record could not be verified. Refresh and try again." }, 409);
      const serviceId = id || "svc_" + randomBytes(12).toString("hex");
      seenServices.add(serviceId);
      const record = { service_id: serviceId, photographer_id: session.photographerId, name, description,
        price_amount: priceRaw, currency, publish_state: "PUBLISHED", sort_order: String(i + 1) };
      if (id) {
        const current = serviceById.get(id)!;
        for (const key of serviceRequired) {
          const value = record[key as keyof typeof record] ?? cell(current.row, sh, key);
          if (cell(current.row, sh, key) !== value) updates.push({ range: `'05_SERVICES'!${col(sh.indexOf(key))}${current.rowNumber}`, values: [[value]] });
        }
      } else {
        newServices.push(sh.map(key => record[key as keyof typeof record] ?? ""));
      }
    }
    for (const existing of existingServices) {
      const id = cell(existing.row, sh, "service_id");
      if (id && !seenServices.has(id) && cell(existing.row, sh, "publish_state").toUpperCase() !== "UNPUBLISHED") {
        updates.push({ range: `'05_SERVICES'!${col(sh.indexOf("publish_state"))}${existing.rowNumber}`, values: [["UNPUBLISHED"]] });
      }
    }

    for (const item of areasIn) {
      const id = text(item?.id, 128);
      const placeName = text(item?.placeName, 120), countyRegion = text(item?.countyRegion, 120), country = text(item?.country, 80);
      if (!placeName || !country) return reply({ error: "Each service area needs at least a town or place and a country. County or region is optional." }, 400);
      if (id && (!areaById.has(id) || seenAreas.has(id))) return reply({ error: "A service-area record could not be verified. Refresh and try again." }, 409);
      const areaId = id || "area_" + randomBytes(12).toString("hex");
      seenAreas.add(areaId);
      const record = { service_area_id: areaId, photographer_id: session.photographerId, place_name: placeName,
        county_region: countyRegion, country, active: "TRUE" };
      if (id) {
        const current = areaById.get(id)!;
        for (const key of areaRequired) {
          const value = record[key as keyof typeof record] ?? cell(current.row, ah, key);
          if (cell(current.row, ah, key) !== value) updates.push({ range: `'15_PHOTOGRAPHER_SERVICE_AREAS'!${col(ah.indexOf(key))}${current.rowNumber}`, values: [[value]] });
        }
      } else {
        newAreas.push(ah.map(key => record[key as keyof typeof record] ?? ""));
      }
    }
    for (const existing of existingAreas) {
      const id = cell(existing.row, ah, "service_area_id");
      if (id && !seenAreas.has(id) && ["TRUE","1","YES","ACTIVE"].includes(cell(existing.row, ah, "active").toUpperCase())) {
        updates.push({ range: `'15_PHOTOGRAPHER_SERVICE_AREAS'!${col(ah.indexOf("active"))}${existing.rowNumber}`, values: [["FALSE"]] });
      }
    }
    if (updates.length) await batchUpdateValues(updates);
    if (newServices.length) await appendRows("'05_SERVICES'!A:Z", newServices);
    if (newAreas.length) await appendRows("'15_PHOTOGRAPHER_SERVICE_AREAS'!A:Z", newAreas);
    changed.push(...(updates.length || newServices.length ? ["services"] : []), ...(newAreas.length || updates.some(x => x.range.startsWith("'15_PHOTOGRAPHER_SERVICE_AREAS'")) ? ["serviceAreas"] : []));
    return reply({ ok: true, changed, servicesSaved: servicesIn.length, serviceAreasSaved: areasIn.length });
  } catch {
    return reply({ error: "Your services and service areas could not be saved. Refresh before retrying." }, 503);
  }
}
