/**
 * Shared email helpers.
 *
 * Single source of truth for "is this the same email?" comparisons,
 * used by promo-code one-use-per-email enforcement (Phase 5) and any
 * other path that needs to dedupe by guest email.
 *
 * Intentionally conservative: trims + lowercases. We do NOT strip
 * Gmail `+tag` suffixes or remove dots — those are address-book
 * features customers actually use, and removing them would conflate
 * separate inboxes. The comparison stays case- and whitespace-only.
 */

export function normalizeEmail(input: string | null | undefined): string {
  return (input ?? "").trim().toLowerCase();
}

/**
 * True when both inputs normalise to the same non-empty string.
 * Empty inputs never match (so "no email on file" is never treated as
 * "same as the customer typing nothing").
 */
export function emailsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeEmail(a);
  const nb = normalizeEmail(b);
  return na.length > 0 && na === nb;
}
