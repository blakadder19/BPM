-- 00032_rls_operational_tables.sql
--
-- Enable Row Level Security on all operational and notification tables
-- that were previously missing it.
--
-- These tables are accessed exclusively via the service_role key from
-- server-side code. The default-deny RLS policy prevents any access
-- through the anon key or user JWTs, which is the correct posture.
--
-- A permissive policy for the service_role is not needed because
-- service_role bypasses RLS by design in Supabase.

-- ── Operational tables (00010) ──────────────────────────────

ALTER TABLE op_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_penalties ENABLE ROW LEVEL SECURITY;

-- ── Operational subscriptions (00012) ───────────────────────

ALTER TABLE op_subscriptions ENABLE ROW LEVEL SECURITY;

-- ── Student notifications (00027 + 00030) ───────────────────

ALTER TABLE student_notifications ENABLE ROW LEVEL SECURITY;
