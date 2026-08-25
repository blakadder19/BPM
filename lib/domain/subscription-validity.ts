/**
 * Phase 14 — Single source of truth for pass/membership expiry.
 *
 * Purchase paths (student catalog, admin manual assign, Stripe fulfil,
 * dev tools) used to inline the same "term_end vs duration_days"
 * logic in slightly different ways. That drift is exactly what
 * produced the Silver-Class-Pass-runs-into-next-term bug Zaria
 * flagged: a term-based product with `termBound: false` and
 * `durationDays > 0` fell through to `today + N days`, silently
 * carrying entitlement into the next term.
 *
 * This helper is pure — no IO, no auth, no repository access. Callers
 * are responsible for looking up the term, the next consecutive term
 * (for `spanTerms >= 2` products), and today's date. That keeps this
 * module trivially testable and free of Next.js / Supabase deps so
 * every purchase path can safely import it.
 *
 * Business rule (per Zaria):
 *   * Term-based passes and memberships MUST expire on the last
 *     calendar date of the selected term (or the last term when
 *     the product spans multiple consecutive terms).
 *   * Rolling / drop-in / fixed-duration products keep their
 *     current `today + durationDays` expiry.
 *   * Open-ended products (no term, no duration) keep `null`
 *     `validUntil` — used by drop-ins.
 *
 * Adding an explicit `expiryMode` column on `products` was
 * considered but rejected for MVP: the classifier here derives
 * behaviour from existing fields (`termBound`, `durationDays`), so
 * no schema migration is needed to ship the correctness fix.
 * Admins can retrofit a mis-classified product (e.g. an old Silver
 * Class Pass that has `termBound: false, durationDays: 28`) by
 * flipping `termBound=true` from the Admin → Products form. That's
 * documented in the migration notes.
 */

import type { MockProduct, MockTerm } from "@/lib/mock-data";

// ── Types ────────────────────────────────────────────────────

/**
 * Three canonical expiry behaviours. `open_ended` covers drop-in
 * credit packs that never expire until credits run out.
 */
export type ValidityMode = "term_end" | "fixed_duration" | "open_ended";

/**
 * The subset of `MockProduct` fields the classifier + validity
 * calculator care about. Kept as a narrow `Pick` so tests can pass
 * minimal fixtures without instantiating full products.
 */
export type ValidityProduct = Pick<
  MockProduct,
  "id" | "productType" | "termBound" | "spanTerms" | "durationDays"
>;

export interface ComputeValidityInput {
  product: ValidityProduct;
  /** ISO YYYY-MM-DD (or ISO datetime that will be sliced to 10 chars). */
  purchaseDate: string;
  /**
   * The term the student/admin explicitly selected at purchase time.
   * Null when the caller couldn't resolve one (e.g. drop-in or a
   * rolling product where no term picker was shown).
   */
  chosenTerm: MockTerm | null;
  /**
   * The consecutive term after `chosenTerm` — required (and consumed)
   * only when `product.spanTerms >= 2`. Callers can pass `null` if
   * the product spans 1 term; the helper never reads it then.
   */
  nextConsecutiveTerm?: MockTerm | null;
}

export interface ComputedValidity {
  mode: ValidityMode;
  termId: string | null;
  validFrom: string;
  validUntil: string | null;
  /**
   * Display-only label ("Term 5", "Term 5 + Term 6"). Callers use it
   * to build the subscription row's `assignedTermName` audit field
   * and to render the term chip in the UI.
   */
  assignedTermName: string | null;
}

export type ValidityError =
  | { kind: "term_bound_without_term"; message: string }
  | { kind: "span_term_missing_next"; message: string }
  | { kind: "term_end_before_start"; message: string };

export type ComputeValidityResult =
  | { ok: true; validity: ComputedValidity }
  | { ok: false; error: ValidityError };

// ── Classifier ───────────────────────────────────────────────

/**
 * Decide which `ValidityMode` a product should use.
 *
 *   * `termBound: true` → `term_end`. Requires a chosen term at
 *     purchase time (enforced separately in `computeSubscriptionValidity`).
 *   * `termBound: false` && `durationDays != null && > 0` →
 *     `fixed_duration`.
 *   * Otherwise → `open_ended`.
 *
 * Kept as its own named export so admin diagnostics (e.g. a
 * one-off script listing which products would be reclassified) can
 * reuse the exact same rule the runtime uses.
 */
export function classifyExpiryMode(product: ValidityProduct): ValidityMode {
  if (product.termBound) return "term_end";
  if (typeof product.durationDays === "number" && product.durationDays > 0) {
    return "fixed_duration";
  }
  return "open_ended";
}

// ── Date helpers ─────────────────────────────────────────────

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Native-Date based `today + N days` calculator. Kept as a helper so
 * the `fixed_duration` branch is trivially auditable — Zaria's report
 * asked for the exact date math to be visible in one place.
 *
 * The result is a UTC-normalised YYYY-MM-DD string. Callers on the
 * hot path already pass `getTodayStr()` (which follows the shop's
 * timezone) as `purchaseDate`, so timezone-drift is handled outside
 * this helper.
 */
export function addDaysISO(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// ── Main helper ──────────────────────────────────────────────

/**
 * Compute the canonical `(validFrom, validUntil, termId, mode,
 * assignedTermName)` tuple for a new subscription row.
 *
 * Contract:
 *   * `product.termBound === true` and `chosenTerm == null` → error.
 *     A term-based purchase without a term is a programming bug in
 *     the caller (or a malicious client) — never silently fall
 *     through to a duration-days expiry.
 *   * `product.spanTerms >= 2` and `nextConsecutiveTerm == null` →
 *     error. The admin needs to create the next term before selling
 *     a span-2 product.
 *   * If a term IS provided even for a non-term-bound product (e.g.
 *     the admin manually pinned a rolling pass to a term), the
 *     helper respects that: the term wins. That matches the
 *     existing admin-side behaviour and prevents admins from
 *     accidentally re-introducing over-run expiry.
 *   * `chosenTerm.endDate < resolved validFrom` → error. This
 *     catches nonsensical inputs (e.g. buying a term-5 pass after
 *     term-5 has already ended) rather than persisting a broken row.
 */
export function computeSubscriptionValidity(
  input: ComputeValidityInput,
): ComputeValidityResult {
  const { product, purchaseDate, chosenTerm, nextConsecutiveTerm } = input;
  const today = toDateOnly(purchaseDate);
  const mode = classifyExpiryMode(product);

  // ── Term-based branch ────────────────────────────────────
  if (mode === "term_end") {
    if (!chosenTerm) {
      return {
        ok: false,
        error: {
          kind: "term_bound_without_term",
          message:
            "This product is term-based but no term was selected. Please pick a term to continue.",
        },
      };
    }

    const spanTerms = product.spanTerms ?? 1;
    let validUntil = chosenTerm.endDate;
    let assignedTermName: string = chosenTerm.name;

    if (spanTerms >= 2) {
      if (!nextConsecutiveTerm) {
        return {
          ok: false,
          error: {
            kind: "span_term_missing_next",
            message: `This product spans ${spanTerms} terms but the next term after "${chosenTerm.name}" is not available. Please create the next term first.`,
          },
        };
      }
      validUntil = nextConsecutiveTerm.endDate;
      assignedTermName = `${chosenTerm.name} + ${nextConsecutiveTerm.name}`;
    }

    const validFrom = chosenTerm.startDate;
    if (validUntil < validFrom) {
      return {
        ok: false,
        error: {
          kind: "term_end_before_start",
          message: `Selected term "${chosenTerm.name}" ends before it starts — this is a data error, please contact an admin.`,
        },
      };
    }

    return {
      ok: true,
      validity: {
        mode: "term_end",
        termId: chosenTerm.id,
        validFrom,
        validUntil,
        assignedTermName,
      },
    };
  }

  // ── Non-term-based branches, but term explicitly provided ─
  //
  // If the admin picked a term for a product that isn't marked
  // term-bound, honour that pick and treat this as a term_end
  // subscription anyway. Same rationale as the block above:
  // never silently over-run into the next term.
  if (chosenTerm) {
    let validUntil = chosenTerm.endDate;
    let assignedTermName: string = chosenTerm.name;
    const spanTerms = product.spanTerms ?? 1;
    if (spanTerms >= 2) {
      if (!nextConsecutiveTerm) {
        return {
          ok: false,
          error: {
            kind: "span_term_missing_next",
            message: `This product spans ${spanTerms} terms but the next term after "${chosenTerm.name}" is not available. Please create the next term first.`,
          },
        };
      }
      validUntil = nextConsecutiveTerm.endDate;
      assignedTermName = `${chosenTerm.name} + ${nextConsecutiveTerm.name}`;
    }
    if (validUntil < chosenTerm.startDate) {
      return {
        ok: false,
        error: {
          kind: "term_end_before_start",
          message: `Selected term "${chosenTerm.name}" ends before it starts — this is a data error, please contact an admin.`,
        },
      };
    }
    return {
      ok: true,
      validity: {
        mode: "term_end",
        termId: chosenTerm.id,
        validFrom: chosenTerm.startDate,
        validUntil,
        assignedTermName,
      },
    };
  }

  // ── Fixed-duration branch ───────────────────────────────
  if (mode === "fixed_duration") {
    const days = product.durationDays!;
    return {
      ok: true,
      validity: {
        mode: "fixed_duration",
        termId: null,
        validFrom: today,
        validUntil: addDaysISO(today, days),
        assignedTermName: null,
      },
    };
  }

  // ── Open-ended branch (drop-ins etc) ────────────────────
  return {
    ok: true,
    validity: {
      mode: "open_ended",
      termId: null,
      validFrom: today,
      validUntil: null,
      assignedTermName: null,
    },
  };
}

// ── Extend-expiry validation ─────────────────────────────────

export type ExtendValidityErrorKind =
  | "missing_reason"
  | "no_current_expiry"
  | "not_after_current"
  | "invalid_date";

export interface ExtendValidityInput {
  currentValidUntil: string | null;
  newValidUntil: string;
  reason: string;
}

export type ExtendValidityResult =
  | { ok: true }
  | { ok: false; kind: ExtendValidityErrorKind; message: string };

/**
 * Pure validation for `extendSubscriptionAction`. Kept here (not in
 * the action) so tests can exercise every failure branch without
 * mocking auth / repos.
 *
 * Rules:
 *   * `reason` must be non-empty.
 *   * `newValidUntil` must parse as a YYYY-MM-DD date.
 *   * The subscription must currently HAVE an expiry to extend
 *     (open-ended drop-ins are not extendable — they don't expire).
 *   * `newValidUntil` must be strictly AFTER `currentValidUntil`.
 *     Same-day is rejected as a no-op. Earlier-than-current is
 *     rejected as "not an extension".
 */
export function validateSubscriptionExtension(
  input: ExtendValidityInput,
): ExtendValidityResult {
  const reason = (input.reason ?? "").trim();
  if (!reason) {
    return {
      ok: false,
      kind: "missing_reason",
      message: "A reason is required to extend a subscription.",
    };
  }
  const raw = (input.newValidUntil ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return {
      ok: false,
      kind: "invalid_date",
      message: "New expiry must be a valid date (YYYY-MM-DD).",
    };
  }
  if (!input.currentValidUntil) {
    return {
      ok: false,
      kind: "no_current_expiry",
      message: "This subscription has no expiry to extend.",
    };
  }
  if (raw <= input.currentValidUntil) {
    return {
      ok: false,
      kind: "not_after_current",
      message: "New expiry must be after the current expiry.",
    };
  }
  return { ok: true };
}
