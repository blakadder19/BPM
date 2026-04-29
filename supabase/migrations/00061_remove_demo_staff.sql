-- 00061_remove_demo_staff.sql
--
-- BPM preview QA blocker 2 — demo teacher rows ("Carlos Rivera",
-- "María García") were leaking into hosted Supabase environments via
-- supabase/seed.sql and showing up in /staff. The first version of
-- this migration tried to inspect teacher_pairs/classes columns that
-- don't exist in the real schema and failed with:
--
--   ERROR: column "teacher_1_id" does not exist
--
-- We do NOT need to physically delete the demo rows. The supabase
-- staff repository (lib/repositories/supabase/staff-repository.ts)
-- already filters out users whose `staff_role_key IS NULL` AND
-- `staff_status = 'disabled'`, so a non-destructive demote is enough
-- to make them disappear from /staff without touching auth.users,
-- teacher_profiles, or any FK-referencing tables.
--
-- This is the simplest possible safe form: a targeted UPDATE keyed
-- by exact email match. It does not delete anything, does not query
-- tables whose schema may vary, and is fully idempotent.
--
-- Real users (BPM Admin, Zaria's accounts, students) are untouched
-- because their emails do not match.

update public.users
set
  staff_role_key = null,
  staff_permissions = '[]'::jsonb,
  staff_status = 'disabled',
  staff_updated_at = now()
where lower(email) in ('carlos@bpm.dance', 'maria@bpm.dance');
