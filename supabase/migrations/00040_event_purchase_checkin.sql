-- ============================================================
-- BPM Booking System · Migration 00040
-- Add event entry check-in fields to event_purchases.
-- This is event-level entry only, NOT session attendance.
-- ============================================================

ALTER TABLE event_purchases
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid;
