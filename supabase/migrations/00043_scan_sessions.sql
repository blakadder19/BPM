-- ============================================================
-- BPM Booking System · Migration 00043
-- Paired-scan sessions: lightweight cross-device QR scanning.
-- Laptop creates a session, mobile joins via pairing code,
-- scans are processed server-side and results broadcast via
-- Supabase Realtime to the laptop.
-- ============================================================

CREATE TABLE scan_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_code TEXT NOT NULL UNIQUE,
  context_type TEXT NOT NULL CHECK (context_type IN ('attendance', 'event_reception')),
  context_id   TEXT,
  created_by   UUID NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '12 hours')
);

CREATE INDEX idx_scan_sessions_active_code
  ON scan_sessions(pairing_code) WHERE active = true;
