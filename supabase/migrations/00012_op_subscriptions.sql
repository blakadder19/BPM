-- 00012_op_subscriptions.sql
--
-- Operational table for real-user subscriptions.
-- Same TEXT-column pattern as op_bookings etc.

CREATE TABLE IF NOT EXISTS op_subscriptions (
  id                    text PRIMARY KEY,
  student_id            text NOT NULL,
  product_id            text NOT NULL,
  product_name          text NOT NULL,
  product_type          text NOT NULL,
  status                text NOT NULL DEFAULT 'active',
  total_credits         int,
  remaining_credits     int,
  valid_from            text NOT NULL,
  valid_until           text,
  selected_style_id     text,
  selected_style_name   text,
  selected_style_ids    text,
  selected_style_names  text,
  notes                 text,
  term_id               text,
  payment_method        text NOT NULL DEFAULT 'cash',
  payment_status        text NOT NULL DEFAULT 'paid',
  assigned_by           text,
  assigned_at           text,
  auto_renew            boolean NOT NULL DEFAULT false,
  classes_used          int NOT NULL DEFAULT 0,
  classes_per_term      int,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_subscriptions_student ON op_subscriptions (student_id);
CREATE INDEX IF NOT EXISTS idx_op_subscriptions_status  ON op_subscriptions (status);
