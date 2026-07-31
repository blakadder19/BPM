-- Phase 10 — student-referral 10% beginner discount.
--
-- Seeds a single `referral` discount rule that grants 10% off the
-- eligible beginner products (Beginners 1 & 2 Promo Pass, Latin
-- Combo) when a purchaser applies another student's referral code
-- at checkout. Eligibility is enforced by the pricing engine's
-- level-driven predicate (see `isReferralDiscountEligibleProduct`),
-- so the `applies_to_product_ids` allow-list below is a defensive
-- belt-and-braces limit and NOT the source of truth.
--
-- Safe / additive:
--   * The `discount_rules.rule_type` column is `text` with no CHECK
--     constraint restricting values, so no schema change is needed
--     to accept the new "referral" type — a fresh insert is enough.
--   * Uses ON CONFLICT (code) DO NOTHING so re-runs are idempotent
--     and admins are free to edit the row via /discount-rules after
--     the initial seed (validity window, priority, stackable, etc).
--   * The discount code is FIXED — students never type it. The
--     engine ignores the `code` column when matching referral rules;
--     any non-empty referral code entered at checkout triggers the
--     rule provided the product is beginner-eligible.

insert into discount_rules (
  code,
  name,
  description,
  rule_type,
  affiliation_type,
  discount_kind,
  discount_value,
  applies_to_product_types,
  applies_to_product_ids,
  min_price_cents,
  max_discount_cents,
  is_active,
  priority,
  stackable,
  valid_from,
  valid_until,
  first_time_scope,
  first_time_product_ids
) values (
  'REFERRAL_BEGINNERS_10',
  'Referral 10% off Beginners',
  '10% off eligible beginner products when a purchaser applies another student''s referral code.',
  'referral',
  null,
  'percentage',
  10,
  null,
  null,   -- allow-list is data-driven by product allowed_levels; keep null for real DB
  null,
  null,
  true,
  4,      -- < first_time (5) so first-time wins when both apply
  false,
  null,
  null,
  'any_purchase',
  null
)
on conflict (code) do nothing;

comment on column discount_rules.rule_type is
  'Enum-like: ''affiliation'' (requires affiliation_type), ''first_time_purchase'', ''event_promo_code'', ''referral''. '
  'Add new types only by extending the engine; never as free-form rules.';
