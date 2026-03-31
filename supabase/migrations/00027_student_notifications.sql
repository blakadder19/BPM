-- 00027_student_notifications.sql
--
-- Persists student bell notifications (e.g. class cancellations).
-- Uses TEXT columns for IDs to accommodate both mock string IDs and real UUIDs.

CREATE TABLE IF NOT EXISTS student_notifications (
  id             text PRIMARY KEY,
  student_id     text NOT NULL,
  student_name   text NOT NULL,
  type           text NOT NULL DEFAULT 'class_cancelled',
  class_title    text NOT NULL,
  class_date     text NOT NULL,
  start_time     text NOT NULL,
  credit_reverted boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_notifications_student
  ON student_notifications (student_id);
