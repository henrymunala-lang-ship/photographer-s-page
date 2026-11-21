import {NextResponse} from "next/server";import {currentAdmin,roleLabel} from "@/lib/owner/admin-auth";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){const admin=await currentAdmin();if(!admin)return NextResponse.json({error:"Owner access required."},{status:401});return NextResponse.json({admin:{adminId:admin.adminId,email:admin.email,name:admin.name,role:admin.role,roleLabel:roleLabel(admin.role)}},{headers:{"Cache-Control":"private,no-store"}});}
