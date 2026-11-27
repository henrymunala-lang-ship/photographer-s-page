import { NextRequest, NextResponse } from "next/server";
import { getClientPortalConversations } from "@/lib/client-enquiries/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Preview only." }, { status: 404, headers: noStore });
  try {
    const conversations = await getClientPortalConversations(request);
    if (!conversations) return NextResponse.json({ error: "Please request a secure portal link by email." }, { status: 401, headers: noStore });
    return NextResponse.json({ conversations }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Your conversations could not be loaded." }, { status: 503, headers: noStore });
  }
}
