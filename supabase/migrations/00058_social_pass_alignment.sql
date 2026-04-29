-- ============================================================
-- BPM Booking System · Migration 00058
-- Social Pass — copy/structured-field alignment
--
-- The Social Pass product was historically described in
-- public-facing copy as covering "weekday socials + weekend
-- student practice", but the access engine and product seed
-- rule have always treated it as social_only / class types
-- limited to "social" — i.e. it never granted access to
-- student practice.
--
-- This migration aligns visible copy and structured fields
-- with the actual access semantics:
--
--   * description     — drops the misleading "+ weekend
--                       student practice" reference.
--   * long_description — drops the misleading "(Mon, Wed, Fri,
--                        and weekend student practice)" parenthetical.
--   * style_access_mode — explicitly set to 'social_only'
--                         (was NULL → derived).
--   * allowed_class_types — explicitly set to {social}
--                           (was NULL → derived).
--
-- Surgical: only updates the row whose name = 'Social Pass'
-- and whose access fields are still in the legacy/derived
-- (NULL or unmodified) state, so any admin edit applied
-- before this migration runs is preserved.
-- ============================================================

UPDATE products
SET
  description = '20 socials per month. Standard weekday socials only.',
  long_description = 'Access to standard weekday socials. Includes 20 socials per month. Classes, student practice and special events are not included.',
  style_access_mode = COALESCE(style_access_mode, 'social_only'),
  allowed_class_types = COALESCE(allowed_class_types, ARRAY['social']::text[])
WHERE name = 'Social Pass'
  AND description IN (
    '20 socials per month. Weekday socials + weekend student practice.',
    '20 socials per month. Standard weekday socials only.'
  );
