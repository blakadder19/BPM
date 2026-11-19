/**
 * Business identity printed on a Payment Receipt.
 *
 * Stored inside the existing `app_settings` blob (`business_rules`), so no
 * schema change is needed. Every field is optional: the renderer prints
 * only what the academy has actually configured and never substitutes a
 * placeholder. In particular `academies.address` ("Dublin, Ireland") is
 * not a postal address and `academies.contact_email` is unverified, so
 * neither is read here.
 *
 * A configured `vatNumber` is also the switch that allows a receipt to
 * show its frozen VAT breakdown (see `lib/domain/receipts.ts`). The
 * document is a Payment Receipt either way, never a VAT invoice.
 */

export const RECEIPT_BUSINESS_FIELDS = [
  "legalName",
  "tradingName",
  "addressLine1",
  "addressLine2",
  "city",
  "postcode",
  "country",
  "contactEmail",
  "phone",
  "companyNumber",
  "vatNumber",
  "website",
  "footerNote",
] as const;

export type ReceiptBusinessField = (typeof RECEIPT_BUSINESS_FIELDS)[number];

export type ReceiptBusinessSettings = Record<ReceiptBusinessField, string | null>;

export const EMPTY_RECEIPT_BUSINESS_SETTINGS: ReceiptBusinessSettings = Object.freeze(
  Object.fromEntries(RECEIPT_BUSINESS_FIELDS.map((f) => [f, null])) as ReceiptBusinessSettings,
);

const MAX_FIELD_LENGTH = 200;
const MAX_FOOTER_LENGTH = 500;

/**
 * Coerce whatever is stored under `receiptBusiness` into the typed shape.
 * Non-strings, blanks and unknown keys are dropped rather than trusted, so
 * a hand-edited or partial settings row can never put junk on a receipt.
 */
export function normalizeReceiptBusinessSettings(raw: unknown): ReceiptBusinessSettings {
  const out: ReceiptBusinessSettings = { ...EMPTY_RECEIPT_BUSINESS_SETTINGS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const source = raw as Record<string, unknown>;
  for (const field of RECEIPT_BUSINESS_FIELDS) {
    const value = source[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const max = field === "footerNote" ? MAX_FOOTER_LENGTH : MAX_FIELD_LENGTH;
    out[field] = trimmed.slice(0, max);
  }
  return out;
}

export function hasConfiguredVatNumber(settings: ReceiptBusinessSettings): boolean {
  return !!settings.vatNumber;
}

/** Issuer block as the renderer will print it: configured values only. */
export interface ReceiptIssuer {
  /** Name shown as the receipt's heading. Null only if nothing is known at all. */
  displayName: string | null;
  /** Printed separately only when it differs from `displayName`. */
  legalName: string | null;
  addressLines: string[];
  contactEmail: string | null;
  phone: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  website: string | null;
  footerNote: string | null;
}

/**
 * @param fallbackTradingName the academy's existing trading name
 *   (`academies.name`, "Balance Power Motion"), used only when neither a
 *   trading nor a legal name is configured.
 */
export function resolveReceiptIssuer(
  settings: ReceiptBusinessSettings,
  fallbackTradingName: string | null,
): ReceiptIssuer {
  const fallback = fallbackTradingName?.trim() || null;
  const displayName = settings.tradingName ?? settings.legalName ?? fallback;
  const cityLine = [settings.city, settings.postcode].filter(Boolean).join(" ");
  return {
    displayName,
    legalName: settings.legalName && settings.legalName !== displayName ? settings.legalName : null,
    addressLines: [settings.addressLine1, settings.addressLine2, cityLine || null, settings.country].filter(
      (l): l is string => !!l,
    ),
    contactEmail: settings.contactEmail,
    phone: settings.phone,
    companyNumber: settings.companyNumber,
    vatNumber: settings.vatNumber,
    website: settings.website,
    footerNote: settings.footerNote,
  };
}
