-- ============================================================
-- BPM Booking System · Migration 00056
-- Phase 4: Affiliations + Discount Engine (code-first, structured)
--
-- Adds three new pieces of state plus snapshot columns:
--   * student_affiliations    — one row per (student, affiliation) pair
--   * discount_rules          — structured discount rules (no scripts/DSL)
--   * student_subscriptions   — three new columns to freeze pricing at
--                               purchase time (original / discount / applied)
--   * op_finance_audit_log    — metadata jsonb for structured discount data
--
-- Forward-safe: every new column is nullable. Legacy rows with NULL fields
-- behave exactly as before (priceCentsAtPurchase keeps the final amount).
-- No backfill required.
-- ============================================================

-- ── 1. student_affiliations ────────────────────────────────
create table if not exists student_affiliations (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references users(id) on delete cascade,
  affiliation_type    text not null,                    -- enum-like: hse, gardai, language_school, corporate, staff, other
  verification_status text not null default 'pending',  -- pending, verified, rejected, expired
  verified_at         timestamptz,
  verified_by         uuid references users(id) on delete set null,
  metadata            jsonb not null default '{}',      -- structured: employer_name, badge_no, proof_url placeholder
  valid_from          date,
  valid_until         date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_student_affiliations_student
  on student_affiliations(student_id);
create index if not exists idx_student_affiliations_active
  on student_affiliations(student_id, verification_status)
  where verification_status = 'verified';

comment on table student_affiliations is
  'Phase 4: structured student affiliations (HSE, Gardaí, language school, corporate, etc.). '
  'A verified row may be referenced by a discount_rule of type ''affiliation''.';
comment on column student_affiliations.verification_status is
  'Lifecycle: pending → verified | rejected | expired. Only ''verified'' rows make affiliation discounts apply.';
comment on column student_affiliations.metadata is
  'Structured affiliation evidence: { employerName?, badgeNumber?, schoolName?, proofUrl?, ... }. '
  'Free-form keys but no executable content.';

-- ── 2. discount_rules ──────────────────────────────────────
create table if not exists discount_rules (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null unique,              -- admin-friendly handle (e.g. "HSE_10")
  name                     text not null,                     -- human label
  description              text,
  rule_type                text not null,                     -- 'affiliation' | 'first_time_purchase'
  affiliation_type         text,                              -- required when rule_type = 'affiliation'
  discount_kind            text not null,                     -- 'percentage' | 'fixed_cents'
  discount_value           int  not null check (discount_value > 0),
  applies_to_product_types text[],                            -- null = any
  applies_to_product_ids   text[],                            -- null = any
  min_price_cents          int,                               -- gate: skip if base < min_price_cents
  max_discount_cents       int,                               -- cap: applied discount never exceeds this
  is_active                boolean not null default true,
  priority                 int     not null default 0,        -- higher applies first
  stackable                boolean not null default false,
  valid_from               timestamptz,
  valid_until              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_discount_rules_active
  on discount_rules(is_active, priority desc);

comment on table discount_rules is
  'Phase 4: structured discount rules. NO formulas / NO DSL — pure enums + numeric fields. '
  'Engine evaluates rules against (product, student, affiliations, isFirstTime) at purchase time.';
comment on column discount_rules.rule_type is
  'Enum-like: ''affiliation'' (requires affiliation_type), ''first_time_purchase''. '
  'Add new types only by extending the engine; never as free-form rules.';
comment on column discount_rules.stackable is
  'When false (default), this rule does not combine with any other applied rule. '
  'When true, can stack with other rules whose stackable=true.';

-- ── 3. student_subscriptions: pricing snapshot fields ─────
alter table student_subscriptions
  add column if not exists original_price_cents  int,
  add column if not exists discount_amount_cents int not null default 0,
  add column if not exists applied_discount      jsonb;

comment on column student_subscriptions.original_price_cents is
  'List price of the product at purchase time. NULL on legacy rows. '
  'price_cents_at_purchase always remains the FINAL paid amount (= original - discount).';
comment on column student_subscriptions.discount_amount_cents is
  'Total discount applied at purchase time. 0 when no discount. NEVER recomputed.';
comment on column student_subscriptions.applied_discount is
  'Frozen array of applied discount snapshots: [{ ruleId, code, name, ruleType, discountKind, '
  'discountValue, amountCents, affiliationType?, affiliationId?, reason }]. NULL = no discount applied.';

-- ── 4. op_finance_audit_log: structured metadata ──────────
alter table op_finance_audit_log
  add column if not exists metadata jsonb;

comment on column op_finance_audit_log.metadata is
  'Phase 4: structured event metadata (e.g. applied discount snapshot, original/final price). '
  'NULL when an event has no structured metadata. detail/previous_value/new_value remain free-text.';
