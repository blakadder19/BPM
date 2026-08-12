/**
 * Phase 11 — pure URL-tab → internal-typeFilter mapper for the
 * student catalog. Lives in its own module (not `student-catalog.tsx`)
 * so it can be unit-tested without pulling in the transitive
 * "server-only" import chain from `catalog-purchase.ts` /
 * `stripe-checkout.ts` etc.
 *
 * Contract: unknown / malformed values always resolve to "all". A bad
 * link (e.g. `?tab=💥`) must never crash the page or hide the catalog.
 */

const TAB_QUERY_TO_FILTER: Record<string, string> = {
  all: "all",
  memberships: "membership",
  membership: "membership",
  passes: "pass",
  pass: "pass",
  "drop-ins": "drop_in",
  "drop-in": "drop_in",
  dropins: "drop_in",
  dropin: "drop_in",
  drop_in: "drop_in",
};

export function resolveInitialTypeFilter(rawTab: string | null): string {
  if (!rawTab) return "all";
  return TAB_QUERY_TO_FILTER[rawTab.trim().toLowerCase()] ?? "all";
}
