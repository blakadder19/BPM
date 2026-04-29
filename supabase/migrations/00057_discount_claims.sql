-- Phase 4 hardening — atomic prevention of first-time discount race.
--
-- The discount engine snapshot model alone could not guarantee that two
-- concurrent purchase flows would not BOTH succeed in claiming the
-- first-time-purchase discount. This table provides the authoritative
-- atomic gate via a partial unique index: only one ACTIVE claim per
-- (student_id, claim_type) may exist at any time. Released claims
-- (released_at IS NOT NULL) are kept for audit but do not block.
--
-- Refunds DO NOT release the claim — the student has consumed the
-- benefit. The release path exists only for cases where a discounted
-- checkout was never finalized (e.g. Stripe session creation failed
-- AFTER the claim was recorded).

create table if not exists discount_claims (
  id text primary key,
  student_id text not null,
  claim_type text not null check (claim_type in ('first_time_purchase')),
  rule_id text,
  source text not null,
  related_subscription_id text,
  related_session_id text,
  released_at timestamptz,
  released_reason text,
  claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Atomicity primitive: only one ACTIVE first-time claim per student.
-- Concurrent INSERTs that would violate this constraint receive
-- PostgreSQL error 23505 (unique_violation) which the repository
-- translates into a "claim denied" result.
create unique index if not exists ux_discount_claims_active_per_student
  on discount_claims (student_id, claim_type)
  where released_at is null;

create index if not exists idx_discount_claims_student
  on discount_claims (student_id);

create index if not exists idx_discount_claims_session
  on discount_claims (related_session_id)
  where related_session_id is not null;
