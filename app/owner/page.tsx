import { cookies } from "next/headers";
import OwnerDashboard from "./owner-dashboard";
import {verifySession,cookieName} from "@/lib/owner/admin-auth";
export const dynamic="force-dynamic";
export default async function OwnerPage(){const jar=await cookies();const session=verifySession(jar.get(cookieName())?.value);return <OwnerDashboard authenticated={!!session}/>;}
