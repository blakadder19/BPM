-- Add refund traceability columns to op_subscriptions
ALTER TABLE op_subscriptions
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by text,
  ADD COLUMN IF NOT EXISTS refund_reason text;

-- Backfill existing refunded rows with a best-effort timestamp
UPDATE op_subscriptions
  SET refunded_at = COALESCE(paid_at, assigned_at)
  WHERE payment_status = 'refunded'
    AND refunded_at IS NULL;
