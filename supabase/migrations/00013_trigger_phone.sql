-- 00013_trigger_phone.sql
--
-- Fix: handle_new_user() now extracts phone from raw_user_meta_data
-- when creating the public.users row. Previously phone was omitted,
-- leaving it NULL until ensureSupabaseProfile() backfilled it.

create or replace function public.handle_new_user()
returns trigger as $$
declare
  _academy_id uuid;
  _role       public.user_role;
begin
  _academy_id := coalesce(
    (new.raw_user_meta_data ->> 'academy_id')::uuid,
    (select id from public.academies order by created_at limit 1)
  );

  if _academy_id is null then
    return new;
  end if;

  _role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    'student'::public.user_role
  );

  insert into public.users (id, academy_id, email, full_name, role, phone)
  values (
    new.id,
    _academy_id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New User'),
    _role,
    new.raw_user_meta_data ->> 'phone'
  );

  if _role = 'student'::public.user_role then
    insert into public.student_profiles (id, preferred_role, date_of_birth)
    values (
      new.id,
      (new.raw_user_meta_data ->> 'preferred_role')::public.dance_role,
      case
        when new.raw_user_meta_data ->> 'date_of_birth' is not null
             and new.raw_user_meta_data ->> 'date_of_birth' <> ''
        then (new.raw_user_meta_data ->> 'date_of_birth')::date
        else null
      end
    );
  elsif _role = 'teacher'::public.user_role then
    insert into public.teacher_profiles (id) values (new.id);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Backfill phone for existing users where it's in metadata but not in the users row
update public.users u
set phone = au.raw_user_meta_data ->> 'phone'
from auth.users au
where u.id = au.id
  and (u.phone is null or u.phone = '')
  and au.raw_user_meta_data ->> 'phone' is not null
  and au.raw_user_meta_data ->> 'phone' <> '';
