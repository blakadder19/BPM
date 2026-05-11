-- First-time discount scope refinement.
--
-- Before this migration "first-time" meant "the student's first paid
-- subscription ever". That is too coarse for academies that want a
-- first-time discount to apply only to a specific entry product (e.g.
-- Beginners). This migration adds a configurable per-rule scope and
-- moves the claim uniqueness from one-global-claim-per-student to
-- one-claim-per-(student, rule) so multiple first-time rules can
-- coexist without blocking each other.
--
-- Safe / additive:
--   * No existing rows are modified.
--   * Existing rules default to first_time_scope = 'any_purchase' which
--     preserves the previous "any first purchase" semantics.
--   * The existing per-(student, claim_type) unique index is replaced
--     by a per-(student, rule_id) unique index. Every claim created by
--     this codebase already carries a non-null rule_id, so the switch
--     does not orphan any existing rows. Legacy rows where rule_id is
--     null (if any) remain but no longer participate in the unique
--     constraint — they are vestigial and harmless.

-- 1. Per-rule first-time scope on discount_rules.
alter table discount_rules
  add column if not exists first_time_scope text not null default 'any_purchase',
  add column if not exists first_time_product_ids text[];

alter table discount_rules
  drop constraint if exists discount_rules_first_time_scope_check;

alter table discount_rules
  add constraint discount_rules_first_time_scope_check
  check (first_time_scope in ('any_purchase', 'selected_products'));

-- 2. Switch discount_claims uniqueness from (student, claim_type) to
--    (student, rule_id). This unlocks multiple coexisting first-time
--    rules with disjoint scopes (e.g. one Beginners-only, one Yoga-only)
--    each tracked independently per student.
drop index if exists ux_discount_claims_active_per_student;

create unique index if not exists ux_discount_claims_active_per_rule
  on discount_claims (student_id, rule_id)
  where released_at is null and rule_id is not null;

-- Defensive: a legacy `rule_id IS NULL` active row represents
-- "consumed first-time but for which rule is unknown". Keep the
-- per-(student, claim_type) uniqueness for those legacy rows so
-- nothing can mint duplicates. Combined with the in-memory store
-- guard (lib/services/discount-claim-store.ts:tryCreate) and the
-- scope-aware subscription scan in
-- pricing-service.computeFirstTimeEligibilityByRule, this keeps a
-- student that consumed first-time pre-migration from being granted
-- a new scoped claim by accident.
create unique index if not exists ux_discount_claims_active_legacy
  on discount_claims (student_id, claim_type)
  where released_at is null and rule_id is null;

-- Helpful read path for the engine which now looks claims up by rule.
create index if not exists idx_discount_claims_student_rule
  on discount_claims (student_id, rule_id)
  where released_at is null;
