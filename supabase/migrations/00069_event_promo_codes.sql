-- Event promo codes (Phase 5).
--
-- Extends `discount_rules` so admins can author "promo code" rules that
-- collaborators (Angelica, partner studios, the HSE staff Latin Legends
-- night, etc.) can hand out. The customer types the code at event
-- checkout (logged-in student OR guest) and gets the discount applied
-- server-side. Promo-code rules NEVER fire on subscription/membership
-- pricing — they are event-ticket-only by construction.
--
-- Design choices documented for future maintainers:
--
--   * Reuse `discount_rules` rather than a new `promo_codes` table.
--     A promo-code rule is just another row whose `rule_type` =
--     'event_promo_code', backed by the same scope, validity window,
--     discount kind/value, priority, stackable fields, and the existing
--     `applies_to_event_product_ids` array added by migration 00066.
--     This keeps the pricing engine single-source-of-truth.
--   * Reuse the existing `code` column as the customer-typed code.
--     There is already a unique index on `discount_rules.code`, so
--     promo-code uniqueness comes for free. Affiliation/first-time
--     rules also have a `code` (HSE_10, FIRST_TIME_10) but those are
--     admin handles — they are never accepted at checkout because the
--     engine only matches `event_promo_code` rules against the
--     customer-supplied code.
--   * Usage counts (max_uses, one_use_per_email) are derived from
--     existing `event_purchases.applied_discount` snapshots — no
--     separate `discount_redemptions` table. The frozen pricing
--     snapshot is already the system-of-record for "this purchase
--     consumed this rule"; the service layer counts paid+pending
--     rows whose snapshot's `appliedDiscounts[].ruleId` matches the
--     rule, then enforces the limit BEFORE creating a new purchase.
--     Trade-off: small race window between count and insert, accepted
--     for MVP because (a) collaborator codes are low-volume, (b)
--     frozen snapshots already provide the auditable count, (c) no
--     extra table to keep in sync with refunds.
--
-- Safe / additive:
--   * All three columns are nullable or have safe defaults; existing
--     rules continue to behave identically.
--   * No enum widening (`rule_type` is `text`, not an enum).
--   * No data rewrite; no FK or index change beyond the new partial
--     index for lookup-by-code.

-- 1. Requires-code flag.
--
-- True for `event_promo_code` rules (the customer MUST type the code
-- for the rule to fire). False for the legacy affiliation /
-- first-time rules (their `code` is just an admin handle).
alter table discount_rules
  add column if not exists requires_code boolean not null default false;

-- 2. Max total uses, counted from paid+pending event purchases that
-- carry the rule in their frozen snapshot.
alter table discount_rules
  add column if not exists max_uses int;

alter table discount_rules
  add constraint discount_rules_max_uses_check
  check (max_uses is null or max_uses > 0);

-- 3. One-use-per-email/student gate. When true, the same student
-- (logged-in) or the same guest email cannot purchase a discounted
-- event ticket more than once using this rule.
alter table discount_rules
  add column if not exists one_use_per_email boolean not null default false;

-- Lookup index for the checkout path: case-insensitive code lookup
-- restricted to active promo-code rules.
create index if not exists idx_discount_rules_promo_code_active
  on discount_rules (lower(code))
  where rule_type = 'event_promo_code' and is_active = true;
