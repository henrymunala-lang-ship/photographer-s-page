import { redirect } from "next/navigation";
import { currentAdmin, can } from "@/lib/owner/admin-auth";
import PhotographerAccounts from "./photographer-accounts";
export const dynamic = "force-dynamic";
export default async function PhotographerAccountsPage(){
 const actor=await currentAdmin();
 if(!actor||!can(actor,"photographers:edit"))redirect("/owner");
 return <PhotographerAccounts/>;
}
