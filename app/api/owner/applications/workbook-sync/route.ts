import { NextResponse } from "next/server";
import { appendAudit, can, currentAdmin } from "@/lib/owner/admin-auth";
import { syncApplicationsToWorkbook } from "@/lib/applications/workbook-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const actor = await currentAdmin();
  if (!actor || !can(actor, "admins:manage")) {
    return NextResponse.json({ error: "Super Admin access required.", code: "OWNER_ACCESS_REQUIRED" }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }

  try {
    const result = await syncApplicationsToWorkbook();
    await appendAudit(actor, "application.workbook_sync.completed", "workbook", "application-storage", {
      applicationsRead: result.applicationsRead,
      messagesRead: result.messagesRead,
      registrationsAppended: result.registrationsAppended,
      registrationsUpdated: result.registrationsUpdated,
      detailsAppended: result.detailsAppended,
      detailsUpdated: result.detailsUpdated,
      messagesAppended: result.messagesAppended,
      messagesUpdated: result.messagesUpdated,
      alreadyPresent: result.alreadyPresent,
      deferred: result.deferred,
      failed: result.failed
    });
    return NextResponse.json({ ok: result.failed === 0 && result.deferred === 0, environment: "preview", ...result }, {
      status: result.failed || result.deferred ? 207 : 200,
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync failure.";
    await appendAudit(actor, "application.workbook_sync.blocked", "workbook", "application-storage", {
      reason: message.slice(0, 300)
    }).catch(() => undefined);
    return NextResponse.json({
      error: "Workbook sync was stopped before completing. Review the workbook schema and retry after resolving the reported issue.",
      detail: message.slice(0, 500),
      code: "WORKBOOK_SYNC_BLOCKED"
    }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }
}
