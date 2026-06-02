-- 00072 — Stripe refund metadata for student_subscriptions + event_purchases
--
-- Adds the columns we need to back the new "Issue Stripe refund" admin
-- action with real Stripe-side bookkeeping:
--
--   * stripe_refund_id          — the `re_…` id returned by stripe.refunds.create
--                                  (the most recent one when multiple partial
--                                  refunds are issued; full history lives in
--                                  op_finance_audit_log.metadata).
--   * refunded_amount_cents     — cumulative amount refunded so far. Lets us
--                                  block over-refunds and support partials.
--   * refund_status             — Stripe-side refund state at the time of the
--                                  last refund attempt: "succeeded" |
--                                  "pending" | "failed". Useful when async
--                                  refund methods (e.g. SEPA) are later
--                                  enabled or when refund.updated webhook
--                                  events arrive.
--
-- These are additive and nullable / default-zero so existing rows continue
-- to work. Pre-existing manual refunds (paymentStatus already 'refunded'
-- via the BPM-only flow) retain their full audit trail; only new Stripe
-- refunds populate the columns below.

alter table student_subscriptions
  add column if not exists stripe_refund_id text,
  add column if not exists refunded_amount_cents int not null default 0,
  add column if not exists refund_status text;

alter table student_subscriptions
  add constraint student_subscriptions_refunded_amount_nonneg
    check (refunded_amount_cents >= 0)
    not valid;

alter table event_purchases
  add column if not exists stripe_refund_id text,
  add column if not exists refunded_amount_cents int not null default 0,
  add column if not exists refund_status text;

alter table event_purchases
  add constraint event_purchases_refunded_amount_nonneg
    check (refunded_amount_cents >= 0)
    not valid;

comment on column student_subscriptions.stripe_refund_id is
  'Most recent Stripe refund id (re_...) for this subscription. Full history in op_finance_audit_log.';
comment on column student_subscriptions.refunded_amount_cents is
  'Cumulative amount refunded so far. paymentStatus flips to refunded when refunded_amount_cents >= price_cents_at_purchase.';
comment on column student_subscriptions.refund_status is
  'Stripe-side refund state for the last refund attempt: succeeded | pending | failed.';

comment on column event_purchases.stripe_refund_id is
  'Most recent Stripe refund id (re_...) for this event purchase. Full history in op_finance_audit_log.';
comment on column event_purchases.refunded_amount_cents is
  'Cumulative amount refunded so far. paymentStatus flips to refunded when refunded_amount_cents >= paid_amount_cents.';
comment on column event_purchases.refund_status is
  'Stripe-side refund state for the last refund attempt: succeeded | pending | failed.';
