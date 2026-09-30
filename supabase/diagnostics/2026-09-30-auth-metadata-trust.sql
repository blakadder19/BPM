-- Read-only diagnostics for the auth metadata-trust fix (00079).
-- Run in the Supabase SQL editor. SELECT only; nothing here mutates data.

-- 1. Users whose auth metadata role differs from the database role.
select u.id, u.email, au.created_at,
       coalesce(au.raw_user_meta_data->>'role', '(none)') as metadata_role,
       u.role as db_role, u.staff_role_key, u.staff_status
from auth.users au
join public.users u on u.id = au.id
where coalesce(au.raw_user_meta_data->>'role', 'student') <> u.role::text
order by au.created_at desc;

-- 2. Users with security-sensitive keys in client-writable metadata,
--    and any non-standard keys in app_metadata.
select au.id, au.email, au.created_at,
       (select string_agg(k, ',') from jsonb_object_keys(coalesce(au.raw_user_meta_data, '{}')) k
         where k in ('role','staff_role_key','staff_status','staff_permissions','permissions','role_key',
                     'is_admin','admin','is_super_admin','super_admin','academy_id',
                     'subscription','subscription_status','member','is_member','membership','credits')) as sensitive_user_metadata_keys,
       (select string_agg(k, ',') from jsonb_object_keys(coalesce(au.raw_app_meta_data, '{}')) k
         where k not in ('provider','providers')) as unusual_app_metadata_keys
from auth.users au
where coalesce(au.raw_user_meta_data, '{}') ?| array['staff_role_key','staff_status','staff_permissions','permissions','role_key',
        'is_admin','admin','is_super_admin','super_admin','academy_id',
        'subscription','subscription_status','member','is_member','membership','credits']
   or exists (select 1 from jsonb_object_keys(coalesce(au.raw_app_meta_data, '{}')) k where k not in ('provider','providers'))
order by au.created_at desc;

-- 3. Unexpected academy_id values (anything other than the canonical academy).
select u.id, u.email, u.academy_id, u.role, u.created_at
from public.users u
where u.academy_id is distinct from (select id from public.academies order by created_at limit 1);

-- 4. Admin/teacher/staff users and how they obtained access, where inferable:
--    invited via Supabase Auth (invited_at), accepted staff invite, or neither
--    (seeded or granted directly from the Staff page — not recorded).
select u.id, u.email, au.created_at, au.last_sign_in_at,
       u.role as db_role, u.staff_role_key, u.staff_status,
       coalesce(au.raw_user_meta_data->>'role', '(none)') as metadata_role,
       au.invited_at,
       (select string_agg(si.role_key || ':' || si.status || ' @ ' || si.created_at::date, '; ' order by si.created_at)
          from public.staff_invites si
         where lower(trim(si.email)) = lower(trim(u.email))) as staff_invites
from public.users u
join auth.users au on au.id = u.id
where u.role in ('admin','teacher') or u.staff_role_key is not null
order by au.created_at;

-- 5. Privileged accounts created recently (adjust the window).
select u.id, u.email, au.created_at, u.role, u.staff_role_key, u.staff_status,
       coalesce(au.raw_user_meta_data->>'role', '(none)') as metadata_role
from public.users u
join auth.users au on au.id = u.id
where au.created_at > now() - interval '60 days'
  and (u.role <> 'student' or u.staff_role_key is not null)
order by au.created_at desc;

-- 6. Staff accounts still using the public seed password from supabase/seed.sql.
select u.id, u.email, u.role, u.staff_role_key, u.staff_status, au.last_sign_in_at,
       au.encrypted_password = extensions.crypt('password123', au.encrypted_password) as uses_seed_password
from auth.users au
join public.users u on u.id = au.id
where u.role in ('admin','teacher') or u.staff_role_key is not null
order by uses_seed_password desc, u.email;
