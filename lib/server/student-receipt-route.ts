import "server-only";

import { getAuthUser } from "@/lib/auth";
import type { ReceiptSourceType } from "@/lib/domain/receipts";
import { getOwnedStudentReceipt, loadReceiptIssuer } from "@/lib/services/student-receipts";
import { loadReceiptPdfAssets, renderReceiptPdf } from "@/lib/services/receipt-pdf";
import {
  receiptNotFoundResponse,
  receiptPdfResponse,
  receiptUnauthenticatedResponse,
} from "@/lib/server/receipt-response";

/** Shared GET handler for `/api/receipts/{subscription,event}/[id]`. */
export async function handleStudentReceiptRequest(sourceType: ReceiptSourceType, id: string): Promise<Response> {
  const user = await getAuthUser();
  if (!user) return receiptUnauthenticatedResponse();

  try {
    const receipt = await getOwnedStudentReceipt(user, sourceType, id);
    if (!receipt) return receiptNotFoundResponse();
    const [issuer, assets] = await Promise.all([loadReceiptIssuer(), loadReceiptPdfAssets()]);
    const pdf = await renderReceiptPdf({ receipt, issuer, issuedAt: new Date(), assets });
    return receiptPdfResponse(pdf);
  } catch (err) {
    // Any failure looks like "not found" so an error cannot reveal that a purchase exists.
    console.error(`[receipts] ${sourceType} receipt failed:`, err instanceof Error ? err.message : err);
    return receiptNotFoundResponse();
  }
}
