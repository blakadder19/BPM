import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import type { ReceiptData } from "@/lib/domain/receipts";
import { EMPTY_RECEIPT_BUSINESS_SETTINGS, resolveReceiptIssuer, type ReceiptIssuer } from "@/lib/domain/receipt-settings";

vi.mock("server-only", () => ({}));

import {
  RECEIPT_NOT_VAT_INVOICE,
  RECEIPT_TITLE,
  loadReceiptPdfAssets,
  renderReceiptPdf,
  type ReceiptPdfAssets,
} from "../receipt-pdf";

const ISSUED_AT = new Date("2026-11-17T12:00:00.000Z");

function receipt(over: Partial<ReceiptData> = {}): ReceiptData {
  return {
    sourceType: "subscription",
    sourceId: "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f",
    reference: "BPM-S-7K3Q-9XMD-2HPA-V0RT",
    customerKind: "student",
    customerName: "Zaria Test",
    customerEmail: "zaria.test@example.com",
    itemName: "Bronze Class Pass",
    itemType: "pass",
    itemSecondaryLabel: null,
    paymentRecordedAt: "2026-10-01T10:00:00.000Z",
    paymentRecordedAtSource: "paid_at",
    currency: "EUR",
    paymentMethodLabel: "Card (online)",
    paymentReference: null,
    originalAmountCents: null,
    discountAmountCents: null,
    subtotalExVatCents: null,
    vatAmountCents: null,
    vatRatePercent: null,
    totalPaidCents: 5500,
    refund: null,
    netPaidCents: 5500,
    vatBreakdownDisplayable: false,
    warnings: [],
    ...over,
  };
}

const FULL_ISSUER: ReceiptIssuer = resolveReceiptIssuer(
  {
    ...EMPTY_RECEIPT_BUSINESS_SETTINGS,
    tradingName: "Balance Power Motion",
    legalName: "BPM Dance Studio Ltd",
    addressLine1: "1 Example Street",
    city: "Dublin",
    postcode: "D01 X000",
    country: "Ireland",
    contactEmail: "hello@example.com",
    phone: "+353 1 000 0000",
    companyNumber: "000000",
    vatNumber: "IE0000000X",
    website: "bpm.example",
    footerNote: "Thank you for dancing with us.",
  },
  null,
);
const MINIMAL_ISSUER = resolveReceiptIssuer(EMPTY_RECEIPT_BUSINESS_SETTINGS, "Balance Power Motion");

let assets: ReceiptPdfAssets;
let drawn: string[] = [];

beforeAll(async () => {
  assets = await loadReceiptPdfAssets();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function render(r: ReceiptData, issuer: ReceiptIssuer = MINIMAL_ISSUER, dumpName?: string) {
  drawn = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push(text);
    return original.call(this, text, options);
  });
  const out = await renderReceiptPdf({ receipt: r, issuer, issuedAt: ISSUED_AT, assets });
  // Set RECEIPT_PDF_DUMP_DIR to inspect the generated documents by eye.
  const dumpDir = process.env.RECEIPT_PDF_DUMP_DIR;
  if (dumpDir && dumpName) {
    mkdirSync(dumpDir, { recursive: true });
    writeFileSync(path.join(dumpDir, `${dumpName}.pdf`), out.bytes);
  }
  return out;
}

const text = () => drawn.join("\n");

describe("renderReceiptPdf", () => {
  it("produces a single-page A4 PDF titled PAYMENT RECEIPT with the reference filename", async () => {
    const out = await render(receipt(), FULL_ISSUER, "subscription-basic");
    expect(Buffer.from(out.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(out.bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(doc.getTitle()).toBe("Payment Receipt BPM-S-7K3Q-9XMD-2HPA-V0RT");
    expect(out.filename).toBe("BPM-Payment-Receipt-BPM-S-7K3Q-9XMD-2HPA-V0RT.pdf");
    expect(drawn).toContain(RECEIPT_TITLE);
    expect(drawn).toContain(RECEIPT_NOT_VAT_INVOICE);
  });

  it("never calls the document an invoice outside the not-a-VAT-invoice notice", async () => {
    await render(receipt({ vatBreakdownDisplayable: true, subtotalExVatCents: 4472, vatAmountCents: 1028, vatRatePercent: 23 }), FULL_ISSUER);
    const others = drawn.filter((t) => t !== RECEIPT_NOT_VAT_INVOICE);
    expect(others.join("\n")).not.toMatch(/invoice/i);
  });

  it("prints only configured business fields", async () => {
    await render(receipt(), MINIMAL_ISSUER);
    expect(drawn).toContain("Balance Power Motion");
    expect(text()).not.toMatch(/VAT number|Company number|@example\.com\n.*\+353/);
    expect(text()).not.toContain("null");
    expect(text()).not.toContain("undefined");
  });

  it("prints every configured business field", async () => {
    await render(receipt(), FULL_ISSUER);
    for (const expected of [
      "Balance Power Motion",
      "BPM Dance Studio Ltd",
      "1 Example Street",
      "Dublin D01 X000",
      "Ireland",
      "hello@example.com",
      "+353 1 000 0000",
      "bpm.example",
      "Company number: 000000",
      "VAT number: IE0000000X",
      "Thank you for dancing with us.",
    ]) {
      expect(drawn).toContain(expected);
    }
  });

  it("shows Total paid only, with no VAT wording, when the VAT breakdown is not displayable", async () => {
    await render(receipt({ originalAmountCents: 5500, discountAmountCents: null }));
    expect(drawn).toContain("Total paid");
    expect(drawn).toContain("€55.00");
    const others = drawn.filter((t) => t !== RECEIPT_NOT_VAT_INVOICE);
    expect(others.join("\n")).not.toMatch(/VAT/);
  });

  it("shows the frozen VAT breakdown only when the receipt data allows it", async () => {
    await render(
      receipt({ vatBreakdownDisplayable: true, subtotalExVatCents: 4472, vatAmountCents: 1028, vatRatePercent: 23 }),
      FULL_ISSUER,
      "subscription-vat",
    );
    expect(drawn).toContain("Subtotal (excl. VAT)");
    expect(drawn).toContain("€44.72");
    expect(drawn).toContain("VAT (23%)");
    expect(drawn).toContain("€10.28");
  });

  it("prints the stored original price and discount without recomputing them", async () => {
    await render(receipt({ originalAmountCents: 5500, discountAmountCents: 1000, totalPaidCents: 4500, netPaidCents: 4500 }));
    expect(drawn).toEqual(expect.arrayContaining(["Original price", "€55.00", "Discount", "−€10.00", "Total paid", "€45.00"]));
  });

  it("events show the frozen event title and product name", async () => {
    await render(
      receipt({
        sourceType: "event_purchase",
        reference: "BPM-E-0000-1111-2222-3333",
        customerKind: "guest",
        itemName: "Beginners Course",
        itemType: "full_pass",
        itemSecondaryLabel: "Beginners Salsa & Bachata",
        paymentMethodLabel: "Cash",
        totalPaidCents: 9000,
        netPaidCents: 9000,
      }),
      FULL_ISSUER,
      "event-guest",
    );
    expect(drawn).toEqual(expect.arrayContaining(["Beginners Salsa & Bachata", "Beginners Course", "Full Pass", "Cash"]));
  });

  it("a refunded receipt shows original amount, confirmed refund, refund date and net paid", async () => {
    await render(
      receipt({
        totalPaidCents: 4500,
        refund: { refundedAmountCents: 4500, refundedAt: "2026-11-02T15:00:00.000Z", fullRefund: true },
        netPaidCents: 0,
      }),
      FULL_ISSUER,
      "subscription-refunded",
    );
    expect(drawn).toEqual(
      expect.arrayContaining([
        "Original amount paid",
        "€45.00",
        "Refund confirmed on 2 November 2026",
        "−€45.00",
        "Net paid",
        "€0.00",
      ]),
    );
  });

  it("omits the payment reference unless the receipt data carries a customer-safe one", async () => {
    await render(receipt({ paymentReference: null }));
    expect(drawn).not.toContain("Payment reference");
  });

  it("renders names outside Latin-1 and survives control characters and very long values", async () => {
    const out = await render(
      receipt({
        customerName: "Łukasz Ștefănescu-Ångström Øyvind Дмитрий",
        itemName: `Bronze\nClass\tPass ${"Extended ".repeat(40)}`,
      }),
      FULL_ISSUER,
      "unicode-long",
    );
    expect(drawn.join(" ")).toContain("Łukasz Ștefănescu-Ångström Øyvind Дмитрий");
    expect(drawn.every((t) => !/[\n\t]/.test(t))).toBe(true);
    expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(1);
  });

  it("stays a reasonable size with the embedded font subset and logo", async () => {
    const out = await render(receipt(), FULL_ISSUER);
    expect(out.bytes.byteLength).toBeLessThan(150_000);
  });
});
