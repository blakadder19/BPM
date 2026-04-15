-- ============================================================
-- BPM Booking System · Migration 00042
-- Add lightweight email tracking fields to event_purchases
-- so staff can see when and what email was last sent.
-- ============================================================

ALTER TABLE event_purchases
  ADD COLUMN IF NOT EXISTS last_email_type text,
  ADD COLUMN IF NOT EXISTS last_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_email_success boolean;
