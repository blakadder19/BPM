-- ============================================================
-- BPM Booking System · Migration 00037
-- Guest purchase support + per-event reception payment toggle.
--
-- 1. Make student_id nullable (guest purchases have no student)
-- 2. Add guest_name, guest_email, guest_phone columns
-- 3. Add allow_reception_payment toggle to special_events
-- ============================================================

-- Allow guest purchases (no linked student account)
ALTER TABLE event_purchases ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE event_purchases
  ADD COLUMN IF NOT EXISTS guest_name  text,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS guest_phone text;

-- Per-event toggle for "pay at reception" availability
ALTER TABLE special_events
  ADD COLUMN IF NOT EXISTS allow_reception_payment boolean NOT NULL DEFAULT false;
