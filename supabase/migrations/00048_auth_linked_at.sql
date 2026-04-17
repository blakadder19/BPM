-- 00048_auth_linked_at.sql
--
-- Track when a student claims their account (first real authentication).
-- Admin-created students start with auth_linked_at = NULL.
-- Self-signup students get it set immediately during provisioning.
-- Password-reset claimers get it set when they first authenticate.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS auth_linked_at timestamptz;

-- Backfill: any student who has already signed in at least once
-- (auth.users.last_sign_in_at IS NOT NULL) gets their auth_linked_at
-- set to that timestamp. This is safe because admin.createUser()
-- does not set last_sign_in_at — only real logins do.
UPDATE student_profiles sp
SET auth_linked_at = au.last_sign_in_at
FROM auth.users au
WHERE au.id = sp.id
  AND au.last_sign_in_at IS NOT NULL
  AND sp.auth_linked_at IS NULL;
