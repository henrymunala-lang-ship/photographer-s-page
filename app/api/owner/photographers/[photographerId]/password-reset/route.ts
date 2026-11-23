import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { can, currentAdmin, appendAudit } from "@/lib/owner/admin-auth";
import { getDatabase } from "@/lib/database/neon";
import { readPhotographerRecord } from "@/lib/photographers/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ photographerId: string }> };
function sameOrigin(request:NextRequest){const origin=request.headers.get("origin");if(!origin)return false;try{return new URL(origin).host===request.headers.get("host");}catch{return false;}}
export async function POST(request:NextRequest,context:Context){
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"Account recovery is restricted to Preview deployments."},{status:404});
 const actor=await currentAdmin();
 if(!actor||!can(actor,"photographers:edit"))return NextResponse.json({error:"Photographer editing permission required."},{status:403});
 if(!sameOrigin(request))return NextResponse.json({error:"A same-origin request is required."},{status:403});
 try{
  const {photographerId}=await context.params;
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(photographerId))return NextResponse.json({error:"Photographer record not found."},{status:404});
  const record=await readPhotographerRecord(photographerId);
  if(!record)return NextResponse.json({error:"Only approved photographer accounts can be recovered."},{status:409});
  const sql=getDatabase();
  const accounts=await sql`SELECT account_id,email,account_state FROM photographer_accounts WHERE photographer_id=${photographerId} LIMIT 1`;
  if(!accounts.length)return NextResponse.json({error:"This photographer has not created an account yet. Use an invitation instead."},{status:409});
  if(String(accounts[0].account_state)!=="active")return NextResponse.json({error:"This account is suspended. Reactivate it before issuing a password reset."},{status:409});
  const accountId=String(accounts[0].account_id),email=String(accounts[0].email).toLowerCase();
  await sql`UPDATE photographer_password_reset_tokens SET revoked_at=now() WHERE account_id=${accountId} AND used_at IS NULL AND revoked_at IS NULL`;
  const token=randomBytes(32).toString("base64url"),tokenHash=createHash("sha256").update(token).digest("hex");
  const expiresAt=new Date(Date.now()+60*60*1000).toISOString();
  await sql`INSERT INTO photographer_password_reset_tokens(token_id,account_id,token_hash,expires_at,created_by)
    VALUES(${"prst_"+randomUUID()},${accountId},${tokenHash},${expiresAt},${actor.adminId})`;
  await appendAudit(actor,"photographer.account.password_reset_issued","photographer",photographerId,{accountId,email,expiresAt});
  const resetUrl=new URL("/photographer/reset#token="+encodeURIComponent(token),request.nextUrl.origin).toString();
  return NextResponse.json({ok:true,resetUrl,expiresAt,email},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
 }catch{return NextResponse.json({error:"A password recovery link could not be created. Confirm that the v5 account schema migration has completed."},{status:503});}
}
