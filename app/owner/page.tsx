import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import OwnerDashboard from "./owner-dashboard";

export const dynamic = "force-dynamic";

function validSession(value?: string) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";
  if (!value || secret.length < 32) return false;
  const expected = createHmac("sha256", secret).update("lens-light-owner-preview-v1").digest("base64url");
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function OwnerPage() {
  const cookieStore = await cookies();
  const authenticated = validSession(cookieStore.get("ll_owner_preview_session")?.value);
  return <OwnerDashboard authenticated={authenticated} />;
}
