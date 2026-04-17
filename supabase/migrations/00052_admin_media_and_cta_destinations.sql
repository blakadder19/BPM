-- 00052_admin_media_and_cta_destinations.sql
--
-- 1. Admin media library table for reusable uploaded images.
-- 2. CTA destination metadata on admin_broadcasts.

-- ── Admin media library ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid NOT NULL REFERENCES academies(id),
  path        text NOT NULL,
  public_url  text NOT NULL,
  filename    text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  integer NOT NULL DEFAULT 0,
  title       text,
  alt_text    text,
  kind        text NOT NULL DEFAULT 'general',
  uploaded_by text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_media_academy
  ON admin_media (academy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_media_kind
  ON admin_media (kind);

-- ── CTA destination on broadcasts ───────────────────────────

ALTER TABLE admin_broadcasts
  ADD COLUMN IF NOT EXISTS cta_destination_type text,
  ADD COLUMN IF NOT EXISTS cta_destination_id   text;
