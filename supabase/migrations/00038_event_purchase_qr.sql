-- 00038_event_purchase_qr.sql
--
-- Add a unique QR token to event_purchases for guest check-in.
-- Generated only after payment is confirmed (paid status).

ALTER TABLE event_purchases
  ADD COLUMN IF NOT EXISTS qr_token text UNIQUE;
