import "server-only";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { readValues, appendRows } from "@/lib/integrations/google-sheets/client";
const scrypt=promisify(scryptCallback), COOKIE="ll_owner_preview_session", MAX_AGE=8*60*60;
export type AdminRole="super_admin"|"verification_admin"|"content_admin"|"support_admin";
export type AdminSession={adminId:string;email:string;role:AdminRole;name:string;exp:number};
const permissions:Record<AdminRole,string[]>={super_admin:["*"],verification_admin:["applications:read","applications:review"],content_admin:["photographers:read","photographers:edit","gallery:publish"],support_admin:["enquiries:read","enquiries:reply","reports:read"]};
function secret(){const v=process.env.GOOGLE_OAUTH_STATE_SECRET??"";if(v.length<32)throw new Error("Session signing is not configured.");return v;}
function sign(value:string){return createHmac("sha256",secret()).update(value).digest("base64url");}
export function makeSessionCookie(session:AdminSession){const payload=Buffer.from(JSON.stringify(session)).toString("base64url");return payload+"."+sign(payload);}
export function verifySession(value?:string):AdminSession|null{try{if(!value)return null;const [payload,signature]=value.split(".");if(!payload||!signature)return null;const expected=Buffer.from(sign(payload)),actual=Buffer.from(signature);if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;const data=JSON.parse(Buffer.from(payload,"base64url").toString()) as AdminSession;if(!data.adminId||!data.email||!data.role||data.exp<Date.now()||!permissions[data.role])return null;return data;}catch{return null;}}
export async function currentAdmin(){const jar=await cookies(),session=verifySession(jar.get(COOKIE)?.value);if(!session)return null;const admins=await getAdmins(),active=admins.find(a=>a.admin_id===session.adminId&&a.email?.toLowerCase()===session.email.toLowerCase()&&a.status==="active"&&a.role===session.role);return active?session:null;}
export function can(session:AdminSession|null,permission:string){return !!session&&(session.role==="super_admin"||permissions[session.role]?.includes(permission)===true);}
export function cookieName(){return COOKIE;}
export async function hashPassword(password:string){const salt=randomBytes(16).toString("hex");const key=await scrypt(password,salt,64) as Buffer;return salt+":"+key.toString("hex");}
export async function verifyPassword(password:string,stored:string){const [salt,hex]=stored.split(":");if(!salt||!hex||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(hex))return false;const key=await scrypt(password,salt,64) as Buffer,expected=Buffer.from(hex,"hex");return key.length===expected.length&&timingSafeEqual(key,expected);}
export async function getAdminCredential(adminId:string){const rows=await readValues("'13_SETTINGS'!A2:I1000");const row=rows.find(r=>r[1]==="admin_auth"&&r[3]===("password_hash:"+adminId));return row?.[4]??"";}
export async function getAdmins(){const rows=await readValues("'03_ADMINS'!A1:H501");const h=rows[0]??[];return rows.slice(1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(h.map((k,i)=>[k,String(r[i]??"")])));}
export async function appendAudit(actor:AdminSession,action:string,targetType:string,targetId:string,metadata:Record<string,unknown>={}){await appendRows("'14_AUDIT_LOG'!A:I",[[ "audit_"+randomBytes(12).toString("hex"),"admin",actor.adminId,action,targetType,targetId,JSON.stringify(metadata),"",new Date().toISOString() ]]);}
export function roleLabel(role:string){return ({super_admin:"Super Admin",verification_admin:"Verification Admin",content_admin:"Content Admin",support_admin:"Support Admin"} as Record<string,string>)[role]??role;}
