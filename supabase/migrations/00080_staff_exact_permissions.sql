-- 00080_staff_exact_permissions.sql
--
-- Switches staff permissions from "role preset + additions" to EXACT grants.
--
-- Before: for admin / front_desk / teacher / read_only, users.staff_permissions
-- held only the permissions ADDED on top of ROLE_PRESETS[role]; the app unioned
-- the preset back in at runtime. After: staff_permissions is the complete,
-- authoritative list and the preset is only a UI default.
--
-- This migration must run BEFORE the exact-permission resolver is deployed,
-- otherwise every non-custom staff member loses their preset permissions.
--
-- For every row it writes the CURRENT effective set, so nobody loses access
-- and the only gain is the new Teacher default attendance:mark_absent
-- (decided 2026-10-01). Teachers could already mark absent before Phase 21,
-- because markStudentAttendance accepted any attendance permission; the
-- per-status check would otherwise have taken that away. Front Desk does not
-- get it.
--   * admin / front_desk / teacher / read_only → preset ∪ stored (any status;
--     disabled / pending rows keep their intended list, the resolver still
--     grants nothing until active)
--   * custom      → unchanged (already exact)
--   * super_admin → unchanged (sentinel: always every permission)
--   * base role 'teacher', no staff_role_key, status active → explicit
--     teacher grant with the teacher preset (what the old resolver's legacy
--     fallback granted implicitly; the new resolver no longer has it)
--   * pending staff_invites → preset ∪ stored, so acceptance copies an exact
--     list (accepted / revoked / expired invites are history and untouched)
--
-- The preset arrays below are FROZEN copies of ROLE_PRESETS as of
-- 2026-10-01; they must not follow later edits to the defaults.
--
-- Runs once: a marker row is written at the end and a second run is a no-op,
-- so a later re-run can never re-add permissions a Super Admin removed.
-- The previous values are kept in staff_permissions_pre_00080 /
-- staff_invites_pre_00080 for audit and rollback.

create table if not exists public.staff_permission_model_marker (
  id          boolean primary key default true check (id),
  exact_since timestamptz not null default now()
);

create table if not exists public.staff_permissions_pre_00080 (
  user_id           uuid primary key,
  email             text,
  base_role         text,
  staff_role_key    text,
  staff_status      text,
  staff_permissions jsonb,
  captured_at       timestamptz not null default now()
);

create table if not exists public.staff_invites_pre_00080 (
  invite_id   uuid primary key,
  email       text,
  role_key    text,
  status      text,
  permissions jsonb,
  captured_at timestamptz not null default now()
);

alter table public.staff_permission_model_marker enable row level security;
alter table public.staff_permissions_pre_00080   enable row level security;
alter table public.staff_invites_pre_00080       enable row level security;
revoke all on public.staff_permission_model_marker from anon, authenticated;
revoke all on public.staff_permissions_pre_00080   from anon, authenticated;
revoke all on public.staff_invites_pre_00080       from anon, authenticated;

do $$
declare
  presets constant jsonb := jsonb_build_object(
    'admin', '[
      "dashboard:view",
      "students:view", "students:create", "students:edit", "students:view_finance", "students:manage_affiliations",
      "bookings:view", "bookings:create", "bookings:cancel", "bookings:restore",
      "attendance:view", "attendance:mark_present", "attendance:mark_absent", "attendance:edit_history",
      "checkin:view", "checkin:scan", "checkin:manual_checkin",
      "payments:view", "payments:mark_paid_reception",
      "products:view", "products:create", "products:edit", "products:archive",
      "discounts:view", "discounts:create", "discounts:edit", "discounts:preview",
      "affiliations:view", "affiliations:create", "affiliations:edit", "affiliations:verify",
      "referrals:view", "referrals:create", "referrals:verify", "referrals:reward", "referrals:cancel",
      "events:view", "events:create", "events:edit", "events:mark_paid",
      "classes:view", "classes:create", "classes:edit", "classes:cancel",
      "teachers:view", "teachers:create", "teachers:edit",
      "settings:view",
      "finance:view", "finance:mark_paid"
    ]'::jsonb,
    'front_desk', '[
      "dashboard:view",
      "students:view", "students:view_limited",
      "bookings:view", "bookings:create", "bookings:cancel",
      "attendance:view", "attendance:mark_present",
      "checkin:view", "checkin:scan", "checkin:manual_checkin",
      "payments:view_limited", "payments:mark_paid_reception",
      "referrals:view", "referrals:create", "referrals:verify"
    ]'::jsonb,
    'teacher', '[
      "dashboard:view",
      "students:view_limited",
      "bookings:view",
      "attendance:view", "attendance:mark_present", "attendance:mark_absent",
      "checkin:view", "checkin:scan", "checkin:manual_checkin",
      "payments:view_limited", "payments:mark_paid_reception"
    ]'::jsonb,
    'read_only', '[
      "dashboard:view",
      "students:view",
      "bookings:view",
      "attendance:view",
      "checkin:view",
      "payments:view",
      "products:view",
      "discounts:view",
      "affiliations:view",
      "referrals:view",
      "events:view",
      "classes:view",
      "teachers:view",
      "settings:view",
      "finance:view"
    ]'::jsonb
  );
begin
  if exists (select 1 from public.staff_permission_model_marker) then
    raise notice '00080: staff permissions already converted to exact grants; nothing to do';
    return;
  end if;

  insert into public.staff_permissions_pre_00080
    (user_id, email, base_role, staff_role_key, staff_status, staff_permissions)
  select id, email, role::text, staff_role_key, staff_status, staff_permissions
  from public.users
  where staff_role_key is not null or role::text in ('admin', 'teacher');

  insert into public.staff_invites_pre_00080
    (invite_id, email, role_key, status, permissions)
  select id, email, role_key, status, permissions
  from public.staff_invites
  where status = 'pending';

  update public.users u
  set staff_permissions = (
    select coalesce(jsonb_agg(p order by p), '[]'::jsonb)
    from (
      select jsonb_array_elements_text(presets -> u.staff_role_key) as p
      union
      select jsonb_array_elements_text(
        case when jsonb_typeof(u.staff_permissions) = 'array'
             then u.staff_permissions else '[]'::jsonb end)
    ) merged
  )
  where u.staff_role_key in ('admin', 'front_desk', 'teacher', 'read_only');

  update public.users
  set staff_role_key    = 'teacher',
      staff_permissions = presets -> 'teacher',
      staff_status      = 'active'
  where staff_role_key is null
    and role::text = 'teacher'
    and coalesce(staff_status, 'active') = 'active';

  update public.staff_invites i
  set permissions = (
    select coalesce(jsonb_agg(p order by p), '[]'::jsonb)
    from (
      select jsonb_array_elements_text(presets -> i.role_key) as p
      union
      select jsonb_array_elements_text(
        case when jsonb_typeof(i.permissions) = 'array'
             then i.permissions else '[]'::jsonb end)
    ) merged
  )
  where i.status = 'pending'
    and i.role_key in ('admin', 'front_desk', 'teacher', 'read_only');

  insert into public.staff_permission_model_marker default values;
end $$;
