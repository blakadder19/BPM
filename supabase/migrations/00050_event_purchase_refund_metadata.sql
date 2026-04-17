-- Add refund metadata to event_purchases for traceability.
-- Mirrors the pattern used by student_subscriptions refund fields.

ALTER TABLE event_purchases
  ADD COLUMN IF NOT EXISTS refunded_at   timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by   text,
  ADD COLUMN IF NOT EXISTS refund_reason  text;
