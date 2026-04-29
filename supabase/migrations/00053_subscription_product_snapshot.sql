-- ============================================================
-- BPM Booking System · Migration 00053
-- Phase 1: Subscription product/access-rule snapshot
--
-- Freezes the product + access-rule state at the moment of
-- purchase so future admin edits to the live product cannot
-- retroactively change an existing subscription's entitlement.
--
-- Forward-safe: legacy rows have product_snapshot = NULL and
-- continue to evaluate against the live product/rule via the
-- application-side fallback in lib/domain/subscription-snapshot.ts.
-- No backfill is required for this migration to ship.
-- ============================================================

ALTER TABLE student_subscriptions
  ADD COLUMN IF NOT EXISTS product_snapshot jsonb;

COMMENT ON COLUMN student_subscriptions.product_snapshot IS
  'Frozen product/access-rule snapshot captured at subscription creation. '
  'Shape: { snapshotAt, allowedStyleIds, allowedStyleNames, allowedLevels, '
  'benefits, termBound, recurring, spanTerms, allowedClassTypes, '
  'styleAccessMode, styleAccessPickCount, styleAccessStyleIds, '
  'styleAccessStyleNames }. NULL on legacy rows that pre-date Phase 1.';
