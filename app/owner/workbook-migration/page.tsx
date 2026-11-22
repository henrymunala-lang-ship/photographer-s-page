import { redirect } from "next/navigation";
import { currentAdmin, can } from "@/lib/owner/admin-auth";
import WorkbookMigrationClient from "./workbook-migration-client";

export const dynamic = "force-dynamic";

export default async function WorkbookMigrationPage() {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "admins:manage")) redirect("/owner");
  return <WorkbookMigrationClient />;
}
