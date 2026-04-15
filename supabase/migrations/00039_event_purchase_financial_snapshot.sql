-- ============================================================
-- BPM Booking System · Migration 00039
-- Add financial snapshot fields to event_purchases so revenue
-- reporting is historically accurate even if products change.
-- ============================================================

ALTER TABLE event_purchases
  ADD COLUMN IF NOT EXISTS unit_price_cents_at_purchase integer,
  ADD COLUMN IF NOT EXISTS original_amount_cents integer,
  ADD COLUMN IF NOT EXISTS discount_amount_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS product_name_snapshot text,
  ADD COLUMN IF NOT EXISTS product_type_snapshot text;

-- Backfill existing purchases from the linked product row.
-- This is approximate for legacy rows (uses the *current* product price)
-- but better than leaving them null.
UPDATE event_purchases ep
SET
  unit_price_cents_at_purchase = p.price_cents,
  original_amount_cents        = p.price_cents,
  discount_amount_cents        = 0,
  paid_amount_cents             = CASE WHEN ep.payment_status = 'paid' THEN p.price_cents ELSE 0 END,
  currency                      = 'eur',
  product_name_snapshot         = p.name,
  product_type_snapshot         = p.product_type
FROM event_products p
WHERE ep.event_product_id = p.id
  AND ep.unit_price_cents_at_purchase IS NULL;
