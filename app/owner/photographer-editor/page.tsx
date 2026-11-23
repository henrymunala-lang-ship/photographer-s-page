import { redirect } from "next/navigation";
import { can, currentAdmin } from "@/lib/owner/admin-auth";
import PhotographerEditor from "./photographer-editor";

export const dynamic = "force-dynamic";

export default async function PhotographerEditorPage() {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "photographers:edit")) redirect("/owner");
  return <PhotographerEditor />;
}
