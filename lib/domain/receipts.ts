/**
 * Payment Receipt domain (Phase 23).
 *
 * Turns a frozen purchase row into the normalised data a Payment Receipt
 * is rendered from. Pure: no DB, no settings store, no live product or
 * VAT lookups. Every figure comes from the values frozen on the purchase
 * row; nothing is recomputed from today's prices or VAT settings.
 *
 * The document is a PAYMENT RECEIPT — never an invoice, tax invoice or
 * VAT invoice — and no receipt exists for a purchase where no money was
 * taken (complimentary / waived / free / 100%-discounted).
 *
 * `evaluateReceiptEligibility` is the single eligibility rule. Routes,
 * emails and admin actions must call it (or `buildReceiptData`, which
 * calls it) instead of re-implementing any part of it.
 */

import type { MockEventPurchase, MockSubscription } from "@/lib/mock-data";

// ── Sources ─────────────────────────────────────────────────

export type ReceiptSourceType = "subscription" | "event_purchase";

/** Who the receipt is issued to. Only name and email — never phone/address. */
export interface ReceiptCustomer {
  name: string | null;
  email: string | null;
}

export type SubscriptionReceiptRow = Pick<
  MockSubscription,
  | "id"
  | "paymentStatus"
  | "paymentMethod"
  | "paidAt"
  | "assignedAt"
  | "priceCentsAtPurchase"
  | "currencyAtPurchase"
  | "originalPriceCents"
  | "discountAmountCents"
  | "productNameSnapshot"
  | "productTypeSnapshot"
  | "productName"
  | "productType"
  | "paymentReference"
  | "refundedAt"
  | "refundedAmountCents"
  | "refundStatus"
  | "stripeRefundId"
  | "subtotalExVatCents"
  | "vatAmountCents"
  | "vatRatePercent"
  | "vatPriceMode"
  | "totalIncVatCents"
>;

export type EventPurchaseReceiptRow = Pick<
  MockEventPurchase,
  | "id"
  | "studentId"
  | "guestName"
  | "guestEmail"
  | "paymentStatus"
  | "paymentMethod"
  | "receptionMethod"
  | "paidAt"
  | "purchasedAt"
  | "paidAmountCents"
  | "originalAmountCents"
  | "discountAmountCents"
  | "currency"
  | "productNameSnapshot"
  | "productTypeSnapshot"
  | "eventTitleSnapshot"
  | "paymentReference"
  | "refundedAt"
  | "refundedAmountCents"
  | "refundStatus"
  | "stripeRefundId"
  | "subtotalExVatCents"
  | "vatAmountCents"
  | "vatRatePercent"
  | "vatPriceMode"
  | "totalIncVatCents"
>;

/**
 * Only frozen purchase data and the customer identity. Deliberately no
 * live event title, term name, validity dates or selected styles: all of
 * those can change after the purchase (event rename, term rename, "Extend
 * expiry", admin style edits) and would rewrite an old receipt.
 */
export type ReceiptSource =
  | {
      kind: "subscription";
      row: SubscriptionReceiptRow;
      /** The student's current account name and authenticated email. */
      customer: ReceiptCustomer;
    }
  | {
      kind: "event_purchase";
      row: EventPurchaseReceiptRow;
      /**
       * The student's current account identity for logged-in purchases.
       * Ignored for guest purchases, which use the guest name/email frozen
       * on the row.
       */
      customer?: ReceiptCustomer | null;
    };

// ── Eligibility ─────────────────────────────────────────────

export type ReceiptIneligibleReason =
  | "invalid_source_id"
  | "payment_pending"
  | "payment_cancelled"
  /** A stored status outside the typed union — fail closed, never throw. */
  | "payment_status_unknown"
  /** Complimentary, waived, free or discounted to €0. */
  | "no_payment_taken"
  | "amount_unknown"
  | "currency_unknown"
  | "payment_date_unknown"
  /** Refunded, but the refund amount or date cannot be trusted. */
  | "refund_data_incomplete"
  /** Refund recorded but Stripe has not confirmed it (pending / failed). */
  | "refund_not_confirmed"
  | "customer_identity_missing"
  | "item_name_missing"
  /** Event purchase without a frozen event title (pre-00082 row). */
  | "event_title_missing";

export type ReceiptEligibility =
  | { eligible: true }
  | { eligible: false; reason: ReceiptIneligibleReason };

/** History-list wording for purchases that have no receipt because no money was taken. */
export type NoPaymentLabel =
  | "Complimentary — no payment taken"
  | "Free registration"
  | "€0 after discount — no payment taken";

// ── Normalised receipt ──────────────────────────────────────

export type ReceiptWarning =
  /** Snapshot columns missing (pre-00082 row): the live product name was used. */
  | "item_name_from_live_product"
  /** Stored list price / discount / VAT do not add up to the amount paid. */
  | "amount_breakdown_inconsistent"
  /** Some but not all VAT snapshot fields are set. */
  | "vat_snapshot_partial"
  /** Event row had no paid_at; purchased_at was used. */
  | "payment_date_from_purchased_at"
  /** A Stripe refund is pending; it is not reflected until confirmed. */
  | "refund_pending_not_included";

export interface ReceiptRefund {
  refundedAmountCents: number;
  refundedAt: string;
  fullRefund: boolean;
}

export interface ReceiptData {
  sourceType: ReceiptSourceType;
  sourceId: string;
  reference: string;
  customerKind: "student" | "guest";
  customerName: string;
  customerEmail: string | null;
  itemName: string;
  itemType: string | null;
  itemSecondaryLabel: string | null;
  /** Rendered as "Payment recorded on". */
  paymentRecordedAt: string;
  paymentRecordedAtSource: "paid_at" | "assigned_at" | "purchased_at";
  /** ISO 4217, upper case. */
  currency: string;
  paymentMethodLabel: string;
  /** Only a customer-safe reference; null for every format stored today. */
  paymentReference: string | null;
  /** Shown only when the stored breakdown reconciles with the total paid. */
  originalAmountCents: number | null;
  discountAmountCents: number | null;
  /** Set only when `vatBreakdownDisplayable` is true. */
  subtotalExVatCents: number | null;
  vatAmountCents: number | null;
  vatRatePercent: number | null;
  totalPaidCents: number;
  refund: ReceiptRefund | null;
  netPaidCents: number;
  /**
   * True only when a complete, reconciling frozen VAT snapshot exists AND
   * the business has a VAT number configured. When false the renderer must
   * show "Total paid" only, with no VAT wording at all.
   */
  vatBreakdownDisplayable: boolean;
  /** Internal diagnostics. Never rendered on the receipt. */
  warnings: ReceiptWarning[];
}

export interface ReceiptBuildContext {
  /** From receipt business settings: a VAT number is configured. */
  businessHasVatNumber: boolean;
}

export type ReceiptBuildResult =
  | { ok: true; receipt: ReceiptData }
  | { ok: false; reason: ReceiptIneligibleReason };

// ── Helpers ─────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

function isPositiveCents(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

function nonEmpty(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

interface RefundFacts {
  paymentStatus: string;
  paymentMethod: string;
  totalPaidCents: number;
  refundedAt: string | null;
  refundedAmountCents: number | null | undefined;
  refundStatus: "succeeded" | "pending" | "failed" | null | undefined;
  stripeRefundId: string | null | undefined;
}

type RefundResolution =
  | { ok: true; refund: ReceiptRefund | null; pendingIgnored: boolean }
  | { ok: false; reason: "refund_data_incomplete" | "refund_not_confirmed" };

/**
 * A receipt shows returned money only when BPM recorded both the amount
 * and the date. Nothing is inferred: a refunded row with no refunded
 * amount (the BPM-only manual refund paths store none) is NOT treated as
 * a full refund — it is `refund_data_incomplete` and has no receipt until
 * the amount is corrected through an explicit data-correction flow.
 *
 * Stripe refunds additionally need Stripe's confirmation: since Phase 23A
 * `refunded_amount_cents` only grows when Stripe reports `succeeded`.
 */
function resolveRefund(f: RefundFacts): RefundResolution {
  const recorded = f.refundedAmountCents;
  const hasAmount = typeof recorded === "number" && Number.isInteger(recorded) && recorded > 0;
  const viaStripe = f.paymentMethod === "stripe" || !!f.stripeRefundId;

  if (f.paymentStatus === "refunded") {
    if (f.refundStatus === "pending" || f.refundStatus === "failed") {
      return { ok: false, reason: "refund_not_confirmed" };
    }
    if (!f.refundedAt || !hasAmount) return { ok: false, reason: "refund_data_incomplete" };
    // A row flipped to refunded with only part of the money recorded has
    // no record of how the rest went back.
    if (recorded !== f.totalPaidCents) return { ok: false, reason: "refund_data_incomplete" };
    if (viaStripe && f.refundStatus !== "succeeded") return { ok: false, reason: "refund_data_incomplete" };
    return { ok: true, refund: { refundedAmountCents: recorded, refundedAt: f.refundedAt, fullRefund: true }, pendingIgnored: false };
  }

  // Still "paid": possibly partially refunded through Stripe.
  const pendingIgnored = f.refundStatus === "pending";
  if (!hasAmount) {
    if (recorded != null && recorded !== 0) return { ok: false, reason: "refund_data_incomplete" };
    return { ok: true, refund: null, pendingIgnored };
  }
  const confirmed = recorded;
  // Pre-23A code stored the amount even when Stripe reported failure.
  if (f.refundStatus === "failed") return { ok: false, reason: "refund_data_incomplete" };
  if (!f.refundedAt || confirmed > f.totalPaidCents) return { ok: false, reason: "refund_data_incomplete" };
  return {
    ok: true,
    refund: { refundedAmountCents: confirmed, refundedAt: f.refundedAt, fullRefund: confirmed === f.totalPaidCents },
    pendingIgnored,
  };
}

// ── Eligibility (canonical) ─────────────────────────────────

interface Evaluated {
  totalPaidCents: number;
  currency: string;
  paymentRecordedAt: string;
  paymentRecordedAtSource: ReceiptData["paymentRecordedAtSource"];
  refund: ReceiptRefund | null;
  pendingRefundIgnored: boolean;
  customerKind: ReceiptData["customerKind"];
  customer: { name: string; email: string | null };
  itemName: string;
  itemNameFromLive: boolean;
}

type EvaluateResult = { ok: true; value: Evaluated } | { ok: false; reason: ReceiptIneligibleReason };

function evaluate(source: ReceiptSource): EvaluateResult {
  if (!isUuid(source.row.id)) return { ok: false, reason: "invalid_source_id" };

  switch (source.kind) {
    case "subscription": {
      const row = source.row;
      switch (row.paymentStatus) {
        case "pending":
          return { ok: false, reason: "payment_pending" };
        case "cancelled":
          return { ok: false, reason: "payment_cancelled" };
        case "complimentary":
        case "waived":
          return { ok: false, reason: "no_payment_taken" };
        case "paid":
        case "refunded":
          break;
        default: {
          const unreachable: never = row.paymentStatus;
          void unreachable;
          return { ok: false, reason: "payment_status_unknown" };
        }
      }
      if (row.paymentMethod === "complimentary") return { ok: false, reason: "no_payment_taken" };
      const total = row.priceCentsAtPurchase;
      if (total == null || !Number.isInteger(total) || total < 0) return { ok: false, reason: "amount_unknown" };
      if (total === 0) return { ok: false, reason: "no_payment_taken" };
      const currency = nonEmpty(row.currencyAtPurchase)?.toUpperCase();
      if (!currency) return { ok: false, reason: "currency_unknown" };

      const recordedAt = row.paidAt ?? nonEmpty(row.assignedAt);
      if (!recordedAt) return { ok: false, reason: "payment_date_unknown" };

      const refund = resolveRefund({
        paymentStatus: row.paymentStatus,
        paymentMethod: row.paymentMethod,
        totalPaidCents: total,
        refundedAt: row.refundedAt,
        refundedAmountCents: row.refundedAmountCents,
        refundStatus: row.refundStatus,
        stripeRefundId: row.stripeRefundId,
      });
      if (!refund.ok) return refund;

      const name = nonEmpty(source.customer.name);
      if (!name) return { ok: false, reason: "customer_identity_missing" };

      const snapshotName = nonEmpty(row.productNameSnapshot);
      const liveName = nonEmpty(row.productName);
      const itemName = snapshotName ?? liveName;
      if (!itemName) return { ok: false, reason: "item_name_missing" };

      return {
        ok: true,
        value: {
          totalPaidCents: total,
          currency,
          paymentRecordedAt: recordedAt,
          paymentRecordedAtSource: row.paidAt ? "paid_at" : "assigned_at",
          refund: refund.refund,
          pendingRefundIgnored: refund.pendingIgnored,
          customerKind: "student",
          customer: { name, email: nonEmpty(source.customer.email) },
          itemName,
          itemNameFromLive: !snapshotName,
        },
      };
    }

    case "event_purchase": {
      const row = source.row;
      switch (row.paymentStatus) {
        case "pending":
          return { ok: false, reason: "payment_pending" };
        case "paid":
        case "refunded":
          break;
        default: {
          const unreachable: never = row.paymentStatus;
          void unreachable;
          return { ok: false, reason: "payment_status_unknown" };
        }
      }
      const total = row.paidAmountCents;
      if (total == null || !Number.isInteger(total) || total < 0) return { ok: false, reason: "amount_unknown" };
      if (total === 0) return { ok: false, reason: "no_payment_taken" };
      const currency = nonEmpty(row.currency)?.toUpperCase();
      if (!currency) return { ok: false, reason: "currency_unknown" };

      const recordedAt = row.paidAt ?? nonEmpty(row.purchasedAt);
      if (!recordedAt) return { ok: false, reason: "payment_date_unknown" };

      const refund = resolveRefund({
        paymentStatus: row.paymentStatus,
        paymentMethod: row.paymentMethod,
        totalPaidCents: total,
        refundedAt: row.refundedAt,
        refundedAmountCents: row.refundedAmountCents,
        refundStatus: row.refundStatus,
        stripeRefundId: row.stripeRefundId,
      });
      if (!refund.ok) return refund;

      const isGuest = row.studentId == null;
      const identity: ReceiptCustomer = isGuest
        ? { name: row.guestName, email: row.guestEmail }
        : (source.customer ?? { name: null, email: null });
      const name = nonEmpty(identity.name);
      if (!name) return { ok: false, reason: "customer_identity_missing" };

      const itemName = nonEmpty(row.productNameSnapshot);
      if (!itemName) return { ok: false, reason: "item_name_missing" };
      if (!nonEmpty(row.eventTitleSnapshot)) return { ok: false, reason: "event_title_missing" };

      return {
        ok: true,
        value: {
          totalPaidCents: total,
          currency,
          paymentRecordedAt: recordedAt,
          paymentRecordedAtSource: row.paidAt ? "paid_at" : "purchased_at",
          refund: refund.refund,
          pendingRefundIgnored: refund.pendingIgnored,
          customerKind: isGuest ? "guest" : "student",
          customer: { name, email: nonEmpty(identity.email) },
          itemName,
          itemNameFromLive: false,
        },
      };
    }

    default: {
      const unreachable: never = source;
      throw new Error(`Unhandled receipt source: ${JSON.stringify(unreachable)}`);
    }
  }
}

/** The single receipt-eligibility rule. */
export function evaluateReceiptEligibility(source: ReceiptSource): ReceiptEligibility {
  const r = evaluate(source);
  return r.ok ? { eligible: true } : { eligible: false, reason: r.reason };
}

/** History-list label for a purchase that has no receipt because nothing was paid. */
export function noPaymentLabel(source: ReceiptSource): NoPaymentLabel | null {
  if (evaluateReceiptEligibility(source).eligible) return null;
  if (source.kind === "subscription") {
    const { paymentStatus, paymentMethod, priceCentsAtPurchase, originalPriceCents } = source.row;
    if (paymentStatus === "complimentary" || paymentStatus === "waived" || paymentMethod === "complimentary") {
      return "Complimentary — no payment taken";
    }
    if (paymentStatus === "paid" && priceCentsAtPurchase === 0) {
      return isPositiveCents(originalPriceCents) ? "€0 after discount — no payment taken" : "Complimentary — no payment taken";
    }
    return null;
  }
  const { paymentStatus, paidAmountCents, originalAmountCents } = source.row;
  if (paymentStatus !== "paid" || paidAmountCents !== 0) return null;
  return isPositiveCents(originalAmountCents) ? "€0 after discount — no payment taken" : "Free registration";
}

// ── Amounts ─────────────────────────────────────────────────

export interface FrozenAmountInput {
  /** The canonical amount actually paid. Never recomputed. */
  totalPaidCents: number;
  originalAmountCents: number | null | undefined;
  discountAmountCents: number | null | undefined;
  subtotalExVatCents: number | null | undefined;
  vatAmountCents: number | null | undefined;
  vatRatePercent: number | null | undefined;
  vatPriceMode: "exclusive" | "inclusive" | null | undefined;
  totalIncVatCents: number | null | undefined;
}

export interface NormalizedReceiptAmounts {
  totalPaidCents: number;
  originalAmountCents: number | null;
  discountAmountCents: number | null;
  subtotalExVatCents: number | null;
  vatAmountCents: number | null;
  vatRatePercent: number | null;
  vatBreakdownDisplayable: boolean;
  warnings: ReceiptWarning[];
}

const isCents = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;

/**
 * Decide which frozen components the receipt may print next to the total.
 *
 * The total is always the stored amount paid. The list price, discount
 * and VAT lines are printed only when the stored components reconcile
 * exactly with it; otherwise they are suppressed (never corrected) and a
 * warning is raised for staff. The VAT lines additionally require the
 * business to have a VAT number configured. Without them, an exclusive-VAT
 * list price is net of VAT and would not add up to the total, so the list
 * price and discount are hidden too.
 */
export function normalizeReceiptAmounts(
  input: FrozenAmountInput,
  ctx: ReceiptBuildContext,
): NormalizedReceiptAmounts {
  const total = input.totalPaidCents;
  const warnings: ReceiptWarning[] = [];
  const totalOnly: NormalizedReceiptAmounts = {
    totalPaidCents: total,
    originalAmountCents: null,
    discountAmountCents: null,
    subtotalExVatCents: null,
    vatAmountCents: null,
    vatRatePercent: null,
    vatBreakdownDisplayable: false,
    warnings,
  };

  const vatFields = [
    input.subtotalExVatCents,
    input.vatAmountCents,
    input.vatRatePercent,
    input.vatPriceMode,
    input.totalIncVatCents,
  ];
  const vatPresent = vatFields.filter((v) => v != null).length;
  if (vatPresent > 0 && vatPresent < vatFields.length) {
    warnings.push("vat_snapshot_partial", "amount_breakdown_inconsistent");
    return totalOnly;
  }
  const hasVat = vatPresent === vatFields.length;

  const original = input.originalAmountCents ?? null;
  const discount = input.discountAmountCents ?? 0;
  if ((original != null && !isCents(original)) || !isCents(discount)) {
    warnings.push("amount_breakdown_inconsistent");
    return totalOnly;
  }
  if (original == null && discount > 0) {
    warnings.push("amount_breakdown_inconsistent");
    return totalOnly;
  }

  let consistent = true;
  if (hasVat) {
    const sub = input.subtotalExVatCents as number;
    const vat = input.vatAmountCents as number;
    const inc = input.totalIncVatCents as number;
    const rate = input.vatRatePercent as number;
    if (!isCents(sub) || !isCents(vat) || !isCents(inc) || !(rate >= 0 && rate <= 100)) consistent = false;
    else if (inc !== total || sub + vat !== inc) consistent = false;
    else if (original != null) {
      const afterDiscount = original - discount;
      consistent = input.vatPriceMode === "exclusive" ? afterDiscount === sub : afterDiscount === inc;
    }
  } else if (original != null) {
    consistent = original - discount === total;
  }

  if (!consistent) {
    warnings.push("amount_breakdown_inconsistent");
    return totalOnly;
  }

  const vatDisplayable = hasVat && ctx.businessHasVatNumber;
  const listLinesAddUp = !hasVat || vatDisplayable || input.vatPriceMode === "inclusive";
  const showList = original != null && listLinesAddUp;

  return {
    totalPaidCents: total,
    originalAmountCents: showList ? original : null,
    discountAmountCents: showList && discount > 0 ? discount : null,
    subtotalExVatCents: vatDisplayable ? (input.subtotalExVatCents as number) : null,
    vatAmountCents: vatDisplayable ? (input.vatAmountCents as number) : null,
    vatRatePercent: vatDisplayable ? (input.vatRatePercent as number) : null,
    vatBreakdownDisplayable: vatDisplayable,
    warnings,
  };
}

// ── Payment method ──────────────────────────────────────────

export const MANUAL_PAYMENT_LABEL = "Recorded by BPM";

const RECEPTION_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  revolut: "Revolut",
  card: "Card",
  bank_transfer: "Bank transfer",
};

export function subscriptionPaymentMethodLabel(method: SubscriptionReceiptRow["paymentMethod"]): string {
  switch (method) {
    case "stripe":
      return "Card (online)";
    case "card":
      return "Card";
    case "cash":
      return "Cash";
    case "revolut":
      return "Revolut";
    case "bank_transfer":
      return "Bank transfer";
    case "manual":
      return MANUAL_PAYMENT_LABEL;
    case "complimentary":
      return "Complimentary";
    default: {
      // A stored value outside the union gets the neutral label, never a throw.
      const unreachable: never = method;
      void unreachable;
      return MANUAL_PAYMENT_LABEL;
    }
  }
}

export function eventPaymentMethodLabel(
  method: EventPurchaseReceiptRow["paymentMethod"],
  receptionMethod: string | null,
): string {
  switch (method) {
    case "stripe":
      return "Card (online)";
    case "manual":
      return RECEPTION_METHOD_LABELS[receptionMethod?.trim().toLowerCase() ?? ""] ?? MANUAL_PAYMENT_LABEL;
    default: {
      const unreachable: never = method;
      void unreachable;
      return MANUAL_PAYMENT_LABEL;
    }
  }
}

// ── Payment reference ───────────────────────────────────────

/**
 * Reference formats known to be safe to show a customer. Empty today:
 * stored references are `stripe:<checkout session id>` (an internal
 * Stripe id), `comp:<uuid>` (an internal id) or free text staff can edit,
 * which may contain notes. Add a pattern only for a format BPM itself
 * issues for customers.
 */
const CUSTOMER_SAFE_REFERENCE_PATTERNS: readonly RegExp[] = [];

export function toCustomerSafePaymentReference(reference: string | null | undefined): string | null {
  const ref = reference?.trim();
  if (!ref) return null;
  return CUSTOMER_SAFE_REFERENCE_PATTERNS.some((p) => p.test(ref)) ? ref : null;
}

// ── Receipt reference ───────────────────────────────────────

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Hex positions of a UUID (dashes removed) that are random in v4: skips the version nibble (12) and the variant nibble (16). */
const REFERENCE_HEX_POSITIONS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 17, 18, 19, 20, 21,
] as const;

/** Bits of the purchase UUID carried by every reference. */
export const RECEIPT_REFERENCE_BITS = REFERENCE_HEX_POSITIONS.length * 4;

const SOURCE_PREFIX: Record<ReceiptSourceType, string> = {
  subscription: "BPM-S",
  event_purchase: "BPM-E",
};

/**
 * Human-readable receipt reference derived from the immutable purchase id,
 * e.g. `BPM-S-7K3Q-9XMD-2HPA-V0RT`.
 *
 * 80 random bits of the UUID (all of them random in a v4 id), encoded as
 * 16 Crockford base32 characters. Deterministic and stable, independent
 * of any product data, and reveals nothing about sales volume. It is not
 * the raw UUID, and two purchases share a reference only if those 80 bits
 * coincide — checked against production by the receipt-reference
 * collision diagnostic.
 */
export function formatReceiptReference(sourceType: ReceiptSourceType, purchaseId: string): string {
  if (!isUuid(purchaseId)) throw new Error("Receipt references are derived from a purchase UUID.");
  const hex = purchaseId.replace(/-/g, "").toLowerCase();
  const bits = REFERENCE_HEX_POSITIONS.map((pos) => parseInt(hex[pos], 16).toString(2).padStart(4, "0")).join("");
  let encoded = "";
  for (let i = 0; i < bits.length; i += 5) {
    encoded += CROCKFORD[parseInt(bits.slice(i, i + 5), 2)];
  }
  const groups = encoded.match(/.{4}/g) ?? [encoded];
  return `${SOURCE_PREFIX[sourceType]}-${groups.join("-")}`;
}

// ── Build ───────────────────────────────────────────────────

/**
 * Events: the frozen event title. Subscriptions: none — no frozen
 * term name, validity window or style selection exists to print.
 */
function secondaryLabel(source: ReceiptSource): string | null {
  switch (source.kind) {
    case "event_purchase":
      return nonEmpty(source.row.eventTitleSnapshot);
    case "subscription":
      return null;
    default: {
      const unreachable: never = source;
      void unreachable;
      return null;
    }
  }
}

/**
 * Normalise an eligible purchase into receipt data, or explain why there
 * is no receipt. Everything the renderer needs is on the result; it never
 * has to read the raw row.
 */
export function buildReceiptData(source: ReceiptSource, ctx: ReceiptBuildContext): ReceiptBuildResult {
  const evaluated = evaluate(source);
  if (!evaluated.ok) return { ok: false, reason: evaluated.reason };
  const e = evaluated.value;
  const row = source.row;

  const amounts = normalizeReceiptAmounts(
    {
      totalPaidCents: e.totalPaidCents,
      originalAmountCents: source.kind === "subscription" ? source.row.originalPriceCents : source.row.originalAmountCents,
      discountAmountCents: row.discountAmountCents,
      subtotalExVatCents: row.subtotalExVatCents,
      vatAmountCents: row.vatAmountCents,
      vatRatePercent: row.vatRatePercent,
      vatPriceMode: row.vatPriceMode,
      totalIncVatCents: row.totalIncVatCents,
    },
    ctx,
  );

  const warnings: ReceiptWarning[] = [...amounts.warnings];
  if (e.itemNameFromLive) warnings.push("item_name_from_live_product");
  if (e.paymentRecordedAtSource === "purchased_at") warnings.push("payment_date_from_purchased_at");
  if (e.pendingRefundIgnored) warnings.push("refund_pending_not_included");

  const itemType =
    source.kind === "subscription"
      ? nonEmpty(source.row.productTypeSnapshot) ?? nonEmpty(source.row.productType)
      : nonEmpty(source.row.productTypeSnapshot);

  const paymentMethodLabel =
    source.kind === "subscription"
      ? subscriptionPaymentMethodLabel(source.row.paymentMethod)
      : eventPaymentMethodLabel(source.row.paymentMethod, source.row.receptionMethod);

  const refunded = e.refund?.refundedAmountCents ?? 0;

  return {
    ok: true,
    receipt: {
      sourceType: source.kind,
      sourceId: row.id,
      reference: formatReceiptReference(source.kind, row.id),
      customerKind: e.customerKind,
      customerName: e.customer.name,
      customerEmail: e.customer.email,
      itemName: e.itemName,
      itemType,
      itemSecondaryLabel: secondaryLabel(source),
      paymentRecordedAt: e.paymentRecordedAt,
      paymentRecordedAtSource: e.paymentRecordedAtSource,
      currency: e.currency,
      paymentMethodLabel,
      paymentReference: toCustomerSafePaymentReference(row.paymentReference),
      originalAmountCents: amounts.originalAmountCents,
      discountAmountCents: amounts.discountAmountCents,
      subtotalExVatCents: amounts.subtotalExVatCents,
      vatAmountCents: amounts.vatAmountCents,
      vatRatePercent: amounts.vatRatePercent,
      totalPaidCents: e.totalPaidCents,
      refund: e.refund,
      netPaidCents: e.totalPaidCents - refunded,
      vatBreakdownDisplayable: amounts.vatBreakdownDisplayable,
      warnings,
    },
  };
}
