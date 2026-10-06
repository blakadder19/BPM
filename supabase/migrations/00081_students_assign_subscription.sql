-- 00081_students_assign_subscription.sql
--
-- Splits two abilities out of students:edit into their own permissions:
--   * students:assign_subscription  — assign a pass / membership
--   * payments:grant_complimentary  — create it as Complimentary / Waived
--
-- Until this release createSubscriptionAction and the Students "Add
-- subscription" control were gated by students:edit, and the assign form let
-- every holder create a pass as Complimentary or Waived. To keep exactly that
-- ability (and nothing more — no payments:manual_adjustment), this adds both
-- keys to:
--   * every non-super-admin staff grant whose exact list contains
--     students:edit (any role, any status; the resolver still grants nothing
--     to a disabled / pending grant)
--   * every pending staff_invite whose list contains students:edit, so
--     accepting it later does not silently drop the ability
-- Only the keys a row lacks are added. Nobody else gains either key. Super
-- Admin rows are untouched (they resolve to every permission). Accepted /
-- revoked / expired invites are history.
--
-- Requires the exact permission model (00080). Runs once: a marker row is
-- written at the end and a second run is a no-op, so a later re-run can
-- never re-add a permission after a Super Admin removed it. Previous values
-- are kept in staff_permissions_pre_00081 / staff_invites_pre_00081.

create table if not exists public.staff_permission_migrations (
  key        text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists public.staff_permissions_pre_00081 (
  user_id           uuid primary key,
  email             text,
  staff_role_key    text,
  staff_status      text,
  staff_permissions jsonb,
  captured_at       timestamptz not null default now()
);

create table if not exists public.staff_invites_pre_00081 (
  invite_id   uuid primary key,
  email       text,
  role_key    text,
  status      text,
  permissions jsonb,
  captured_at timestamptz not null default now()
);

alter table public.staff_permission_migrations enable row level security;
alter table public.staff_permissions_pre_00081 enable row level security;
alter table public.staff_invites_pre_00081     enable row level security;
revoke all on public.staff_permission_migrations from anon, authenticated;
revoke all on public.staff_permissions_pre_00081 from anon, authenticated;
revoke all on public.staff_invites_pre_00081     from anon, authenticated;

do $$
declare
  new_keys constant text[] := array['students:assign_subscription', 'payments:grant_complimentary'];
begin
  if exists (select 1 from public.staff_permission_migrations where key = '00081_students_assign_subscription') then
    raise notice '00081: assign / complimentary permissions already granted; nothing to do';
    return;
  end if;

  if not exists (select 1 from public.staff_permission_model_marker) then
    raise exception '00081 requires 00080 (exact staff permissions) to have run first';
  end if;

  insert into public.staff_permissions_pre_00081
    (user_id, email, staff_role_key, staff_status, staff_permissions)
  select id, email, staff_role_key, staff_status, staff_permissions
  from public.users
  where staff_role_key is not null
    and staff_role_key <> 'super_admin'
    and jsonb_typeof(staff_permissions) = 'array'
    and staff_permissions ? 'students:edit'
    and not staff_permissions ?& new_keys;

  insert into public.staff_invites_pre_00081
    (invite_id, email, role_key, status, permissions)
  select id, email, role_key, status, permissions
  from public.staff_invites
  where status = 'pending'
    and role_key <> 'super_admin'
    and jsonb_typeof(permissions) = 'array'
    and permissions ? 'students:edit'
    and not permissions ?& new_keys;

  update public.users u
  set staff_permissions = u.staff_permissions || (
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
    from unnest(new_keys) as k
    where not u.staff_permissions ? k
  )
  from public.staff_permissions_pre_00081 b
  where b.user_id = u.id;

  update public.staff_invites i
  set permissions = i.permissions || (
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
    from unnest(new_keys) as k
    where not i.permissions ? k
  )
  from public.staff_invites_pre_00081 b
  where b.invite_id = i.id;

  insert into public.staff_permission_migrations (key) values ('00081_students_assign_subscription');
end $$;
