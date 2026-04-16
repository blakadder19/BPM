-- ============================================================
-- 00047 — Unify subscriptions onto student_subscriptions
--
-- Adds operational + financial columns that previously only lived
-- in op_subscriptions so that student_subscriptions becomes the
-- single canonical subscription table.
-- ============================================================

-- ── 1. Add new columns ──────────────────────────────────────

ALTER TABLE student_subscriptions
  ADD COLUMN IF NOT EXISTS selected_style_ids    text[],
  ADD COLUMN IF NOT EXISTS renewed_from_id       uuid REFERENCES student_subscriptions(id),
  ADD COLUMN IF NOT EXISTS paid_at               timestamptz,
  ADD COLUMN IF NOT EXISTS payment_reference     text,
  ADD COLUMN IF NOT EXISTS payment_notes         text,
  ADD COLUMN IF NOT EXISTS collected_by          text,
  ADD COLUMN IF NOT EXISTS price_cents_at_purchase integer,
  ADD COLUMN IF NOT EXISTS currency_at_purchase  text DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS refunded_at           timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by           text,
  ADD COLUMN IF NOT EXISTS refund_reason         text;

-- ── 2. Backfill from op_subscriptions where IDs match ───────
-- op_subscriptions uses text IDs; only UUID-format rows can join.

UPDATE student_subscriptions ss
SET
  price_cents_at_purchase = COALESCE(ss.price_cents_at_purchase, op.price_cents_at_purchase),
  currency_at_purchase    = COALESCE(ss.currency_at_purchase, op.currency_at_purchase),
  paid_at                 = COALESCE(ss.paid_at, op.paid_at::timestamptz),
  payment_reference       = COALESCE(ss.payment_reference, op.payment_reference),
  payment_notes           = COALESCE(ss.payment_notes, op.payment_notes),
  collected_by            = COALESCE(ss.collected_by, op.collected_by),
  refunded_at             = COALESCE(ss.refunded_at, op.refunded_at),
  refunded_by             = COALESCE(ss.refunded_by, op.refunded_by),
  refund_reason           = COALESCE(ss.refund_reason, op.refund_reason)
FROM op_subscriptions op
WHERE op.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND op.id::uuid = ss.id;

-- ── 3. Backfill snapshot price from products for any remaining nulls ─

UPDATE student_subscriptions ss
SET price_cents_at_purchase = p.price_cents
FROM products p
WHERE ss.product_id = p.id
  AND ss.price_cents_at_purchase IS NULL;

-- ── 4. Index for renewal chain lookups ──────────────────────

CREATE INDEX IF NOT EXISTS idx_subscriptions_renewed_from
  ON student_subscriptions (renewed_from_id)
  WHERE renewed_from_id IS NOT NULL;
