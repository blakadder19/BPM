-- 00030_generic_notifications.sql
--
-- Evolves student_notifications into a generic multi-type notification table.
-- Adds a JSONB payload column for structured event data and an idempotency key.
-- Keeps the legacy class-cancellation columns for backward compatibility.

ALTER TABLE student_notifications
  ADD COLUMN IF NOT EXISTS payload      jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_notifications_idempotency
  ON student_notifications (student_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Backfill payload for existing class_cancelled rows
UPDATE student_notifications
SET payload = jsonb_build_object(
  'classTitle', class_title,
  'classDate', class_date,
  'startTime', start_time,
  'creditReverted', credit_reverted
)
WHERE type = 'class_cancelled'
  AND (payload IS NULL OR payload = '{}'::jsonb);
