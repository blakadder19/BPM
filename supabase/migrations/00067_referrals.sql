-- Referral programme MVP (Phase 3).
--
-- Tracks when existing students refer beginners, and lets admins
-- manually approve rewards once a referrer reaches a threshold.
--
-- Design constraints (do NOT regress):
--   * Referrals MUST NOT be modelled as affiliations. This is a
--     separate domain — affiliations gate discounts on the affiliated
--     student, referrals reward the REFERRER.
--   * Reward redemption is admin-approved + admin-applied. Nothing
--     auto-applies on purchase.
--   * Additive only: no destructive changes, no enum widening, all
--     columns nullable / defaulted so existing rows keep working.
--
-- ────────────────────────────────────────────────────────────
-- 1. Per-student referral code
-- ────────────────────────────────────────────────────────────
--
-- Lives on `users` so every student has at most one stable code,
-- mirroring the precedent of `student_qr_token`. We do not backfill
-- here — codes are allocated lazily on first read by
-- lib/services/referral-store.ts.

alter table users
  add column if not exists referral_code text;

-- Case-insensitive uniqueness so "BPM-AB12" and "bpm-ab12" cannot
-- both exist. Partial index ignores NULL (unallocated) rows.
create unique index if not exists users_referral_code_lower_unique
  on users (lower(referral_code))
  where referral_code is not null;

-- ────────────────────────────────────────────────────────────
-- 2. student_referrals
-- ────────────────────────────────────────────────────────────
--
-- One row per "<referrer> referred <beginner>" relationship.
-- Status lifecycle:
--   pending  → verified  → rewarded   (happy path)
--   pending  → rejected                (abuse / not eligible)
-- `referred_student_id` may be NULL when the referred person signed
-- up via email but hasn't claimed an account yet. `referral_code` is
-- the literal code the beginner entered (or NULL for admin-entered).
create table if not exists student_referrals (
  id                    uuid primary key default gen_random_uuid(),
  referrer_student_id   uuid not null references users(id) on delete cascade,
  referred_student_id   uuid     references users(id) on delete set null,
  referred_email        text,
  referral_code         text,
  status                text not null default 'pending',
  verified_at           timestamptz,
  verified_by           uuid     references users(id) on delete set null,
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint student_referrals_status_check
    check (status in ('pending','verified','rejected','rewarded')),
  -- Abuse prevention: a student cannot refer themselves.
  constraint student_referrals_no_self_referral
    check (referrer_student_id <> referred_student_id),
  -- Abuse prevention: a referred beginner can have at most one
  -- non-rejected referral per referrer. (Rejected rows are kept for
  -- audit but do not block a corrected re-entry.)
  constraint student_referrals_unique_active
    unique nulls not distinct (referrer_student_id, referred_student_id, referred_email)
);

create index if not exists idx_student_referrals_referrer
  on student_referrals (referrer_student_id, status);
create index if not exists idx_student_referrals_referred
  on student_referrals (referred_student_id);

-- ────────────────────────────────────────────────────────────
-- 3. referral_rewards
-- ────────────────────────────────────────────────────────────
--
-- Created manually by admin once the referrer has enough verified
-- referrals. The reward is described by `discount_kind` /
-- `discount_value` but is NOT auto-applied — admin records
-- `applied_subscription_id` when the reward is honoured at
-- reception / catalog purchase.
--
-- Status lifecycle:
--   pending → approved → applied      (happy path)
--   pending → cancelled
--   approved → cancelled              (revoked before applied)
create table if not exists referral_rewards (
  id                       uuid primary key default gen_random_uuid(),
  referrer_student_id      uuid not null references users(id) on delete cascade,
  term_id                  uuid     references terms(id) on delete set null,
  verified_referral_count  int  not null default 0,
  reward_type              text not null default 'membership_discount',
  discount_kind            text not null,
  discount_value           int  not null check (discount_value > 0),
  status                   text not null default 'pending',
  approved_by              uuid     references users(id) on delete set null,
  approved_at              timestamptz,
  applied_subscription_id  uuid     references student_subscriptions(id) on delete set null,
  applied_at               timestamptz,
  cancelled_at             timestamptz,
  cancelled_reason         text,
  note                     text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint referral_rewards_status_check
    check (status in ('pending','approved','applied','cancelled')),
  constraint referral_rewards_kind_check
    check (discount_kind in ('percentage','fixed_cents')),
  constraint referral_rewards_percentage_range
    check (discount_kind <> 'percentage' or discount_value <= 100)
);

create index if not exists idx_referral_rewards_referrer
  on referral_rewards (referrer_student_id, status);
