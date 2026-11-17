import "server-only";

import { buildReceiptData } from "@/lib/domain/receipts";
import { hasConfiguredVatNumber } from "@/lib/domain/receipt-settings";
import { resolveGuestEventReceiptToken } from "@/lib/services/receipt-token-service";
import { loadReceiptBusinessSettings, loadReceiptIssuer } from "@/lib/services/student-receipts";
import { loadReceiptPdfAssets, renderReceiptPdf } from "@/lib/services/receipt-pdf";
import { receiptNotFoundResponse, receiptPdfResponse } from "@/lib/server/receipt-response";

/**
 * GET `/receipt/<token>` — public, no account. The token is the only
 * credential: it must hash to an unrevoked, unexpired token whose guest
 * purchase is still receipt-eligible. Malformed, unknown, revoked,
 * expired, ineligible and failing requests all get the same 404. The
 * token is never logged.
 */
export async function handleGuestReceiptRequest(rawToken: string): Promise<Response> {
  try {
    const resolved = await resolveGuestEventReceiptToken(rawToken);
    if (!resolved.ok) return receiptNotFoundResponse();

    const settings = await loadReceiptBusinessSettings();
    const built = buildReceiptData(
      { kind: "event_purchase", row: resolved.purchase },
      { businessHasVatNumber: hasConfiguredVatNumber(settings) },
    );
    if (!built.ok) return receiptNotFoundResponse();

    const [issuer, assets] = await Promise.all([loadReceiptIssuer(), loadReceiptPdfAssets()]);
    const pdf = await renderReceiptPdf({ receipt: built.receipt, issuer, issuedAt: new Date(), assets });
    return receiptPdfResponse(pdf);
  } catch (err) {
    console.error("[receipts] guest receipt failed:", err instanceof Error ? err.message : err);
    return receiptNotFoundResponse();
  }
}
