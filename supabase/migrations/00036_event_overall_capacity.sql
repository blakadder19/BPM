-- ============================================================
-- BPM Booking System · Migration 00036
-- Add optional overall_capacity to special_events.
-- ============================================================

ALTER TABLE special_events
  ADD COLUMN IF NOT EXISTS overall_capacity integer;
