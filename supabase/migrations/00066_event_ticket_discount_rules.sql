-- Event-ticket discount rules (Phase 2).
--
-- Lets the existing discount-rule catalogue target event tickets
-- (`event_products`) in addition to the subscription-product catalogue
-- (memberships / passes / drop-ins).
--
-- Safe / additive:
--   * `applies_to_event_product_ids` is nullable; existing rules retain
--     NULL and continue to behave exactly as before (subscription-only).
--   * `applied_discount` snapshot on event_purchases is nullable too;
--     existing rows (and any purchase that received no discount) keep a
--     clean NULL. New columns never invalidate previous reads.
--   * No data is rewritten and no columns are renamed/dropped.
--
-- Scope semantics (enforced in lib/domain/pricing-engine.ts):
--   * A rule with `applies_to_event_product_ids` set is event-ticket
--     scoped and never applies to subscription products.
--   * Existing rules with `applies_to_product_ids` / `applies_to_product_types`
--     stay subscription-only and never apply to event tickets.
--   * A rule with neither set is treated as "all subscription products"
--     (legacy behaviour) — it does NOT silently become "all event tickets
--     too", which would be a surprising regression.

-- 1. Event-product scope on discount rules.
alter table discount_rules
  add column if not exists applies_to_event_product_ids text[];

-- 2. Frozen pricing snapshot on event purchases.
--
-- Mirrors `student_subscriptions.applied_discount` (jsonb) so historical
-- event purchases retain the exact discount detail at the moment of
-- sale, immune to later rule edits or deletions. Used by Finance views
-- and webhook fulfillment to render the consistent breakdown.
alter table event_purchases
  add column if not exists applied_discount jsonb;
