-- Read-only preview for migration 00081 (students:assign_subscription and
-- payments:grant_complimentary). Run before and after applying. Changes nothing.

-- 1. Preconditions: 00080 has run; 00081 has not (migrations_table is null
--    before 00081). After applying, check the marker with:
--      select applied_at from public.staff_permission_migrations
--      where key = '00081_students_assign_subscription';
select
  (select exact_since from public.staff_permission_model_marker) as marker_00080,
  to_regclass('public.staff_permission_migrations')               as migrations_table;

-- 2. Staff grants 00081 will change (non-super-admin, holds students:edit,
--    lacks at least one of the two keys) and the keys each one gains.
select email, role::text as base_role, staff_role_key, staff_status,
       jsonb_array_length(staff_permissions) as n_before,
       array_remove(array[
         case when not staff_permissions ? 'students:assign_subscription' then 'students:assign_subscription' end,
         case when not staff_permissions ? 'payments:grant_complimentary' then 'payments:grant_complimentary' end
       ], null) as gains
from public.users
where staff_role_key is not null
  and staff_role_key <> 'super_admin'
  and jsonb_typeof(staff_permissions) = 'array'
  and staff_permissions ? 'students:edit'
  and not staff_permissions ?& array['students:assign_subscription', 'payments:grant_complimentary']
order by email;

-- 3. Pending invites 00081 will change.
select email, role_key, status, expires_at,
       jsonb_array_length(permissions) as n_before
from public.staff_invites
where status = 'pending'
  and role_key <> 'super_admin'
  and jsonb_typeof(permissions) = 'array'
  and permissions ? 'students:edit'
  and not permissions ?& array['students:assign_subscription', 'payments:grant_complimentary']
order by email;

-- 4. Every staff grant and its relevant keys (context, unchanged by 00081
--    unless listed in 2).
select email, staff_role_key, staff_status,
       staff_permissions ? 'students:edit'                as students_edit,
       staff_permissions ? 'students:assign_subscription' as assign_subscription,
       staff_permissions ? 'payments:grant_complimentary' as grant_complimentary,
       staff_permissions ? 'payments:manual_adjustment'   as manual_adjustment,
       staff_permissions ? 'payments:mark_paid_reception' as mark_paid_reception,
       staff_permissions ? 'checkin:manual_checkin'       as manual_checkin,
       staff_permissions ? 'attendance:edit_history'      as edit_history,
       staff_permissions ? 'attendance:backdate'          as backdate,
       staff_permissions ? 'finance:view'                 as finance_view
from public.users
where staff_role_key is not null
order by email;
