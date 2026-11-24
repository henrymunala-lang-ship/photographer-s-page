import {randomBytes,randomUUID,createHash} from "node:crypto";import {NextRequest,NextResponse} from "next/server";import {appendRows,readValues} from "@/lib/integrations/google-sheets/client";import {currentAdmin,can,appendAudit,roleLabel} from "@/lib/owner/admin-auth";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){const actor=await currentAdmin();if(!actor||!can(actor,"admins:manage"))return NextResponse.json({error:"Super Admin access required."},{status:403});const rows=await readValues("'03_ADMINS'!A1:H501");const headers=rows[0]??[];const admins=rows.slice(1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??"")]))).map(a=>({adminId:a.admin_id,email:a.email,name:a.full_name,role:a.role,roleLabel:roleLabel(a.role),status:a.status,lastLoginAt:a.last_login_at}));return NextResponse.json({admins},{headers:{"Cache-Control":"private,no-store"}});}
export async function POST(req:NextRequest){const actor=await currentAdmin();if(!actor||!can(actor,"admins:manage"))return NextResponse.json({error:"Only the Super Admin can invite administrators."},{status:403});const body=await req.json().catch(()=>({})) as {email?:string;role?:string};const email=String(body.email??"").trim().toLowerCase(),role=String(body.role??"");if(!/^\S+@\S+\.\S+$/.test(email)||!["verification_admin","content_admin","support_admin"].includes(role))return NextResponse.json({error:"Enter a valid email and an available administrator role."},{status:400});const existing=await readValues("'03_ADMINS'!A2:H501");if(existing.some(r=>String(r[2]??"").toLowerCase()===email&&r[5]==="active"))return NextResponse.json({error:"An active administrator already uses this email."},{status:409});const token=randomBytes(32).toString("base64url"),id="inv_"+randomUUID(),expiry=new Date(Date.now()+72*60*60*1000).toISOString(),hash=createHash("sha256").update(token).digest("hex");await appendRows("'21_ADMIN_INVITATIONS'!A:H",[[id,email,role,actor.adminId,hash,expiry,"","pending"]]);await appendAudit(actor,"admin.invited","administrator_invitation",id,{email,role,expiry});return NextResponse.json({invitation:{id,email,role,roleLabel:roleLabel(role),expiry,acceptancePath:"/owner/accept-invitation?token="+token},token},{headers:{"Cache-Control":"no-store"}});}

export async function PATCH(req:NextRequest){
  const actor=await currentAdmin();
  if(!actor||!can(actor,"admins:manage"))return NextResponse.json({error:"Only the Super Admin can change administrator roles."},{status:403});
  const body=await req.json().catch(()=>({})) as {adminId?:string;role?:string};
  const adminId=String(body.adminId??"").trim(),role=String(body.role??"");
  if(!adminId||!["verification_admin","content_admin","support_admin"].includes(role))return NextResponse.json({error:"Choose a valid administrator and role."},{status:400});
  if(adminId===actor.adminId)return NextResponse.json({error:"You cannot change your own role."},{status:403});
  const rows=await readValues("'03_ADMINS'!A1:H501");
  const headers=rows[0]??[];
  const idIndex=headers.indexOf("admin_id"),roleIndex=headers.indexOf("role"),statusIndex=headers.indexOf("status");
  if(idIndex<0||roleIndex<0||statusIndex<0)return NextResponse.json({error:"Administrator workbook columns are not configured correctly."},{status:500});
  const rowIndex=rows.findIndex((row,index)=>index>0&&String(row[idIndex]??"")===adminId);
  if(rowIndex<1)return NextResponse.json({error:"Administrator account was not found."},{status:404});
  const target=rows[rowIndex];
  if(String(target[statusIndex]??"")!=="active")return NextResponse.json({error:"Only active administrator accounts can be reassigned."},{status:409});
  const previousRole=String(target[roleIndex]??"");
  if(previousRole==="super_admin")return NextResponse.json({error:"The Lead Admin account cannot be changed here."},{status:403});
  if(!["verification_admin","content_admin","support_admin"].includes(previousRole))return NextResponse.json({error:"The current administrator role is not eligible for reassignment."},{status:409});
  if(previousRole===role)return NextResponse.json({ok:true,role,roleLabel:roleLabel(role),message:"This administrator already has that role."});
  const sheetRow=rowIndex+1;
  await updateValues("'03_ADMINS'!"+String.fromCharCode(65+roleIndex)+sheetRow+":"+String.fromCharCode(65+roleIndex)+sheetRow,[[role]]);
  await appendAudit(actor,"admin.role_changed","administrator",adminId,{email:String(target[headers.indexOf("email")]??""),previousRole,newRole:role});
  return NextResponse.json({ok:true,role,roleLabel:roleLabel(role),message:"Administrator role updated. The administrator must sign in again for the new dashboard permissions to take effect."},{headers:{"Cache-Control":"no-store"}});
}
