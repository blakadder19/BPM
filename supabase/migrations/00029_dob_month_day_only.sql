-- 00029_dob_month_day_only.sql
--
-- Convert date_of_birth from date to text storing only MM-DD (no year).
-- Backfill existing rows to strip year.

-- Step 1: Convert column type from date to text
ALTER TABLE student_profiles
  ALTER COLUMN date_of_birth TYPE text
  USING to_char(date_of_birth, 'MM-DD');

-- Step 2: Update trigger to store MM-DD text instead of casting to date
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  _academy_id uuid;
  _role       public.user_role;
  _dob_raw    text;
BEGIN
  _academy_id := coalesce(
    (new.raw_user_meta_data ->> 'academy_id')::uuid,
    (select id from public.academies order by created_at limit 1)
  );

  IF _academy_id IS NULL THEN
    RETURN new;
  END IF;

  _role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    'student'::public.user_role
  );

  INSERT INTO public.users (id, academy_id, email, full_name, role, phone)
  VALUES (
    new.id,
    _academy_id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New User'),
    _role,
    new.raw_user_meta_data ->> 'phone'
  );

  IF _role = 'student'::public.user_role THEN
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
  ELSIF _role = 'teacher'::public.user_role THEN
    INSERT INTO public.teacher_profiles (id) VALUES (new.id);
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
