import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPhotographerSession } from "@/lib/photographers/auth";
import { uploadPhotographerImage } from "@/lib/integrations/google-drive/client";
import { readValues, batchUpdateValues, appendRows } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = ["photo_id","photographer_id","album_id","title","caption","image_preview_url","alt_text","category","sort_order","featured","publish_state"] as const;
type Row = string[];

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
function safeImageUrl(input: string): string {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:") return "";
    if (url.hostname === "drive.google.com" && url.pathname === "/uc") {
      const fileId = url.searchParams.get("id");
      if (!fileId) return "";
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
    }
    return url.toString();
  } catch {
    return "";
  }
}
function value(row: Row, headers: string[], key: string) {
  const index = headers.indexOf(key);
  return index < 0 ? "" : String(row[index] ?? "").trim();
}
function columnLetter(index: number) {
  let value = index + 1, result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
function rowWrites(headers: string[], rowNumber: number, fields: Record<string,string>) {
  return Object.entries(fields).map(([key,value]) => {
    const index = headers.indexOf(key);
    if (index < 0) throw new Error("Gallery worksheet schema changed.");
    return { range: `'04_GALLERY'!${columnLetter(index)}${rowNumber}`, values: [[value]] };
  });
}
async function verifiedSession(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return { error: noStore({ error: "Photographer gallery editing is restricted to Preview deployments." }, 404) };
  const session = await getPhotographerSession(request);
  if (!session) return { error: noStore({ error: "Photographer sign-in is required." }, 401) };
  const photographers = await readValues("'02_PHOTOGRAPHERS'!A1:P2001");
  const photographerHeaders = (photographers[0] ?? []).map(item => String(item ?? "").trim());
  const expected = ["photographer_id","auth_user_id","registration_id","public_name","email","phone","bio","primary_location","categories","profile_image_url","hero_image_url","status","publish_state","membership_tier","created_at","updated_at"];
  if (photographerHeaders.length !== expected.length || expected.some((header,index) => photographerHeaders[index] !== header)) throw new Error("Photographer worksheet schema changed.");
  const matches = photographers.slice(1).map((row,index)=>({row,rowNumber:index+2})).filter(item=>String(item.row[0] ?? "").trim()===session.record.id);
  if (matches.length !== 1) return { error: noStore({ error: "Your photographer record could not be uniquely verified." }, 409) };
  const row = matches[0].row;
  if (String(row[1] ?? "").trim() !== session.accountId || String(row[4] ?? "").trim().toLowerCase() !== session.email.toLowerCase() || String(row[11] ?? "").trim().toUpperCase() !== "APPROVED") {
    return { error: noStore({ error: "Your account is no longer linked to an approved photographer profile." }, 409) };
  }
  return { session };
}
async function galleryTable() {
  const rows = await readValues("'04_GALLERY'!A1:Z1001");
  const headers = (rows[0] ?? []).map(item => String(item ?? "").trim());
  if (REQUIRED.some(header => !headers.includes(header))) throw new Error("Gallery worksheet schema changed.");
  return { headers, rows: rows.slice(1) };
}
function audit(session: NonNullable<Awaited<ReturnType<typeof getPhotographerSession>>>, action: string, photoId: string, metadata: Record<string,unknown>) {
  return appendRows("'14_AUDIT_LOG'!A:I", [[
    "audit_" + randomBytes(12).toString("hex"), "photographer", session.accountId,
    action, "gallery_photo", photoId, JSON.stringify(metadata), "", new Date().toISOString()
  ]]);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifiedSession(request);
    if ("error" in auth) return auth.error;
    const { headers, rows } = await galleryTable();
    const gallery = rows.map((row,index)=>({row,rowNumber:index+2}))
      .filter(item=>value(item.row,headers,"photographer_id")===auth.session.record.id)
      .filter(item=>value(item.row,headers,"publish_state").toUpperCase()==="PUBLISHED")
      .map(item=>({
        id:value(item.row,headers,"photo_id"),
        title:value(item.row,headers,"title"),
        caption:value(item.row,headers,"caption"),
        imageUrl:safeImageUrl(value(item.row,headers,"image_preview_url")),
        altText:value(item.row,headers,"alt_text"),
        category:value(item.row,headers,"category"),
        sortOrder:Number(value(item.row,headers,"sort_order"))||0
      })).filter(item=>item.id&&item.imageUrl).sort((a,b)=>a.sortOrder-b.sortOrder);
    return noStore({gallery});
  } catch {
    return noStore({error:"Your portfolio gallery could not be loaded. Check the gallery worksheet setup or try again."},503);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return noStore({error:"Invalid request origin."},403);
    const auth = await verifiedSession(request);
    if ("error" in auth) return auth.error;
    if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) return noStore({error:"Choose an image to add to your portfolio."},400);
    const form = await request.formData();
    const image = form.get("image");
    const title = typeof form.get("title")==="string" ? String(form.get("title")).trim() : "";
    const caption = typeof form.get("caption")==="string" ? String(form.get("caption")).trim() : "";
    const altText = typeof form.get("altText")==="string" ? String(form.get("altText")).trim() : "";
    const category = typeof form.get("category")==="string" ? String(form.get("category")).trim() : "";
    if (!(image instanceof File) || image.size<1 || image.size>8*1024*1024 || !["image/jpeg","image/png","image/webp"].includes(image.type)) return noStore({error:"Choose a JPG, PNG or WebP image up to 8 MB."},400);
    if (title.length>120 || caption.length>500 || altText.length>240 || category.length>80) return noStore({error:"Please shorten the title, caption or category."},400);
    const {headers,rows}=await galleryTable();
    const photographerId=auth.session.record.id;
    const existing=rows.map((row,index)=>({row,rowNumber:index+2})).filter(item=>value(item.row,headers,"photographer_id")===photographerId);
    const empty=rows.findIndex(row=>!row.some(cell=>String(cell??"").trim()));
    const rowNumber=empty>=0?empty+2:rows.length+2;
    if(rowNumber>1001)return noStore({error:"Your portfolio has reached its current storage limit. Contact Lens & Light for assistance."},409);
    const photoId="photo_"+randomBytes(12).toString("hex");
    const uploaded=await uploadPhotographerImage(image,photographerId,"gallery");
    const sortOrder=existing.reduce((max,item)=>Math.max(max,Number(value(item.row,headers,"sort_order"))||0),0)+1;
    const fields={
      photo_id:photoId,photographer_id:photographerId,album_id:"",title,caption,
      image_preview_url:uploaded.url,alt_text:altText||title||"Portfolio photograph",
      category,sort_order:String(sortOrder),featured:"FALSE",publish_state:"PUBLISHED"
    };
    await batchUpdateValues(rowWrites(headers,rowNumber,fields));
    await audit(auth.session,"photographer.gallery_photo.added",photoId,{storage:"google_drive",fileId:uploaded.fileId,category});
    return noStore({ok:true,photo:{id:photoId,title,caption,imageUrl:safeImageUrl(uploaded.url),altText:fields.alt_text,category,sortOrder}});
  } catch {
    return noStore({error:"Your portfolio image could not be saved. Your existing gallery has not been changed."},503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if(!sameOrigin(request))return noStore({error:"Invalid request origin."},403);
    const auth=await verifiedSession(request);
    if("error" in auth)return auth.error;
    if(!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data"))return noStore({error:"Invalid edit request."},415);
    const form=await request.formData();
    const photoId=String(form.get("photoId")??"").trim();
    const title=String(form.get("title")??"").trim(),caption=String(form.get("caption")??"").trim();
    const altText=String(form.get("altText")??"").trim(),category=String(form.get("category")??"").trim();
    const image=form.get("image");
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(photoId)||title.length>120||caption.length>500||altText.length>240||category.length>80)return noStore({error:"Please check the photo and shorten its details if needed."},400);
    if(image!==null&&(!(image instanceof File)||image.size<1||image.size>8*1024*1024||!["image/jpeg","image/png","image/webp"].includes(image.type)))return noStore({error:"Choose a JPG, PNG or WebP image up to 8 MB."},400);
    const {headers,rows}=await galleryTable();
    const matches=rows.map((row,index)=>({row,rowNumber:index+2})).filter(x=>value(x.row,headers,"photo_id")===photoId&&value(x.row,headers,"photographer_id")===auth.session.record.id&&value(x.row,headers,"publish_state").toUpperCase()==="PUBLISHED");
    if(matches.length!==1)return noStore({error:"That published portfolio photograph could not be found."},404);
    const match=matches[0];
    let imageUrl=value(match.row,headers,"image_preview_url"),fileId="";
    if(image instanceof File){const uploaded=await uploadPhotographerImage(image,auth.session.record.id,"gallery");imageUrl=uploaded.url;fileId=uploaded.fileId;}
    await batchUpdateValues(rowWrites(headers,match.rowNumber,{title,caption,alt_text:altText||title||"Portfolio photograph",category,image_preview_url:imageUrl}));
    await audit(auth.session,"photographer.gallery_photo.edited",photoId,{imageReplaced:!!fileId,fileId,category});
    return noStore({ok:true,photo:{id:photoId,title,caption,imageUrl:safeImageUrl(imageUrl),altText:altText||title||"Portfolio photograph",category,sortOrder:Number(value(match.row,headers,"sort_order"))||0}});
  }catch{return noStore({error:"Your portfolio edit could not be saved. The existing photograph remains unchanged."},503);}
}

export async function PATCH(request: NextRequest) {
  try {
    if(!sameOrigin(request))return noStore({error:"Invalid request origin."},403);
    const auth=await verifiedSession(request);
    if("error" in auth)return auth.error;
    if(!request.headers.get("content-type")?.toLowerCase().includes("application/json"))return noStore({error:"Invalid request."},403);
    const payload=await request.json();
    const photoId=typeof payload?.photoId==="string"?payload.photoId:"";
    const sortOrder=Number(payload?.sortOrder);
    if(!photoId||!Number.isInteger(sortOrder)||sortOrder<1||sortOrder>1000)return noStore({error:"Invalid portfolio item or order."},400);
    const {headers,rows}=await galleryTable();
    const matches=rows.map((row,index)=>({row,rowNumber:index+2})).filter(item=>value(item.row,headers,"photo_id")===photoId&&value(item.row,headers,"photographer_id")===auth.session.record.id&&value(item.row,headers,"publish_state").toUpperCase()==="PUBLISHED");
    if(matches.length!==1)return noStore({error:"That portfolio photograph could not be found in your gallery."},404);
    await batchUpdateValues(rowWrites(headers,matches[0].rowNumber,{sort_order:String(sortOrder)}));
    await audit(auth.session,"photographer.gallery_photo.reordered",photoId,{sortOrder});
    return noStore({ok:true});
  }catch{return noStore({error:"The portfolio order could not be saved."},503);}
}

export async function DELETE(request: NextRequest) {
  try {
    if(!sameOrigin(request)||!request.headers.get("content-type")?.toLowerCase().includes("application/json"))return noStore({error:"Invalid request."},403);
    const auth=await verifiedSession(request);
    if("error" in auth)return auth.error;
    const payload=await request.json();
    const photoId=typeof payload?.photoId==="string"?payload.photoId:"";
    if(!photoId)return noStore({error:"Choose a portfolio photograph to remove."},400);
    const {headers,rows}=await galleryTable();
    const matches=rows.map((row,index)=>({row,rowNumber:index+2})).filter(item=>value(item.row,headers,"photo_id")===photoId&&value(item.row,headers,"photographer_id")===auth.session.record.id&&value(item.row,headers,"publish_state").toUpperCase()==="PUBLISHED");
    if(matches.length!==1)return noStore({error:"That portfolio photograph could not be found in your gallery."},404);
    await batchUpdateValues(rowWrites(headers,matches[0].rowNumber,{publish_state:"UNPUBLISHED"}));
    await audit(auth.session,"photographer.gallery_photo.removed",photoId,{storageFileRetained:true});
    return noStore({ok:true});
  }catch{return noStore({error:"The portfolio photograph could not be removed. Please try again."},503);}
}
