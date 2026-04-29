-- ============================================================
-- BPM Booking System · Migration 00055
-- Phase 3: Product editor uplift — structured behaviour fields
--
-- Adds four new columns to the products table so the admin
-- editor can drive product behaviour previously inferred at
-- runtime from hardcoded seed rules.
--
--   * style_access_mode      — enum-like text: all / fixed /
--                              selected_style / course_group /
--                              social_only. NULL = legacy derive.
--   * style_access_pick_count — used only when mode is
--                               course_group. NULL otherwise.
--   * allowed_class_types    — text[] of class type names. NULL
--                              = derive from product_type.
--   * archived_at            — soft archival timestamp. Distinct
--                              from is_active so archive is a
--                              recoverable lifecycle stage.
--
-- stripe_price_id already exists in the products table from
-- migration 00005; this phase only surfaces it in the type model
-- and admin UI.
--
-- Forward-safe: every new column is nullable. Legacy rows with
-- NULL fields fall back to the existing inference path. No
-- backfill required.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS style_access_mode text,
  ADD COLUMN IF NOT EXISTS style_access_pick_count int,
  ADD COLUMN IF NOT EXISTS allowed_class_types text[],
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN products.style_access_mode IS
  'Enum-like text — one of: all, fixed, selected_style, course_group, social_only. '
  'NULL means "derive at runtime via buildDynamicAccessRulesMap" (legacy behaviour).';
COMMENT ON COLUMN products.style_access_pick_count IS
  'How many styles a student picks at purchase. Used only when style_access_mode = '
  '''course_group''. NULL otherwise.';
COMMENT ON COLUMN products.allowed_class_types IS
  'Array of class type names this product grants access to (e.g. {class,student_practice}). '
  'NULL = derive from product_type (memberships get class+student_practice, others get class).';
COMMENT ON COLUMN products.archived_at IS
  'Soft archival timestamp. NULL = product is in the active/inactive lifecycle. '
  'Non-NULL = product is archived (hidden from catalog and from new-product flows, '
  'but historical subscriptions still resolve via the snapshot).';
