import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/neon";
import { readPhotographerApplicantSession } from "@/lib/photographers/applicant-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({error:"Photographer accounts are restricted to Preview deployments."},{status:404});
  try {
    const session = readPhotographerApplicantSession(request);
    if (!session) return NextResponse.json({error:"Please sign in to view your application status."},{status:401,headers:{"Cache-Control":"private, no-store"}});
    const sql = getDatabase();
    const rows = await sql`SELECT s.status, s.applicant_name, s.applicant_email, s.created_at,
      a.account_state
      FROM application_submissions s
      JOIN photographer_applicant_accounts a ON a.registration_id = s.registration_id
      WHERE s.registration_id = ${session.registrationId}
        AND a.account_id = ${session.accountId} AND lower(a.email) = lower(s.applicant_email)
      LIMIT 1`;
    if (!rows.length) return NextResponse.json({error:"Your photographer account could not be verified."},{status:403,headers:{"Cache-Control":"private, no-store"}});
    const status = String(rows[0].status);
    return NextResponse.json({
      ok:true, name:String(rows[0].applicant_name), email:String(rows[0].applicant_email),
      status, accountState:String(rows[0].account_state),
      approved:status === "approved",
      message: status === "approved" ? "Your application is approved. Sign in again to open your photographer workspace."
        : status === "rejected" ? "Your application was not approved. Contact Lens & Light if you need clarification."
        : status === "withdrawn" ? "This application has been withdrawn."
        : status === "needs_information" ? "The Lens & Light team needs more information. Please use your private application conversation link."
        : "Your account is ready. Your application is awaiting review."
    },{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  } catch {
    return NextResponse.json({error:"Your application status is temporarily unavailable."},{status:503,headers:{"Cache-Control":"private, no-store"}});
  }
}
