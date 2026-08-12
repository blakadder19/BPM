-- Phase 11 — INTERNAL QA test promo code (100% off, event-scoped).
--
-- Seeds a disabled placeholder `event_promo_code` row so an admin can
-- open Admin -> Discount rules, tick the relevant event ticket(s) in
-- the "Applies to event product ids" picker, and flip is_active=true.
-- Prod event product ids are not known to this migration (each
-- environment has its own UUIDs) so we deliberately DO NOT hard-code
-- them here.
--
-- Safety belts:
--   * is_active = false — the rule is not evaluated by
--     priceEventTicketForStudent until admin activates it.
--   * applies_to_event_product_ids = NULL — an event_promo_code rule
--     with no event scope is skipped by the engine anyway
--     (lib/domain/pricing-engine.ts case "event_promo_code" +
--      appliesToEventProductIds check), so even if isActive gets
--     flipped without scoping the rule stays dormant.
--   * max_uses = 20 — belt-and-braces cap so a leaked test code
--     cannot drain a real event.
--   * one_use_per_email = false — QA can burn multiple test tickets
--     from a single inbox.
--   * discount_value = 100 (percent) — permitted by
--     lib/actions/discount-rules.ts (only > 100 is rejected).
--
-- Idempotent: ON CONFLICT (code) DO NOTHING preserves any admin edits
-- (scoping, activation, extending validity) on subsequent deploys.

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
  applies_to_event_product_ids,
  min_price_cents,
  max_discount_cents,
  is_active,
  priority,
  stackable,
  valid_from,
  valid_until,
  first_time_scope,
  first_time_product_ids,
  requires_code,
  max_uses,
  one_use_per_email
) values (
  'BPM_TEST_100',
  'Internal QA — 100% off event ticket',
  'Internal test promo code used by BPM QA to verify guest event checkout, GTM and Meta Pixel conversion firing end-to-end at €0 total. Restricted to specific event tickets only. Scope + activation is set from the admin /discount-rules panel.',
  'event_promo_code',
  null,
  'percentage',
  100,
  null,
  null,
  null,     -- admin scopes this to specific event product ids from the panel
  null,
  null,
  false,    -- disabled by default; admin flips this on when running a QA session
  10,
  false,
  null,
  null,
  'any_purchase',
  null,
  true,
  20,       -- max 20 test purchases across the entire code's lifetime
  false
)
on conflict (code) do nothing;
