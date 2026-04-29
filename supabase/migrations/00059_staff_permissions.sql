-- 00059_staff_permissions.sql
-- Staff & Permissions MVP: layer staff role/permissions on top of public.users
-- and add a staff_invites table for the copy-link invite flow.
--
-- Design (per 2026-04-29 handoff):
--   - Keep the existing UserRole enum (admin/teacher/student) on users.role.
--   - Add staff_role_key + staff_permissions + staff_status alongside it.
--   - Existing role='admin' rows are auto-promoted to staff_role_key='super_admin'
--     during this migration so the current single admin keeps full access without
--     manual intervention.
--   - staff_invites is a small table backing the invite-by-email flow. The
--     application layer revokes prior pending invites for the same email before
--     inserting a new one (no DB-level uniqueness needed for the MVP).

-- ── 1. Extend public.users with staff fields ────────────────────────────────

alter table public.users
  add column if not exists staff_role_key   text,
  add column if not exists staff_permissions jsonb,
  add column if not exists staff_status     text default 'active',
  add column if not exists staff_updated_at timestamptz,
  add column if not exists staff_invited_by uuid;

-- Constrain values without going through a DB enum (cheaper to evolve).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_staff_role_key_chk'
  ) then
    alter table public.users
      add constraint users_staff_role_key_chk
      check (
        staff_role_key is null
        or staff_role_key in ('super_admin','admin','front_desk','teacher','read_only','custom')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'users_staff_status_chk'
  ) then
    alter table public.users
      add constraint users_staff_status_chk
      check (staff_status in ('active','disabled','pending'));
  end if;
end$$;

-- Backfill: every current admin becomes super_admin so we don't lock anyone out.
update public.users
  set staff_role_key = 'super_admin',
      staff_status = coalesce(staff_status, 'active'),
      staff_updated_at = coalesce(staff_updated_at, now())
  where role = 'admin'
    and staff_role_key is null;

-- Backfill: every current teacher gets the 'teacher' preset so existing
-- teachers can keep doing operational tasks (QR scan, check-in,
-- mark-paid-at-reception) without admin intervention. Super admins can
-- adjust this from /staff afterward.
update public.users
  set staff_role_key = 'teacher',
      staff_status = coalesce(staff_status, 'active'),
      staff_updated_at = coalesce(staff_updated_at, now())
  where role = 'teacher'
    and staff_role_key is null;

-- ── 2. Staff invites table ──────────────────────────────────────────────────

create table if not exists public.staff_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  display_name text,
  role_key     text not null,
  permissions  jsonb default '[]'::jsonb,
  status       text not null default 'pending',
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  invited_by   uuid,
  token        text not null
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_invites_role_key_chk'
  ) then
    alter table public.staff_invites
      add constraint staff_invites_role_key_chk
      check (role_key in ('super_admin','admin','front_desk','teacher','read_only','custom'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'staff_invites_status_chk'
  ) then
    alter table public.staff_invites
      add constraint staff_invites_status_chk
      check (status in ('pending','accepted','expired','revoked'));
  end if;
end$$;

create index if not exists ix_staff_invites_email_status
  on public.staff_invites (lower(email), status);

-- Helpful for super-admin counting in the application layer.
create index if not exists ix_users_super_admin_active
  on public.users (id)
  where staff_role_key = 'super_admin' and staff_status = 'active';

-- ── 3. RLS posture ──────────────────────────────────────────────────────────
--
-- This migration deliberately does NOT enable RLS on staff_invites. All staff
-- actions go through the service-role admin client (lib/supabase/admin.ts),
-- mirroring how every other admin-managed table works in this codebase. RLS
-- can be added later as part of a broader RLS pass; doing it here would break
-- the parity with users/products/discount_rules and is out of scope.
