-- 00079_signup_role_hardening.sql
--
-- raw_user_meta_data comes from the client (supabase.auth.signUp options.data),
-- so it must never decide authorisation or tenancy:
--   * role: every new auth user starts as a student; staff access is granted
--     only through staff invites (users.staff_role_key / staff_status).
--   * academy_id: always the canonical academy (oldest row). BPM is
--     single-academy; users.academy_id is NOT NULL, so it cannot stay empty.
-- Only profile fields (full_name, phone, date_of_birth, preferred_role) are
-- still read from the metadata.
-- Body otherwise identical to 00029, minus the now-unreachable teacher branch.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  _academy_id uuid;
  _dob_raw    text;
BEGIN
  SELECT id INTO _academy_id
  FROM public.academies
  ORDER BY created_at
  LIMIT 1;

  IF _academy_id IS NULL THEN
    RETURN new;
  END IF;

  INSERT INTO public.users (id, academy_id, email, full_name, role, phone)
  VALUES (
    new.id,
    _academy_id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New User'),
    'student'::public.user_role,
    new.raw_user_meta_data ->> 'phone'
  );

  _dob_raw := new.raw_user_meta_data ->> 'date_of_birth';
  -- Accept MM-DD directly; strip year from YYYY-MM-DD legacy values
  IF _dob_raw IS NOT NULL AND _dob_raw <> '' THEN
    IF _dob_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN
      _dob_raw := substring(_dob_raw from 6);
    END IF;
  ELSE
    _dob_raw := NULL;
  END IF;

  INSERT INTO public.student_profiles (id, preferred_role, date_of_birth)
  VALUES (
    new.id,
    (new.raw_user_meta_data ->> 'preferred_role')::public.dance_role,
    _dob_raw
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
