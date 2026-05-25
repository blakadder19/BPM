-- ============================================================
-- BPM Booking System · Migration 00071
-- Manual admin discount on student subscriptions.
--
-- When an authorised admin manually assigns a product to a student
-- (e.g. issuing a Bronze Bachata Pass with €15 deducted because the
-- student already paid €15 for a drop-in earlier the same day), we
-- need to record the manual adjustment as a first-class field on
-- the subscription so Finance can show:
--
--   Original price  €Y
--   Manual discount -€X
--   Final amount    €Z
--
-- Distinct from the rule-engine discount captured in
-- `discount_amount_cents` / `applied_discount` because:
--
--   * It bypasses the discount engine entirely (no rule, no claim).
--   * It requires the `payments:manual_adjustment` permission.
--   * It requires a free-text reason that is also written to the
--     finance audit log.
--
-- Historical integrity:
--   * The original drop-in (or whatever the student already paid)
--     is NEVER mutated. A new subscription row is created for the
--     new product, carrying the manual discount metadata.
--
-- Forward-safe: defaults are zero/null so existing rows are
-- unaffected.
-- ============================================================

ALTER TABLE student_subscriptions
  ADD COLUMN IF NOT EXISTS manual_discount_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_reason text,
  ADD COLUMN IF NOT EXISTS manual_discount_by uuid REFERENCES users(id);

ALTER TABLE student_subscriptions
  ADD CONSTRAINT student_subscriptions_manual_discount_nonneg_check
  CHECK (manual_discount_cents >= 0);

COMMENT ON COLUMN student_subscriptions.manual_discount_cents IS
  'One-off admin-applied discount in cents. 0 = none. Independent '
  'of the rule-engine discount captured in discount_amount_cents. '
  'When > 0, manual_discount_reason and manual_discount_by MUST be '
  'populated and the actor MUST have payments:manual_adjustment.';

COMMENT ON COLUMN student_subscriptions.manual_discount_reason IS
  'Free-text reason recorded by the admin for the manual discount. '
  'Required when manual_discount_cents > 0. Mirrored into the '
  'op_finance_audit_log entry for the subscription creation event.';

COMMENT ON COLUMN student_subscriptions.manual_discount_by IS
  'Auth user id of the admin who authorised the manual discount. '
  'NULL when no manual discount was applied.';
