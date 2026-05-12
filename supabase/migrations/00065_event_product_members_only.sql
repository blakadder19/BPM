-- Members-only event tickets.
--
-- Adds a single boolean flag to event_products so admins can mark
-- specific tickets / passes as restricted to students with an active
-- membership. Server-side enforcement lives in
-- lib/actions/event-purchase.ts and lib/actions/stripe-checkout.ts and
-- uses lib/domain/active-membership.ts to check eligibility.
--
-- Safe / additive:
--   * Existing rows default to members_only = false (public),
--     preserving current behaviour.
--   * No destructive changes; no data is rewritten.

alter table event_products
  add column if not exists members_only boolean not null default false;
