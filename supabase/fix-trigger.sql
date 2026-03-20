-- ============================================================
-- FIX: handle_new_user() trigger function
--
-- Root cause: the function was created without an explicit
-- search_path. Supabase's GoTrue service executes the INSERT
-- into auth.users under a restricted role/search_path, and the
-- SECURITY DEFINER function inherits a search_path that may NOT
-- include "public". This means the types (user_role, dance_role)
-- and tables (academies, users, student_profiles, teacher_profiles)
-- cannot be resolved, causing every signup to fail with:
--   "Database error saving new user"
--
-- Fix: recreate the function with SET search_path = public
-- and fully qualify all references.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  _academy_id uuid;
  _role       public.user_role;
BEGIN
  -- Resolve academy: from metadata or first existing academy
  _academy_id := coalesce(
    (new.raw_user_meta_data ->> 'academy_id')::uuid,
    (SELECT id FROM public.academies ORDER BY created_at LIMIT 1)
  );

  -- If no academy exists at all, skip profile creation
  IF _academy_id IS NULL THEN
    RETURN new;
  END IF;

  -- Resolve role: from metadata or default to 'student'
  _role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    'student'::public.user_role
  );

  INSERT INTO public.users (id, academy_id, email, full_name, role)
  VALUES (
    new.id,
    _academy_id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New User'),
    _role
  );

  IF _role = 'student'::public.user_role THEN
    INSERT INTO public.student_profiles (id) VALUES (new.id);
  ELSIF _role = 'teacher'::public.user_role THEN
    INSERT INTO public.teacher_profiles (id) VALUES (new.id);
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure the trigger exists (safe: DROP IF EXISTS + CREATE)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
