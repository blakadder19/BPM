-- Add financial snapshot fields to op_subscriptions
-- Captures the price at the time of purchase/assignment so historical
-- finance reporting remains correct even if product prices are edited later.

ALTER TABLE op_subscriptions
  ADD COLUMN IF NOT EXISTS price_cents_at_purchase integer,
  ADD COLUMN IF NOT EXISTS currency_at_purchase text NOT NULL DEFAULT 'EUR';

-- Backfill existing rows from the linked product's current price.
-- op_subscriptions.product_id is TEXT while products.id is UUID,
-- so we cast to text for the comparison.
UPDATE op_subscriptions s
  SET price_cents_at_purchase = p.price_cents
  FROM products p
  WHERE s.product_id = p.id::text
    AND s.price_cents_at_purchase IS NULL;
