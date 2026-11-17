import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { ReceiptData } from "@/lib/domain/receipts";
import type { ReceiptIssuer } from "@/lib/domain/receipt-settings";
import {
  formatReceiptDate,
  formatReceiptMoney,
  receiptItemTypeLabel,
  receiptPdfFilename,
} from "@/lib/domain/receipt-format";

/**
 * Payment Receipt PDF renderer (Node runtime only).
 *
 * Prints a normalised `ReceiptData` and the configured issuer exactly as
 * given. It never reads purchase rows or products, never decides
 * eligibility and never calculates a price or VAT: every amount is one
 * that `buildReceiptData` already resolved from frozen purchase data.
 *
 * Font and logo are bundled under `lib/assets/receipt` (Raleway, SIL OFL
 * 1.1; see OFL.txt there) so nothing is fetched at request time.
 */

export const RECEIPT_TITLE = "PAYMENT RECEIPT";
export const RECEIPT_NOT_VAT_INVOICE = "This is a payment receipt, not a VAT invoice.";

export interface ReceiptPdfAssets {
  regularFont: Uint8Array;
  boldFont: Uint8Array;
  logoJpg: Uint8Array | null;
}

const ASSET_DIR = path.join(process.cwd(), "lib", "assets", "receipt");
let assetsPromise: Promise<ReceiptPdfAssets> | null = null;

export function loadReceiptPdfAssets(): Promise<ReceiptPdfAssets> {
  assetsPromise ??= (async () => {
    const [regularFont, boldFont, logoJpg] = await Promise.all([
      readFile(path.join(ASSET_DIR, "Raleway-Regular.ttf")),
      readFile(path.join(ASSET_DIR, "Raleway-Bold.ttf")),
      readFile(path.join(ASSET_DIR, "bpm-logo-receipt.jpg")).catch(() => null),
    ]);
    return { regularFont, boldFont, logoJpg };
  })().catch((err) => {
    assetsPromise = null;
    throw err;
  });
  return assetsPromise;
}

export interface RenderReceiptPdfInput {
  receipt: ReceiptData;
  issuer: ReceiptIssuer;
  /** Date the document is generated; printed as "Issued on". */
  issuedAt: Date;
  assets: ReceiptPdfAssets;
}

export interface RenderedReceiptPdf {
  bytes: Uint8Array;
  filename: string;
}

// ── Layout ──────────────────────────────────────────────────

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const CONTENT_WIDTH = A4[0] - MARGIN * 2;
const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.85, 0.85, 0.87);
const ACCENT = rgb(0.87, 0.33, 0.29);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Strip control characters so stored text can never break the layout. */
function clean(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 3): string[] {
  const words = clean(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (!fits(line) && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && !fits(line.slice(0, cut))) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

class Cursor {
  constructor(
    readonly page: PDFPage,
    readonly fonts: Fonts,
    public y: number,
  ) {}

  text(
    value: string,
    opts: { x?: number; size?: number; bold?: boolean; color?: RGB; maxWidth?: number; maxLines?: number; gap?: number } = {},
  ): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const lines = wrap(value, font, size, opts.maxWidth ?? CONTENT_WIDTH, opts.maxLines);
    for (const line of lines) {
      this.y -= size + (opts.gap ?? 3);
      this.page.drawText(line, { x: opts.x ?? MARGIN, y: this.y, size, font, color: opts.color ?? INK });
    }
  }

  /** Label on the left, value right-aligned to the content edge. */
  row(label: string, value: string, opts: { bold?: boolean; size?: number; color?: RGB; x?: number } = {}): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const x = opts.x ?? MARGIN;
    const valueWidth = font.widthOfTextAtSize(value, size);
    const right = MARGIN + CONTENT_WIDTH;
    const labelLines = wrap(label, font, size, right - x - valueWidth - 16, 2);
    this.y -= size + 6;
    this.page.drawText(value, { x: right - valueWidth, y: this.y, size, font, color: opts.color ?? INK });
    labelLines.forEach((line, i) => {
      if (i > 0) this.y -= size + 3;
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? INK });
    });
  }

  rule(gapBefore = 10, gapAfter = 4): void {
    this.y -= gapBefore;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= gapAfter;
  }

  heading(value: string, x?: number): void {
    this.y -= 14;
    this.text(value.toUpperCase(), { x, size: 8.5, bold: true, color: MUTED });
  }
}

function drawLogo(page: PDFPage, logo: PDFImage | null, top: number): number {
  if (!logo) return 0;
  const height = 64;
  const width = (logo.width / logo.height) * height;
  page.drawImage(logo, { x: MARGIN, y: top - height, width, height });
  return height;
}

function issuerLines(issuer: ReceiptIssuer): string[] {
  const lines: string[] = [];
  if (issuer.legalName) lines.push(issuer.legalName);
  lines.push(...issuer.addressLines);
  if (issuer.contactEmail) lines.push(issuer.contactEmail);
  if (issuer.phone) lines.push(issuer.phone);
  if (issuer.website) lines.push(issuer.website);
  if (issuer.companyNumber) lines.push(`Company number: ${issuer.companyNumber}`);
  if (issuer.vatNumber) lines.push(`VAT number: ${issuer.vatNumber}`);
  return lines;
}

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? `${rate}%` : `${rate.toFixed(2).replace(/0+$/, "")}%`;
}

export async function renderReceiptPdf(input: RenderReceiptPdfInput): Promise<RenderedReceiptPdf> {
  const { receipt: r, issuer, issuedAt, assets } = input;
  const money = (cents: number) => formatReceiptMoney(cents, r.currency);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Raleway's default figures are old-style; amounts need lining figures.
  const features = { lnum: true };
  const fonts: Fonts = {
    regular: await doc.embedFont(assets.regularFont, { subset: true, features }),
    bold: await doc.embedFont(assets.boldFont, { subset: true, features }),
  };
  const logo = assets.logoJpg ? await doc.embedJpg(assets.logoJpg) : null;

  const title = `Payment Receipt ${r.reference}`;
  doc.setTitle(title, { showInWindowTitleBar: true });
  doc.setSubject("Payment receipt");
  if (issuer.displayName) doc.setAuthor(clean(issuer.displayName));
  doc.setCreator("BPM");
  doc.setProducer("BPM");
  doc.setCreationDate(issuedAt);
  doc.setModificationDate(issuedAt);
  doc.setKeywords([]);

  const page = doc.addPage(A4);
  const top = A4[1] - MARGIN;
  const c = new Cursor(page, fonts, top);

  // Header: logo left, title and reference right.
  const logoHeight = drawLogo(page, logo, top);
  const titleSize = 20;
  const titleWidth = fonts.bold.widthOfTextAtSize(RECEIPT_TITLE, titleSize);
  const right = MARGIN + CONTENT_WIDTH;
  page.drawText(RECEIPT_TITLE, { x: right - titleWidth, y: top - titleSize, size: titleSize, font: fonts.bold, color: INK });
  const refLabel = r.reference;
  const refWidth = fonts.regular.widthOfTextAtSize(refLabel, 10);
  page.drawText(refLabel, { x: right - refWidth, y: top - titleSize - 18, size: 10, font: fonts.regular, color: MUTED });
  page.drawRectangle({ x: right - 40, y: top - titleSize - 30, width: 40, height: 2, color: ACCENT });
  c.y = top - Math.max(logoHeight, titleSize + 34);

  c.rule(14, 0);

  // Issuer and customer side by side.
  const columnWidth = CONTENT_WIDTH / 2 - 12;
  const columnsTop = c.y;
  const issuerCol = new Cursor(page, fonts, columnsTop);
  issuerCol.heading("From");
  if (issuer.displayName) issuerCol.text(issuer.displayName, { bold: true, size: 11, maxWidth: columnWidth });
  for (const line of issuerLines(issuer)) issuerCol.text(line, { size: 9.5, color: MUTED, maxWidth: columnWidth, maxLines: 2 });

  const customerX = MARGIN + CONTENT_WIDTH / 2 + 12;
  const customerCol = new Cursor(page, fonts, columnsTop);
  customerCol.heading("Customer", customerX);
  customerCol.text(r.customerName, { x: customerX, bold: true, size: 11, maxWidth: columnWidth });
  if (r.customerEmail) customerCol.text(r.customerEmail, { x: customerX, size: 9.5, color: MUTED, maxWidth: columnWidth, maxLines: 2 });
  c.y = Math.min(issuerCol.y, customerCol.y);

  c.rule(16, 0);

  // Receipt details.
  c.heading("Receipt details");
  c.row("Receipt reference", r.reference);
  const recordedOn = formatReceiptDate(r.paymentRecordedAt);
  if (recordedOn) c.row("Payment recorded on", recordedOn);
  c.row("Payment method", r.paymentMethodLabel);
  if (r.paymentReference) c.row("Payment reference", clean(r.paymentReference));
  const issuedOn = formatReceiptDate(issuedAt.toISOString());
  if (issuedOn) c.row("Issued on", issuedOn);

  c.rule(16, 0);

  // Purchase.
  c.heading("Purchase");
  if (r.itemSecondaryLabel) {
    c.text(r.itemSecondaryLabel, { bold: true, size: 11, maxLines: 2 });
    c.text(r.itemName, { size: 10, maxLines: 2 });
  } else {
    c.text(r.itemName, { bold: true, size: 11, maxLines: 2 });
  }
  const typeLabel = receiptItemTypeLabel(r.itemType);
  if (typeLabel) c.text(typeLabel, { size: 9, color: MUTED });

  c.y -= 6;
  if (r.originalAmountCents != null) c.row("Original price", money(r.originalAmountCents));
  if (r.discountAmountCents != null) c.row("Discount", `−${money(r.discountAmountCents)}`);
  if (r.vatBreakdownDisplayable && r.subtotalExVatCents != null && r.vatAmountCents != null) {
    c.row("Subtotal (excl. VAT)", money(r.subtotalExVatCents));
    c.row(r.vatRatePercent != null ? `VAT (${formatRate(r.vatRatePercent)})` : "VAT", money(r.vatAmountCents));
  }
  c.rule(8, 0);
  c.row("Total paid", money(r.totalPaidCents), { bold: true, size: 12 });

  if (r.refund) {
    c.rule(16, 0);
    c.heading("Refund");
    c.row("Original amount paid", money(r.totalPaidCents));
    const refundedOn = formatReceiptDate(r.refund.refundedAt);
    c.row(refundedOn ? `Refund confirmed on ${refundedOn}` : "Refund confirmed", `−${money(r.refund.refundedAmountCents)}`);
    c.rule(8, 0);
    c.row("Net paid", money(r.netPaidCents), { bold: true, size: 12 });
  }

  // Footer, anchored to the bottom of the page.
  const footer = new Cursor(page, fonts, MARGIN + 54);
  footer.page.drawLine({
    start: { x: MARGIN, y: footer.y + 6 },
    end: { x: right, y: footer.y + 6 },
    thickness: 0.75,
    color: RULE,
  });
  footer.text(RECEIPT_NOT_VAT_INVOICE, { size: 9, bold: true, color: MUTED });
  if (issuer.footerNote) footer.text(issuer.footerNote, { size: 8.5, color: MUTED, maxLines: 3 });

  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, filename: receiptPdfFilename(r.reference) };
}
