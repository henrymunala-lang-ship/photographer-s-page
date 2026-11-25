import { createHmac, randomUUID } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { getAdmins,getAdminCredential,verifyPassword,makeSessionCookie,cookieName,AdminRole } from "@/lib/owner/admin-auth";
import {readValues,updateValues,appendRows} from "@/lib/integrations/google-sheets/client";
import {getDatabase} from "@/lib/database/neon";
export const runtime="nodejs";export const dynamic="force-dynamic";
const MAX_AGE=8*60*60;
function sameOrigin(request:NextRequest){const origin=request.headers.get("origin");if(!origin)return false;try{return new URL(origin).host===request.headers.get("host");}catch{return false;}}
function noStore(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});}
async function consumeOwnerLoginLimit(request:NextRequest,username:string){
 const secret=process.env.GOOGLE_OAUTH_STATE_SECRET??"";
 if(secret.length<32)throw new Error("Login security is not configured.");
 const ip=request.headers.get("x-real-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
 const sql=getDatabase();
 async function consume(scope:string,identity:string){
  const key=createHmac("sha256",secret).update("owner-login:"+scope+":"+identity).digest("hex");
  const rows=await sql`INSERT INTO application_rate_limits (rate_key,window_started_at,request_count)
   VALUES (${key},now(),1)
   ON CONFLICT (rate_key) DO UPDATE SET
   request_count=CASE WHEN application_rate_limits.window_started_at<now()-interval '1 hour' THEN 1 ELSE application_rate_limits.request_count+1 END,
   window_started_at=CASE WHEN application_rate_limits.window_started_at<now()-interval '1 hour' THEN now() ELSE application_rate_limits.window_started_at END,
   updated_at=now()
   RETURNING request_count`;
  return Number(rows[0]?.request_count??999);
 }
 const [accountAttempts,ipAttempts]=await Promise.all([
  consume("account",username),
  consume("ip",ip)
 ]);
 return { limited: accountAttempts>10 || ipAttempts>40 };
}
export async function POST(request:NextRequest){
 if(!sameOrigin(request)||!request.headers.get("content-type")?.toLowerCase().includes("application/json"))return noStore({error:"Invalid request."},403);
 const body=await request.json().catch(()=>({})) as {username?:string;password?:string};
 const username=String(body.username??"").trim().toLowerCase(),password=String(body.password??"");
 if(!username||!password||username.length>254||password.length>128)return noStore({error:"Username or password is incorrect."},401);
 try{
  if((await consumeOwnerLoginLimit(request,username)).limited)return noStore({error:"Too many sign-in attempts. Please try again later."},429);
  const admins=await getAdmins(),admin=admins.find(x=>x.email?.toLowerCase()===username&&x.status==="active");
  if(!admin||!["super_admin","verification_admin","content_admin","support_admin"].includes(admin.role))return noStore({error:"Username or password is incorrect."},401);
  const hash=await getAdminCredential(admin.admin_id);
  if(!hash||!await verifyPassword(password,hash))return noStore({error:"Username or password is incorrect."},401);
  const session={adminId:admin.admin_id,email:admin.email,role:admin.role as AdminRole,name:admin.full_name||admin.email,exp:Date.now()+MAX_AGE*1000};
  const adminSheet=await readValues("'03_ADMINS'!A1:H501");
  const adminRow=adminSheet.findIndex((row,i)=>i>0&&row[0]===admin.admin_id);
  if(adminRow>0)await updateValues("'03_ADMINS'!H"+(adminRow+1)+":H"+(adminRow+1),[[new Date().toISOString()]]);
  await appendRows("'14_AUDIT_LOG'!A:I",[["audit_"+randomUUID(),"admin",admin.admin_id,"admin.login","administrator",admin.admin_id,JSON.stringify({role:admin.role}),"",new Date().toISOString()]]);
  const response=noStore({ok:true,admin:{email:session.email,name:session.name,role:session.role}});
  response.cookies.set(cookieName(),makeSessionCookie(session),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:MAX_AGE});
  return response;
 }catch{return noStore({error:"Administrator sign-in is temporarily unavailable."},503);}
}
export async function DELETE(request:NextRequest){
 if(!sameOrigin(request))return noStore({error:"Invalid request."},403);
 const response=noStore({ok:true});
 response.cookies.set(cookieName(),"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0});
 return response;
}
