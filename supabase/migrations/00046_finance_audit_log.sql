-- Lightweight financial audit log for operational traceability
CREATE TABLE IF NOT EXISTS op_finance_audit_log (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  performed_by text,
  detail text,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_audit_entity
  ON op_finance_audit_log (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_finance_audit_created
  ON op_finance_audit_log (created_at DESC);
