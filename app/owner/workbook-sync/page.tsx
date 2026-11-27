import { redirect } from "next/navigation";
import { can, currentAdmin } from "@/lib/owner/admin-auth";
import WorkbookSyncClient from "./workbook-sync-client";

export const dynamic = "force-dynamic";

export default async function WorkbookSyncPage() {
  if (process.env.VERCEL_ENV !== "preview") redirect("/owner");
  const actor = await currentAdmin();
  if (!actor || !can(actor, "admins:manage")) redirect("/owner");
  return <WorkbookSyncClient />;
}
