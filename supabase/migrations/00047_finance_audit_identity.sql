-- Extend finance audit log with structured performer identity fields.
-- Keeps legacy `performed_by` (free-text display) for backward compat.
--
-- New fields:
--   performed_by_user_id  — auth user id of whoever performed the action
--   performed_by_email    — email at time of action (captured for traceability)
--   performed_by_name     — display name at time of action (optional)
--   performed_at          — explicit performed timestamp (falls back to created_at)

ALTER TABLE op_finance_audit_log
  ADD COLUMN IF NOT EXISTS performed_by_user_id text,
  ADD COLUMN IF NOT EXISTS performed_by_email   text,
  ADD COLUMN IF NOT EXISTS performed_by_name    text,
  ADD COLUMN IF NOT EXISTS performed_at         timestamptz;

CREATE INDEX IF NOT EXISTS idx_finance_audit_performed_by_user
  ON op_finance_audit_log (performed_by_user_id);
