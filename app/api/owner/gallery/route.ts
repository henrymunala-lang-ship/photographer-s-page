import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { can, currentAdmin, appendAudit } from "@/lib/owner/admin-auth";
import { readValues, batchUpdateValues } from "@/lib/integrations/google-sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const REQUIRED = ["photo_id","photographer_id","album_id","title","caption","image_preview_url","alt_text","category","sort_order","featured","publish_state"] as const;
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } }); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
function col(index: number) { let n=index+1,s=""; while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s; }
function cell(row:string[], headers:string[], key:string) { const i=headers.indexOf(key); return i<0?"":String(row[i]??"").trim(); }
async function table() {
  const values=await readValues("'04_GALLERY'!A1:Z1001");
  const headers=(values[0]??[]).map(v=>String(v??"").trim());
  if(REQUIRED.some(h=>!headers.includes(h))) throw new Error("The 04_GALLERY worksheet does not match the verified gallery schema.");
  return {headers,rows:values.slice(1)};
}
async function authorized(request:NextRequest, requireOrigin=false) {
  if(process.env.VERCEL_ENV!=="preview") return {error:json({error:"Gallery moderation is restricted to Preview deployments."},404)};
  const actor=await currentAdmin();
  if(!actor||!can(actor,"gallery:publish")) return {error:json({error:"Gallery moderation permission required."},403)};
  if(requireOrigin&&!sameOrigin(request)) return {error:json({error:"Invalid request origin."},403)};
  return {actor};
}
export async function GET(request:NextRequest) {
  const auth=await authorized(request); if("error" in auth)return auth.error;
  try {
    const [{headers,rows},photographers]=await Promise.all([table(),readValues("'02_PHOTOGRAPHERS'!A1:P2001")]);
    const ph=(photographers[0]??[]).map(v=>String(v??"").trim());
    const nameIndex=ph.indexOf("public_name"),idIndex=ph.indexOf("photographer_id");
    const names=new Map<string,string>();
    for(const row of photographers.slice(1)){const id=String(row[idIndex]??"").trim();if(id)names.set(id,String(row[nameIndex]??"").trim());}
    const photos=rows.map((row,index)=>({row,rowNumber:index+2})).filter(x=>cell(x.row,headers,"photo_id")&&cell(x.row,headers,"image_preview_url")).map(x=>({
      id:cell(x.row,headers,"photo_id"),photographerId:cell(x.row,headers,"photographer_id"),
      photographerName:names.get(cell(x.row,headers,"photographer_id"))||"Photographer",
      title:cell(x.row,headers,"title"),caption:cell(x.row,headers,"caption"),imageUrl:cell(x.row,headers,"image_preview_url"),
      altText:cell(x.row,headers,"alt_text"),category:cell(x.row,headers,"category"),
      publishState:cell(x.row,headers,"publish_state").toUpperCase()||"UNPUBLISHED",
      sortOrder:Number(cell(x.row,headers,"sort_order"))||0
    })).sort((a,b)=>a.photographerName.localeCompare(b.photographerName)||a.sortOrder-b.sortOrder);
    return json({photos});
  } catch(error) { return json({error:error instanceof Error?error.message:"Gallery records could not be loaded."},503); }
}
export async function PATCH(request:NextRequest) {
  const auth=await authorized(request); if("error" in auth)return auth.error;
  if(!request.headers.get("content-type")?.toLowerCase().includes("application/json"))return json({error:"Invalid request."},415);
  try {
    const body=await request.json(), photoId=typeof body?.photoId==="string"?body.photoId.trim():"", publishState=typeof body?.publishState==="string"?body.publishState.toUpperCase():"";
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(photoId)||!["PUBLISHED","UNPUBLISHED"].includes(publishState))return json({error:"Choose a valid photo and publication state."},400);
    const {headers,rows}=await table();
    const matches=rows.map((row,index)=>({row,rowNumber:index+2})).filter(x=>cell(x.row,headers,"photo_id")===photoId);
    if(matches.length!==1)return json({error:matches.length?"Duplicate photo IDs require manual reconciliation.":"Portfolio photograph not found."},matches.length?409:404);
    const match=matches[0],previous=cell(match.row,headers,"publish_state").toUpperCase();
    if(previous===publishState)return json({ok:true,publishState});
    const column=headers.indexOf("publish_state");
    await batchUpdateValues([{range:`'04_GALLERY'!${col(column)}${match.rowNumber}`,values:[[publishState]]}]);
    await appendAudit(auth.actor,"gallery.photo.moderated","gallery_photo",photoId,{previousPublishState:previous||"UNPUBLISHED",publishState,photographerId:cell(match.row,headers,"photographer_id")});
    return json({ok:true,publishState});
  } catch(error) { return json({error:error instanceof Error?error.message:"Gallery moderation could not be saved."},503); }
}
