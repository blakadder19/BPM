-- ============================================================
-- BPM Booking System · Migration 00002
-- Academy, users, and role-specific profiles
-- ============================================================

-- ── Academies ───────────────────────────────────────────────
create table academies (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null,
  slug            text        not null unique,
  timezone        text        not null default 'Europe/Dublin',
  currency        text        not null default 'eur',
  address         text,
  contact_email   text,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table academies enable row level security;

create trigger trg_academies_updated_at
  before update on academies
  for each row execute function update_updated_at();


-- ── Users (extends auth.users) ──────────────────────────────
create table users (
  id              uuid primary key references auth.users(id) on delete cascade,
  academy_id      uuid        not null references academies(id),
  email           text        not null,
  full_name       text        not null,
  role            user_role   not null default 'student',
  phone           text,
  avatar_url      text,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table users enable row level security;

create trigger trg_users_updated_at
  before update on users
  for each row execute function update_updated_at();


-- ── Student profiles (extra student-specific data) ──────────
create table student_profiles (
  id                        uuid primary key references users(id) on delete cascade,
  emergency_contact_name    text,
  emergency_contact_phone   text,
  date_of_birth             date,
  preferred_role            dance_role,           -- PROVISIONAL: default booking role
  notes                     text,                 -- admin-only notes
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table student_profiles enable row level security;

create trigger trg_student_profiles_updated_at
  before update on student_profiles
  for each row execute function update_updated_at();


-- ── Teacher profiles ────────────────────────────────────────
create table teacher_profiles (
  id              uuid primary key references users(id) on delete cascade,
  bio             text,
  specialties     text[],                         -- e.g. {'Bachata','Cuban'}
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table teacher_profiles enable row level security;

create trigger trg_teacher_profiles_updated_at
  before update on teacher_profiles
  for each row execute function update_updated_at();


-- ── Auto-create user + profile on Supabase Auth signup ──────
-- SET search_path = public is required because GoTrue executes the
-- INSERT under a restricted role whose default search_path may not
-- include "public". Without it, the enum types and table names
-- cannot be resolved, causing every signup to fail.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
