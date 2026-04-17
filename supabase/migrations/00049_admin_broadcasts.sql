-- 00049_admin_broadcasts.sql
--
-- Admin broadcast alerts: the admin-created alert definitions.
-- Each broadcast is a message that can be sent to a segment of students
-- via in-app notifications, email, or both.
--
-- The actual per-student delivery is handled via the existing
-- student_notifications table (comm event type = "admin_broadcast").

CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id      uuid NOT NULL REFERENCES academies(id),
  title           text NOT NULL,
  body            text NOT NULL,
  channels        text[] NOT NULL DEFAULT '{in_app}',
  audience_type   text NOT NULL DEFAULT 'all_students',
  audience_params jsonb DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'draft',
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  recipient_count integer DEFAULT 0,
  email_sent_count integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_academy
  ON admin_broadcasts (academy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_status
  ON admin_broadcasts (status);
