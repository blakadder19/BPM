import "server-only";

import type { RenderedReceiptPdf } from "@/lib/services/receipt-pdf";

/** Receipts are personal documents: never cached, indexed or sniffed. */
const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
};

export function receiptPdfResponse(pdf: RenderedReceiptPdf): Response {
  return new Response(Buffer.from(pdf.bytes), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
    },
  });
}

/** One response for wrong owner, unknown id and ineligible purchase alike. */
export function receiptNotFoundResponse(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function receiptUnauthenticatedResponse(): Response {
  return new Response("Sign in to download receipts", {
    status: 401,
    headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}
