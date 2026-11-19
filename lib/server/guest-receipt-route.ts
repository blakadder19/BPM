import "server-only";

import { buildReceiptData } from "@/lib/domain/receipts";
import { hasConfiguredVatNumber } from "@/lib/domain/receipt-settings";
import { resolveGuestEventReceiptToken } from "@/lib/services/receipt-token-service";
import { loadReceiptBusinessSettings, loadReceiptIssuer } from "@/lib/services/student-receipts";
import { loadReceiptPdfAssets, renderReceiptPdf } from "@/lib/services/receipt-pdf";
import {
  receiptNotFoundResponse,
  receiptPdfResponse,
  receiptUnavailableRedirect,
} from "@/lib/server/receipt-response";

/** A url-encoded `token=<43 chars>` body is ~50 bytes. */
const MAX_FORM_BYTES = 1024;

/**
 * POST `/receipt/open` — public, no account. Guest links are
 * `/receipt#<token>`: the fragment never reaches the server, and the
 * `/receipt` page submits the token in this request's body, so it is not
 * part of any URL that request logs record. Any failure redirects to the
 * same explanation page. The token is never logged.
 */
export async function handleGuestReceiptPost(request: Request): Promise<Response> {
  const token = await readPostedToken(request);
  if (!token) return receiptUnavailableRedirect();
  const response = await handleGuestReceiptRequest(token);
  return response.ok ? response : receiptUnavailableRedirect();
}

async function readPostedToken(request: Request): Promise<string | null> {
  try {
    const body = await request.text();
    if (body.length > MAX_FORM_BYTES) return null;
    return new URLSearchParams(body).get("token");
  } catch {
    return null;
  }
}

/**
 * The token is the only credential: it must hash to an unrevoked,
 * unexpired token whose guest purchase is still receipt-eligible.
 * Malformed, unknown, revoked, expired, ineligible and failing requests
 * all get the same 404.
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
