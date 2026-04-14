-- ============================================================
-- BPM Booking System · Migration 00035
-- Patch: add columns introduced after 00034 was first applied,
-- plus reception_method for admin payment confirmation.
-- ============================================================

-- ── Columns added to 00034 migration file after initial deploy ──

ALTER TABLE special_events
  ADD COLUMN IF NOT EXISTS featured_on_dashboard boolean NOT NULL DEFAULT false;

ALTER TABLE special_events
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- ── Reception method for pay-at-reception event purchases ───────
-- Tracks HOW the reception payment was collected (cash / revolut).
-- Null for Stripe-paid or not-yet-confirmed purchases.

ALTER TABLE event_purchases
  ADD COLUMN IF NOT EXISTS reception_method text;
