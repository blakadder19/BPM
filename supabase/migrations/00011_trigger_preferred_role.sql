-- 00011_trigger_preferred_role.sql
--
-- Fix: handle_new_user() now extracts preferred_role and date_of_birth
-- from raw_user_meta_data when creating student_profiles rows.
-- Previously only the id was inserted, leaving preferred_role NULL.

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

-- Also backfill any existing student_profiles that have NULL preferred_role
-- but whose auth.users row has a preferred_role in metadata.
update public.student_profiles sp
set preferred_role = (au.raw_user_meta_data ->> 'preferred_role')::public.dance_role
from auth.users au
where sp.id = au.id
  and sp.preferred_role is null
  and au.raw_user_meta_data ->> 'preferred_role' is not null
  and au.raw_user_meta_data ->> 'preferred_role' <> '';
