-- ============================================================
-- BPM Booking System · Migration 00054
-- Phase 2: Product perks (structured flags)
--
-- Adds a single jsonb column to express the three real-logic
-- perks (birthday free class, free weekend Student Practice,
-- member giveaways) per-product so admins can opt individual
-- products in/out without redeploying.
--
-- Forward-safe: legacy rows have perks = NULL and continue to
-- evaluate via the productType-derived default (memberships =
-- all three on, otherwise off). No backfill is required.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS perks jsonb;

COMMENT ON COLUMN products.perks IS
  'Structured per-product perk flags. Shape: '
  '{ birthdayFreeClass?: bool, freeWeekendPractice?: bool, memberGiveaway?: bool }. '
  'NULL = derive from product_type (memberships get all three by default).';
