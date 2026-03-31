-- 00026_student_qr_token.sql
--
-- Add persistent QR identity token to student_profiles.
-- Used for attendance scanning — each student shows one QR, the system
-- resolves their bookings + entitlements at scan time.

alter table public.student_profiles
  add column if not exists qr_token text unique;

-- Backfill existing students with a unique token
update public.student_profiles
set qr_token = 'bpm-' || encode(gen_random_bytes(16), 'hex')
where qr_token is null;

-- Make non-nullable after backfill
alter table public.student_profiles
  alter column qr_token set not null,
  alter column qr_token set default 'bpm-' || encode(gen_random_bytes(16), 'hex');
