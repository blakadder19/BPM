-- ════════════════════════════════════════════════════════════
-- Phase 18 diagnostic — dual-role staff/student accounts
-- ════════════════════════════════════════════════════════════
--
-- READ-ONLY. Nothing here mutates data.
--
-- Context
-- -------
-- Before Phase 18, `getStaffAccess()` returned an empty permission
-- set whenever `users.role = 'student'`, WITHOUT reading
-- `staff_role_key`. Any existing student who was granted staff access
-- therefore ended up in a half-state: the staff columns were written
-- but conveyed nothing, and the UI kept showing "Student".
--
-- Phase 18 makes the staff grant authoritative and independent of the
-- base role. That means these rows START WORKING on deploy with no
-- data change at all — their `staff_role_key` is finally evaluated.
--
-- DO NOT mass-update `role` to 'teacher'. That was the old workaround
-- and it DESTROYS student functionality (Catalog, student page guards,
-- student-only navigation all key off `users.role`). Dual-role is now
-- supported precisely so that trade-off is unnecessary.
-- ════════════════════════════════════════════════════════════


-- ── 1. Who becomes dual-role on deploy? ────────────────────
--
-- These accounts hold a staff grant alongside the student base role.
-- After Phase 18 each one gains their staff permissions while keeping
-- student access. Expect them to appear as "Student · <Role>".

select
  u.id,
  u.email,
  u.full_name,
  u.role                as base_role,
  u.staff_role_key,
  u.staff_status,
  u.staff_permissions,
  u.staff_updated_at,
  -- Will they actually get permissions? Only an ACTIVE grant counts.
  (u.staff_status = 'active') as grant_is_live
from   public.users u
where  u.staff_role_key is not null
  and  u.role = 'student'
order  by u.staff_updated_at desc nulls last;


-- ── 2. Summary by role + status ────────────────────────────

select
  u.role          as base_role,
  u.staff_role_key,
  u.staff_status,
  count(*)        as accounts
from   public.users u
where  u.staff_role_key is not null
group  by 1, 2, 3
order  by 1, 2, 3;


-- ── 3. Grants that are present but NOT live ────────────────
--
-- staff_status of 'disabled' or 'pending' conveys no permissions by
-- design. If someone reports missing access and appears here, the fix
-- is to set their status to active from Admin → Staff, NOT to touch
-- their base role.

select id, email, full_name, role, staff_role_key, staff_status
from   public.users
where  staff_role_key is not null
  and  staff_status <> 'active'
order  by email;


-- ── 4. Invites that were never accepted ────────────────────
--
-- Pre-Phase-18 the invite link pointed at /login?invite=<token> and
-- the token was ignored, so an already-signed-in recipient could
-- never accept. Rows here may be genuine casualties of that bug.
--
-- Note: for an email that ALREADY had a BPM account, no invite row was
-- ever created (the action short-circuited to an immediate grant), so
-- an affected existing student will typically have zero rows here —
-- check query 1 instead.

select
  i.id,
  i.email,
  i.role_key,
  i.status,
  i.expires_at,
  i.created_at,
  (i.expires_at is not null and i.expires_at < now()) as is_expired,
  u.id   as matching_user_id,
  u.role as matching_user_base_role,
  u.staff_role_key as matching_user_staff_role
from   public.staff_invites i
left   join public.users u on lower(u.email) = lower(i.email)
where  i.status = 'pending'
order  by i.created_at desc;


-- ── 5. Who will now appear on Admin → Staff? ───────────────
--
-- Mirrors the Phase 18 `listStaff()` filter. Confirms dual-role
-- accounts are discoverable and that plain students are not.

select id, email, full_name, role, staff_role_key, staff_status
from   public.users
where  (staff_role_key is not null or role in ('admin', 'teacher'))
  and  not (staff_role_key is null and staff_status = 'disabled')
order  by created_at;


-- ── 6. Teacher-roster linkage (migration 00078) ────────────
--
-- Roster membership and staff access are separate concepts. This
-- shows which roster entries are linked to an account and which are
-- standalone (guest/visiting instructors, or pre-00078 rows that were
-- deliberately not backfilled because name matching is unsafe).

select
  tr.id,
  tr.full_name,
  tr.email,
  tr.category,
  tr.is_active,
  tr.user_id,
  u.email          as linked_account_email,
  u.staff_role_key as linked_account_staff_role
from   public.teacher_roster tr
left   join public.users u on u.id = tr.user_id
order  by tr.user_id nulls last, tr.full_name;


-- ── 7. Teacher staff WITHOUT a roster entry ────────────────
--
-- Informational only. These people have Teacher permissions but are
-- not selectable for class assignments. That is a legitimate state
-- (an office manager with the Teacher preset, say). Add them from
-- Admin → Staff with "Add to teaching roster" ticked if they should
-- be assignable.

select u.id, u.email, u.full_name, u.role, u.staff_role_key
from   public.users u
where  u.staff_role_key = 'teacher'
  and  u.staff_status = 'active'
  and  not exists (
         select 1 from public.teacher_roster tr where tr.user_id = u.id
       )
order  by u.email;
