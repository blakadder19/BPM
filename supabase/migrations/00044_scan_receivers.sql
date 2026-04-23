-- ============================================================
-- BPM Booking System · Migration 00044
-- Global scan receivers: tracks which laptop browser tab is the
-- active receiver for QR scan results sent from a mobile device.
-- One row per admin user; upserted on register/heartbeat.
-- ============================================================

CREATE TABLE scan_receivers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  receiver_id     TEXT NOT NULL,
  last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active receiver per admin user at a time
CREATE UNIQUE INDEX idx_scan_receivers_user
  ON scan_receivers(user_id);
