import "server-only";

import { getAuthUser } from "@/lib/auth";
import type { ReceiptSourceType } from "@/lib/domain/receipts";
import { getStaffAccess, hasPermission } from "@/lib/staff-permissions";
import { getStaffReceipt } from "@/lib/services/staff-receipts";
import { loadReceiptBusinessSettings, loadReceiptIssuer } from "@/lib/services/student-receipts";
import { loadReceiptPdfAssets, renderReceiptPdf } from "@/lib/services/receipt-pdf";
import {
  receiptNotFoundResponse,
  receiptPdfResponse,
  receiptUnauthenticatedResponse,
} from "@/lib/server/receipt-response";

function sourceTypeForKind(kind: string): ReceiptSourceType | null {
  if (kind === "subscription") return "subscription";
  if (kind === "event") return "event_purchase";
  return null;
}

/**
 * GET `/api/receipts/staff/{subscription,event}/[id]`. Requires the exact
 * `payments:send_receipt` permission; without it the response is the same
 * 404 as an unknown purchase.
 */
export async function handleStaffReceiptRequest(kind: string, id: string): Promise<Response> {
  // Checked first because getStaffAccess() redirects when signed out.
  const user = await getAuthUser();
  if (!user) return receiptUnauthenticatedResponse();

  try {
    const access = await getStaffAccess();
    if (!hasPermission(access, "payments:send_receipt")) return receiptNotFoundResponse();

    const sourceType = sourceTypeForKind(kind);
    if (!sourceType) return receiptNotFoundResponse();

    // One settings load, shared: concurrent loads could read defaults.
    const settings = loadReceiptBusinessSettings();
    const [receipt, issuer, assets] = await Promise.all([
      getStaffReceipt(sourceType, id, settings),
      loadReceiptIssuer(settings),
      loadReceiptPdfAssets(),
    ]);
    if (!receipt) return receiptNotFoundResponse();
    const pdf = await renderReceiptPdf({ receipt, issuer, issuedAt: new Date(), assets });
    return receiptPdfResponse(pdf);
  } catch (err) {
    console.error("[receipts] staff receipt failed:", err instanceof Error ? err.message : err);
    return receiptNotFoundResponse();
  }
}
