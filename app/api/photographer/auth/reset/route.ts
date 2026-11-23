import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { hashPhotographerPassword } from "@/lib/photographers/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function sameOrigin(request:NextRequest){const origin=request.headers.get("origin");if(!origin)return false;try{return new URL(origin).host===request.headers.get("host");}catch{return false;}}
function noStore(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});}
export async function POST(request:NextRequest){
 if(process.env.VERCEL_ENV!=="preview")return noStore({error:"Photographer account recovery is restricted to Preview deployments."},404);
 if(!sameOrigin(request)||!request.headers.get("content-type")?.toLowerCase().includes("application/json"))return noStore({error:"Invalid request."},403);
 try{
  const payload=await request.json(),token=typeof payload?.token==="string"?payload.token:"",password=typeof payload?.password==="string"?payload.password:"";
  if(token.length<32||token.length>256)return noStore({error:"This password reset link is invalid or expired."},400);
  if(password.length<12||password.length>128)return noStore({error:"Choose a password between 12 and 128 characters."},400);
  const tokenHash=createHash("sha256").update(token).digest("hex"),passwordHash=await hashPhotographerPassword(password),sql=getDatabase();
  const changed=await sql`WITH claimed AS (
    UPDATE photographer_password_reset_tokens SET used_at=now()
    WHERE token_hash=${tokenHash} AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now()
    RETURNING account_id
  )
  UPDATE photographer_accounts a SET password_hash=${passwordHash},session_version=a.session_version+1,updated_at=now()
  FROM claimed c WHERE a.account_id=c.account_id AND a.account_state='active'
  RETURNING a.account_id`;
  if(!changed.length)return noStore({error:"This reset link is invalid, expired, already used, or the account is inactive. Ask Lens & Light for a new recovery link."},401);
  await sql`UPDATE photographer_password_reset_tokens SET revoked_at=now()
    WHERE account_id=${String(changed[0].account_id)} AND used_at IS NULL AND revoked_at IS NULL`;
  return noStore({ok:true,message:"Your password has been changed. Please sign in with your new password."});
 }catch{return noStore({error:"Password reset is temporarily unavailable. Please try again later."},503);}
}
