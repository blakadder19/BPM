-- ============================================================
-- BPM Booking System · Migration 00070
-- Pass / product stackability.
--
-- Adds an explicit `allow_multiple_active_purchases` flag to the
-- products table so the legacy "one active per product + term"
-- duplicate guard can be turned off per-product.
--
-- Business rule (per academy decision 2026-05):
--   * Passes and drop-ins are stackable by default. Students may hold
--     multiple concurrent active passes (e.g. one Bronze Pass scoped
--     to Salsa + a second Bronze Pass scoped to Bachata).
--   * Memberships are also allowed to coexist by default unless a
--     future product is explicitly marked non-stackable.
--   * Only products with `allow_multiple_active_purchases = false`
--     fall back to the legacy duplicate guard.
--
-- Forward-safe: column is NOT NULL with default true, so every
-- existing product becomes stackable on backfill.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS allow_multiple_active_purchases boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN products.allow_multiple_active_purchases IS
  'When true (default), students may hold multiple concurrent active '
  'purchases of this product. When false, the catalog and stripe '
  'checkout flows block a second purchase that overlaps an existing '
  'active subscription for the same product + term/period. Drop-ins '
  'are always stackable regardless of this flag.';
