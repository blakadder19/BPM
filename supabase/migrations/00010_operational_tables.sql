-- 00010_operational_tables.sql
--
-- Operational tables for hybrid mode (mock + real data).
-- Uses TEXT columns for IDs to accommodate both mock string IDs (e.g. "bc-001")
-- and real UUIDs. No FK constraints to unmigrated tables (schedule, products).
-- These tables persist real-user bookings, attendance, and penalties across
-- server restarts while the schedule/product layers remain in-memory.

-- Bookings
CREATE TABLE IF NOT EXISTS op_bookings (
  id                  text PRIMARY KEY,
  bookable_class_id   text NOT NULL,
  student_id          text NOT NULL,
  student_name        text NOT NULL,
  dance_role          text,
  status              text NOT NULL DEFAULT 'confirmed',
  source              text,
  subscription_id     text,
  subscription_name   text,
  admin_note          text,
  booked_at           text NOT NULL,
  cancelled_at        text,
  check_in_token      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_bookings_student ON op_bookings (student_id);
CREATE INDEX IF NOT EXISTS idx_op_bookings_class   ON op_bookings (bookable_class_id);
CREATE INDEX IF NOT EXISTS idx_op_bookings_status  ON op_bookings (status);

-- Waitlist
CREATE TABLE IF NOT EXISTS op_waitlist (
  id                  text PRIMARY KEY,
  bookable_class_id   text NOT NULL,
  student_id          text NOT NULL,
  student_name        text NOT NULL,
  dance_role          text,
  status              text NOT NULL DEFAULT 'waiting',
  position            int  NOT NULL,
  joined_at           text NOT NULL,
  promoted_at         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_waitlist_student ON op_waitlist (student_id);
CREATE INDEX IF NOT EXISTS idx_op_waitlist_class   ON op_waitlist (bookable_class_id);

-- Attendance
CREATE TABLE IF NOT EXISTS op_attendance (
  id                  text PRIMARY KEY,
  bookable_class_id   text NOT NULL,
  student_id          text NOT NULL,
  student_name        text NOT NULL,
  booking_id          text,
  class_title         text NOT NULL,
  date                text NOT NULL,
  status              text NOT NULL DEFAULT 'present',
  check_in_method     text,
  marked_by           text NOT NULL,
  marked_at           text NOT NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_attendance_student ON op_attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_op_attendance_class   ON op_attendance (bookable_class_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_op_attendance_unique
  ON op_attendance (bookable_class_id, student_id);

-- Penalties
CREATE TABLE IF NOT EXISTS op_penalties (
  id                  text PRIMARY KEY,
  student_id          text NOT NULL,
  student_name        text NOT NULL,
  booking_id          text,
  bookable_class_id   text NOT NULL,
  class_title         text NOT NULL,
  class_date          text NOT NULL,
  reason              text NOT NULL,
  amount_cents        int  NOT NULL,
  resolution          text NOT NULL,
  subscription_id     text,
  credit_deducted     int  NOT NULL DEFAULT 0,
  notes               text,
  created_at          text NOT NULL,
  db_created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_penalties_student ON op_penalties (student_id);
CREATE INDEX IF NOT EXISTS idx_op_penalties_class   ON op_penalties (bookable_class_id);
