-- ============================================================
-- BPM Booking System · Migration 00041
-- Upgrade event start/end from date to full timestamptz
-- to support overnight and multi-day events with real times.
-- Existing date-only values are backfilled to midnight UTC.
-- ============================================================

-- Drop the old date-only constraint
ALTER TABLE special_events DROP CONSTRAINT IF EXISTS chk_event_dates;

-- Convert columns from date to timestamptz
ALTER TABLE special_events
  ALTER COLUMN start_date TYPE timestamptz USING start_date::timestamptz,
  ALTER COLUMN end_date   TYPE timestamptz USING (end_date::timestamptz + interval '23 hours 59 minutes');

-- Re-add constraint for the new type
ALTER TABLE special_events
  ADD CONSTRAINT chk_event_dates CHECK (end_date >= start_date);

-- Recreate index (the old one is auto-dropped on type change in some PG versions)
DROP INDEX IF EXISTS idx_special_events_dates;
CREATE INDEX idx_special_events_dates ON special_events(start_date, end_date);
