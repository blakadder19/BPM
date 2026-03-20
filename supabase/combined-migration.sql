-- Combined BPM migrations (00001-00009)
-- Run this in the Supabase SQL Editor


-- === 00001_enums_and_utilities.sql ===
-- ============================================================
-- BPM Booking System · Migration 00001
-- Enums and shared utility functions
-- ============================================================

-- ── Identity ────────────────────────────────────────────────
create type user_role       as enum ('student', 'admin', 'teacher');

-- ── Scheduling ──────────────────────────────────────────────
create type class_type      as enum ('class', 'social', 'student_practice');
create type instance_status as enum ('scheduled', 'open', 'closed', 'cancelled');
create type dance_role      as enum ('leader', 'follower');

-- ── Bookings ────────────────────────────────────────────────
create type booking_status  as enum ('confirmed', 'cancelled');
create type waitlist_status as enum ('waiting', 'offered', 'promoted', 'expired');
create type attendance_mark as enum ('present', 'absent', 'late', 'excused');

-- ── Commerce ────────────────────────────────────────────────
create type product_type        as enum ('membership', 'pack', 'drop_in', 'promo_pass');
create type subscription_status as enum ('active', 'paused', 'expired', 'exhausted', 'cancelled');
create type payment_status      as enum ('pending', 'completed', 'failed', 'refunded');
create type tx_type             as enum ('credit_used', 'credit_added', 'credit_refunded', 'credit_expired', 'penalty_charged');

-- ── Ops ─────────────────────────────────────────────────────
create type penalty_reason  as enum ('late_cancel', 'no_show');


-- ── Shared utility: auto-update updated_at ──────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- === 00002_identity.sql ===
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
create or replace function public.handle_new_user()
returns trigger as $$
declare
  _academy_id uuid;
  _role       user_role;
begin
  _academy_id := coalesce(
    (new.raw_user_meta_data ->> 'academy_id')::uuid,
    (select id from academies order by created_at limit 1)
  );

  _role := coalesce(
    (new.raw_user_meta_data ->> 'role')::user_role,
    'student'
  );

  insert into users (id, academy_id, email, full_name, role)
  values (
    new.id,
    _academy_id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New User'),
    _role
  );

  if _role = 'student' then
    insert into student_profiles (id) values (new.id);
  elsif _role = 'teacher' then
    insert into teacher_profiles (id) values (new.id);
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- === 00003_scheduling.sql ===
-- ============================================================
-- BPM Booking System · Migration 00003
-- Dance styles, class templates, teacher pairs, bookable instances
-- ============================================================

-- ── Dance styles ────────────────────────────────────────────
create table dance_styles (
  id                      uuid primary key default gen_random_uuid(),
  name                    text    not null unique,
  requires_role_balance   boolean not null default false,
  sort_order              int     not null default 0,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now()
);

alter table dance_styles enable row level security;


-- ── Classes (recurring weekly templates) ────────────────────
-- Each row = one recurring slot, e.g. "Bachata Beg 1, Mon 19:00"
create table classes (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid        not null references academies(id),
  dance_style_id  uuid        references dance_styles(id),  -- null for socials
  title           text        not null,
  class_type      class_type  not null,
  level           text,                                      -- e.g. 'Beginner 1'
  day_of_week     int         not null check (day_of_week between 0 and 6), -- 0=Sun
  start_time      time        not null,
  end_time        time        not null,
  max_capacity    int,
  leader_cap      int,
  follower_cap    int,
  location        text,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table classes enable row level security;

create trigger trg_classes_updated_at
  before update on classes
  for each row execute function update_updated_at();


-- ── Teacher pairs (rotating assignment per class) ───────────
-- Effective date range allows rotation without losing history.
create table teacher_pairs (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references classes(id) on delete cascade,
  teacher_1_id    uuid not null references users(id),
  teacher_2_id    uuid references users(id),              -- null = solo teacher
  effective_from  date not null,
  effective_until date,                                    -- null = indefinite
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table teacher_pairs enable row level security;


-- ── Bookable classes (specific dated instances) ─────────────
-- Generated from class templates or created as one-offs.
-- All booking/attendance references point here.
create table bookable_classes (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid            not null references academies(id),
  class_id        uuid            references classes(id),   -- null = ad-hoc event
  dance_style_id  uuid            references dance_styles(id),
  title           text            not null,
  class_type      class_type      not null,
  level           text,
  date            date            not null,
  start_time      time            not null,
  end_time        time            not null,
  max_capacity    int,
  leader_cap      int,
  follower_cap    int,
  status          instance_status not null default 'scheduled',
  location        text,
  notes           text,
  created_at      timestamptz     not null default now(),
  updated_at      timestamptz     not null default now()
);

alter table bookable_classes enable row level security;

create trigger trg_bookable_classes_updated_at
  before update on bookable_classes
  for each row execute function update_updated_at();


-- === 00004_bookings.sql ===
-- ============================================================
-- BPM Booking System · Migration 00004
-- Bookings, waitlist, and attendance
-- ============================================================

-- ── Bookings (confirmed class reservations) ─────────────────
create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  bookable_class_id   uuid           not null references bookable_classes(id) on delete cascade,
  student_id          uuid           not null references users(id),
  dance_role          dance_role,                          -- null if class has no role balancing
  status              booking_status not null default 'confirmed',
  subscription_id     uuid,                                -- FK added after commerce migration
  booked_at           timestamptz    not null default now(),
  cancelled_at        timestamptz,
  cancel_reason       text,
  unique(bookable_class_id, student_id)
);

alter table bookings enable row level security;


-- ── Waitlist (preserves desired role) ───────────────────────
create table waitlist (
  id                  uuid primary key default gen_random_uuid(),
  bookable_class_id   uuid            not null references bookable_classes(id) on delete cascade,
  student_id          uuid            not null references users(id),
  dance_role          dance_role,                          -- preserves the role they want
  status              waitlist_status not null default 'waiting',
  position            int             not null,
  booking_id          uuid            references bookings(id),  -- set when promoted
  joined_at           timestamptz     not null default now(),
  offered_at          timestamptz,
  promoted_at         timestamptz,
  expired_at          timestamptz
);

alter table waitlist enable row level security;


-- ── Attendance ──────────────────────────────────────────────
create table attendance (
  id                  uuid primary key default gen_random_uuid(),
  bookable_class_id   uuid            not null references bookable_classes(id) on delete cascade,
  student_id          uuid            not null references users(id),
  status              attendance_mark not null default 'present',
  booking_id          uuid            references bookings(id),  -- null = walk-in
  marked_by           uuid            references users(id),
  marked_at           timestamptz     not null default now(),
  notes               text,
  unique(bookable_class_id, student_id)
);

alter table attendance enable row level security;


-- === 00005_commerce.sql ===
-- ============================================================
-- BPM Booking System · Migration 00005
-- Products, student subscriptions, wallet transactions, payments
-- ============================================================

-- ── Products (the catalog: memberships, packs, passes) ──────
create table products (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid         not null references academies(id),
  name                text         not null,
  description         text,
  product_type        product_type not null,
  price_cents         int          not null,               -- price in minor units
  currency            text         not null default 'eur',
  total_credits       int,                                 -- null = unlimited (membership)
  duration_days       int,                                 -- validity window from purchase; null = while active
  dance_style_id      uuid         references dance_styles(id),  -- null = all styles
  allowed_levels      text[],                              -- null = all; e.g. {'Beginner 1','Beginner 2'}
  is_active           boolean      not null default true,
  stripe_price_id     text,                                -- placeholder for Stripe
  metadata            jsonb        not null default '{}',  -- PROVISIONAL: extra config like pick-n-of-m
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

alter table products enable row level security;

create trigger trg_products_updated_at
  before update on products
  for each row execute function update_updated_at();


-- ── Student subscriptions (active product instances) ────────
-- When a student "buys" a product, a subscription row is created.
-- Credits, validity, and style scope are resolved at purchase time.
create table student_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  student_id              uuid                not null references users(id),
  product_id              uuid                not null references products(id),
  status                  subscription_status not null default 'active',
  total_credits           int,                             -- copied from product
  remaining_credits       int,
  valid_from              date                not null default current_date,
  valid_until             date,                            -- null = no expiry
  dance_style_id          uuid                references dance_styles(id), -- resolved for style-specific passes
  allowed_levels          text[],                          -- resolved at purchase
  stripe_subscription_id  text,                            -- placeholder for Stripe
  metadata                jsonb               not null default '{}',
  created_at              timestamptz         not null default now(),
  updated_at              timestamptz         not null default now()
);

alter table student_subscriptions enable row level security;

create trigger trg_student_subscriptions_updated_at
  before update on student_subscriptions
  for each row execute function update_updated_at();


-- Now wire the deferred FK from bookings → student_subscriptions
alter table bookings
  add constraint fk_bookings_subscription
  foreign key (subscription_id) references student_subscriptions(id);


-- ── Wallet transactions (credit ledger) ─────────────────────
-- Every credit event is logged: used, added, refunded, expired.
create table wallet_transactions (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid        not null references users(id),
  subscription_id     uuid        references student_subscriptions(id),
  booking_id          uuid        references bookings(id),
  tx_type             tx_type     not null,
  credits             int         not null,                -- positive = added, negative = used
  balance_after       int,                                 -- remaining on subscription after this tx
  description         text        not null,
  created_at          timestamptz not null default now()
);

alter table wallet_transactions enable row level security;


-- ── Payments (Stripe placeholder) ───────────────────────────
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid           not null references academies(id),
  student_id          uuid           not null references users(id),
  subscription_id     uuid           references student_subscriptions(id),
  amount_cents        int            not null,
  currency            text           not null default 'eur',
  status              payment_status not null default 'pending',
  stripe_payment_id   text,
  description         text,
  created_at          timestamptz    not null default now(),
  updated_at          timestamptz    not null default now()
);

alter table payments enable row level security;

create trigger trg_payments_updated_at
  before update on payments
  for each row execute function update_updated_at();


-- === 00006_ops.sql ===
-- ============================================================
-- BPM Booking System · Migration 00006
-- Penalties, business rules, admin audit log
-- ============================================================

-- ── Penalties ───────────────────────────────────────────────
-- Applies ONLY to class bookings. Socials never generate penalties.
create table penalties (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid           not null references academies(id),
  student_id          uuid           not null references users(id),
  booking_id          uuid           references bookings(id),
  bookable_class_id   uuid           not null references bookable_classes(id),
  reason              penalty_reason not null,
  amount_cents        int            not null,             -- in minor units (e.g. 200 = €2)
  currency            text           not null default 'eur',
  payment_id          uuid           references payments(id),  -- null until paid
  notes               text,
  created_at          timestamptz    not null default now()
);

alter table penalties enable row level security;


-- ── Business rules (configurable key-value store) ───────────
-- Keeps business logic tuneable from the DB / admin UI
-- without redeploying code.
create table business_rules (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid        not null references academies(id),
  key             text        not null,
  value           jsonb       not null,
  description     text,
  is_provisional  boolean     not null default false,       -- needs academy confirmation
  updated_by      uuid        references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(academy_id, key)
);

alter table business_rules enable row level security;

create trigger trg_business_rules_updated_at
  before update on business_rules
  for each row execute function update_updated_at();


-- ── Admin tasks (audit log) ─────────────────────────────────
-- Every significant admin action is recorded for traceability.
create table admin_tasks (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid        not null references academies(id),
  performed_by    uuid        not null references users(id),
  action          text        not null,                    -- e.g. 'booking.cancel_admin'
  entity_type     text,                                    -- e.g. 'booking', 'penalty'
  entity_id       uuid,
  details         jsonb,
  created_at      timestamptz not null default now()
);

alter table admin_tasks enable row level security;


-- === 00007_rls_policies.sql ===
-- ============================================================
-- BPM Booking System · Migration 00007
-- Row-Level Security policies for all tables
-- ============================================================

-- ── Helper functions ────────────────────────────────────────

create or replace function public.current_user_role()
returns user_role as $$
  select role from users where id = auth.uid();
$$ language sql security definer stable;

create or replace function public.is_admin()
returns boolean as $$
  select current_user_role() = 'admin';
$$ language sql security definer stable;

create or replace function public.is_teacher()
returns boolean as $$
  select current_user_role() = 'teacher';
$$ language sql security definer stable;

create or replace function public.current_academy_id()
returns uuid as $$
  select academy_id from users where id = auth.uid();
$$ language sql security definer stable;


-- ── Academies ───────────────────────────────────────────────
create policy "Users can view own academy"
  on academies for select
  using (id = current_academy_id());

create policy "Admins can manage academy"
  on academies for all
  using (is_admin() and id = current_academy_id());


-- ── Users ───────────────────────────────────────────────────
create policy "Users can view own record"
  on users for select
  using (id = auth.uid());

create policy "Admins can view all users in academy"
  on users for select
  using (is_admin() and academy_id = current_academy_id());

create policy "Admins can manage users in academy"
  on users for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Student profiles ────────────────────────────────────────
create policy "Students can view own profile"
  on student_profiles for select
  using (id = auth.uid());

create policy "Students can update own profile"
  on student_profiles for update
  using (id = auth.uid());

create policy "Admins can manage student profiles"
  on student_profiles for all
  using (is_admin());


-- ── Teacher profiles ────────────────────────────────────────
create policy "Teachers can view own profile"
  on teacher_profiles for select
  using (id = auth.uid());

create policy "Admins can manage teacher profiles"
  on teacher_profiles for all
  using (is_admin());


-- ── Dance styles (read-only for all, admin manages) ────────
create policy "Anyone authenticated can view dance styles"
  on dance_styles for select
  using (auth.uid() is not null);

create policy "Admins can manage dance styles"
  on dance_styles for all
  using (is_admin());


-- ── Classes (templates) ─────────────────────────────────────
create policy "Anyone authenticated can view active classes"
  on classes for select
  using (auth.uid() is not null);

create policy "Admins can manage classes"
  on classes for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Teacher pairs ───────────────────────────────────────────
create policy "Anyone authenticated can view teacher pairs"
  on teacher_pairs for select
  using (auth.uid() is not null);

create policy "Admins can manage teacher pairs"
  on teacher_pairs for all
  using (is_admin());


-- ── Bookable classes (instances) ────────────────────────────
create policy "Anyone authenticated can view non-draft instances"
  on bookable_classes for select
  using (auth.uid() is not null and status != 'cancelled');

create policy "Admins can view all instances"
  on bookable_classes for select
  using (is_admin());

create policy "Admins can manage instances"
  on bookable_classes for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Bookings ────────────────────────────────────────────────
create policy "Students can view own bookings"
  on bookings for select
  using (student_id = auth.uid());

create policy "Students can create bookings"
  on bookings for insert
  with check (student_id = auth.uid());

create policy "Students can cancel own bookings"
  on bookings for update
  using (student_id = auth.uid());

create policy "Admins can manage all bookings"
  on bookings for all
  using (is_admin());

create policy "Teachers can view bookings for their classes"
  on bookings for select
  using (is_teacher());


-- ── Waitlist ────────────────────────────────────────────────
create policy "Students can view own waitlist entries"
  on waitlist for select
  using (student_id = auth.uid());

create policy "Students can join waitlist"
  on waitlist for insert
  with check (student_id = auth.uid());

create policy "Admins can manage waitlist"
  on waitlist for all
  using (is_admin());


-- ── Attendance ──────────────────────────────────────────────
create policy "Students can view own attendance"
  on attendance for select
  using (student_id = auth.uid());

create policy "Admins can manage attendance"
  on attendance for all
  using (is_admin());

create policy "Teachers can manage attendance"
  on attendance for all
  using (is_teacher());


-- ── Products ────────────────────────────────────────────────
create policy "Anyone authenticated can view active products"
  on products for select
  using (auth.uid() is not null and is_active = true);

create policy "Admins can manage products"
  on products for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Student subscriptions ───────────────────────────────────
create policy "Students can view own subscriptions"
  on student_subscriptions for select
  using (student_id = auth.uid());

create policy "Admins can manage subscriptions"
  on student_subscriptions for all
  using (is_admin());


-- ── Wallet transactions ─────────────────────────────────────
create policy "Students can view own transactions"
  on wallet_transactions for select
  using (student_id = auth.uid());

create policy "Admins can manage transactions"
  on wallet_transactions for all
  using (is_admin());


-- ── Payments ────────────────────────────────────────────────
create policy "Students can view own payments"
  on payments for select
  using (student_id = auth.uid());

create policy "Admins can manage payments"
  on payments for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Penalties ───────────────────────────────────────────────
create policy "Students can view own penalties"
  on penalties for select
  using (student_id = auth.uid());

create policy "Admins can manage penalties"
  on penalties for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Business rules ──────────────────────────────────────────
create policy "Anyone authenticated can view business rules"
  on business_rules for select
  using (auth.uid() is not null);

create policy "Admins can manage business rules"
  on business_rules for all
  using (is_admin() and academy_id = current_academy_id());


-- ── Admin tasks ─────────────────────────────────────────────
create policy "Admins can view and create admin tasks"
  on admin_tasks for all
  using (is_admin() and academy_id = current_academy_id());


-- === 00008_indexes.sql ===
-- ============================================================
-- BPM Booking System · Migration 00008
-- Performance indexes
-- ============================================================

-- ── Identity ────────────────────────────────────────────────
create index idx_users_academy          on users (academy_id);
create index idx_users_role             on users (role);
create index idx_users_email            on users (email);

-- ── Scheduling ──────────────────────────────────────────────
create index idx_classes_academy        on classes (academy_id);
create index idx_classes_style          on classes (dance_style_id);
create index idx_classes_day            on classes (day_of_week);
create index idx_classes_type           on classes (class_type);

create index idx_teacher_pairs_class    on teacher_pairs (class_id);
create index idx_teacher_pairs_active   on teacher_pairs (class_id)
  where is_active = true;

create index idx_bookable_academy_date  on bookable_classes (academy_id, date);
create index idx_bookable_class_id      on bookable_classes (class_id);
create index idx_bookable_status        on bookable_classes (status);
create index idx_bookable_date_type     on bookable_classes (date, class_type);

-- Prevent duplicate instances from the same template on the same date
create unique index idx_bookable_no_dup_instance
  on bookable_classes (class_id, date)
  where class_id is not null;

-- ── Bookings ────────────────────────────────────────────────
create index idx_bookings_student       on bookings (student_id);
create index idx_bookings_class         on bookings (bookable_class_id);
create index idx_bookings_status        on bookings (status);
create index idx_bookings_subscription  on bookings (subscription_id);

-- ── Waitlist ────────────────────────────────────────────────
create index idx_waitlist_class         on waitlist (bookable_class_id);
create index idx_waitlist_student       on waitlist (student_id);
create index idx_waitlist_status        on waitlist (status);
create index idx_waitlist_position      on waitlist (bookable_class_id, dance_role, position)
  where status = 'waiting';

-- ── Attendance ──────────────────────────────────────────────
create index idx_attendance_class       on attendance (bookable_class_id);
create index idx_attendance_student     on attendance (student_id);

-- ── Commerce ────────────────────────────────────────────────
create index idx_products_academy       on products (academy_id);
create index idx_products_type          on products (product_type);

create index idx_subscriptions_student  on student_subscriptions (student_id);
create index idx_subscriptions_status   on student_subscriptions (status);
create index idx_subscriptions_active   on student_subscriptions (student_id)
  where status = 'active';

create index idx_wallet_student         on wallet_transactions (student_id);
create index idx_wallet_subscription    on wallet_transactions (subscription_id);

create index idx_payments_student       on payments (student_id);
create index idx_payments_academy       on payments (academy_id);

-- ── Ops ─────────────────────────────────────────────────────
create index idx_penalties_student      on penalties (student_id);
create index idx_penalties_class        on penalties (bookable_class_id);
create index idx_penalties_academy      on penalties (academy_id);

create index idx_business_rules_academy on business_rules (academy_id);

create index idx_admin_tasks_academy    on admin_tasks (academy_id);
create index idx_admin_tasks_entity     on admin_tasks (entity_type, entity_id);
create index idx_admin_tasks_date       on admin_tasks (created_at desc);


-- === 00009_schema_alignment.sql ===
-- ============================================================
-- BPM Booking System · Migration 00009
-- Schema alignment with in-memory model.
--
-- Adds missing enums, tables (terms, coc_acceptances,
-- birthday_redemptions), and columns needed to match the
-- full business-layer model.
-- ============================================================

-- ── Enum alignment ────────────────────────────────────────────

-- booking_status: add checked_in, late_cancelled, missed
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'checked_in';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'late_cancelled';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'missed';

-- product_type: add "pass" (domain uses pass instead of pack)
ALTER TYPE product_type ADD VALUE IF NOT EXISTS 'pass';


-- ── Terms table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS terms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid        NOT NULL REFERENCES academies(id),
  name        text        NOT NULL,
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  status      text        NOT NULL DEFAULT 'draft',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_terms_dates CHECK (end_date > start_date)
);

ALTER TABLE terms ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_terms_updated_at
  BEFORE UPDATE ON terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── Code of Conduct acceptances ───────────────────────────────

CREATE TABLE IF NOT EXISTS coc_acceptances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version     text        NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, version)
);

ALTER TABLE coc_acceptances ENABLE ROW LEVEL SECURITY;


-- ── Birthday redemptions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS birthday_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year        int         NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, year)
);

ALTER TABLE birthday_redemptions ENABLE ROW LEVEL SECURITY;


-- ── Extend products table ─────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS long_description     text,
  ADD COLUMN IF NOT EXISTS term_bound           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS classes_per_term     int,
  ADD COLUMN IF NOT EXISTS auto_renew           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS benefits             text[],
  ADD COLUMN IF NOT EXISTS credits_model        text,
  ADD COLUMN IF NOT EXISTS validity_description text,
  ADD COLUMN IF NOT EXISTS is_provisional       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes                text;


-- ── Extend student_subscriptions table ────────────────────────

ALTER TABLE student_subscriptions
  ADD COLUMN IF NOT EXISTS payment_method       text,
  ADD COLUMN IF NOT EXISTS payment_status       text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS assigned_by          uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_at          timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS term_id              uuid REFERENCES terms(id),
  ADD COLUMN IF NOT EXISTS classes_used         int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classes_per_term     int,
  ADD COLUMN IF NOT EXISTS auto_renew           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selected_style_names text[],
  ADD COLUMN IF NOT EXISTS notes                text;


-- ── Extend bookings table ─────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS check_in_method text,
  ADD COLUMN IF NOT EXISTS check_in_token  text,
  ADD COLUMN IF NOT EXISTS source          text,
  ADD COLUMN IF NOT EXISTS admin_note      text;


-- ── RLS policies for new tables ───────────────────────────────

-- Terms: all authenticated users can view, admins manage
CREATE POLICY "Authenticated users can view terms"
  ON terms FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage terms"
  ON terms FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- CoC acceptances: students see own, admins see all
CREATE POLICY "Students view own CoC acceptance"
  ON coc_acceptances FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students can insert own CoC acceptance"
  ON coc_acceptances FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins manage CoC acceptances"
  ON coc_acceptances FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Birthday redemptions: students see own, admins see all
CREATE POLICY "Students view own birthday redemptions"
  ON birthday_redemptions FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins manage birthday redemptions"
  ON birthday_redemptions FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());


-- ── Indexes for new tables ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_terms_academy     ON terms(academy_id);
CREATE INDEX IF NOT EXISTS idx_terms_status      ON terms(status);
CREATE INDEX IF NOT EXISTS idx_coc_student       ON coc_acceptances(student_id);
CREATE INDEX IF NOT EXISTS idx_birthday_student  ON birthday_redemptions(student_id);


-- === BACKFILL: seed academy and create user rows ===
INSERT INTO academies (name, slug) VALUES ('BPM Dublin', 'bpm-dublin')
ON CONFLICT (slug) DO NOTHING;

-- Backfill existing auth users into public.users
DO $$
DECLARE
  _acad_id uuid;
  _auth_user record;
BEGIN
  SELECT id INTO _acad_id FROM academies ORDER BY created_at LIMIT 1;
  
  FOR _auth_user IN SELECT * FROM auth.users LOOP
    INSERT INTO users (id, academy_id, email, full_name, role, phone)
    VALUES (
      _auth_user.id,
      _acad_id,
      _auth_user.email,
      COALESCE(_auth_user.raw_user_meta_data ->> 'full_name', _auth_user.email, 'User'),
      COALESCE((_auth_user.raw_user_meta_data ->> 'role')::user_role, 'student'),
      _auth_user.raw_user_meta_data ->> 'phone'
    )
    ON CONFLICT (id) DO NOTHING;
    
    IF COALESCE((_auth_user.raw_user_meta_data ->> 'role')::user_role, 'student') = 'student' THEN
      INSERT INTO student_profiles (id, preferred_role, date_of_birth)
      VALUES (
        _auth_user.id,
        (_auth_user.raw_user_meta_data ->> 'preferred_role')::dance_role,
        (_auth_user.raw_user_meta_data ->> 'date_of_birth')::date
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
END $$;
