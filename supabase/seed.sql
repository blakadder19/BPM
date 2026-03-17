-- ============================================================
-- BPM Booking System · Seed Data
-- Realistic demo content for local development.
-- Run with: supabase db reset
--
-- All UUIDs are deterministic for easy cross-referencing.
-- Password for all test users: password123
-- ============================================================

-- ── Academy ─────────────────────────────────────────────────

insert into academies (id, name, slug, timezone, currency, address, contact_email)
values (
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
  'Balance Power Motion',
  'bpm',
  'Europe/Dublin',
  'eur',
  'Dublin, Ireland',
  'info@bpm.dance'
);


-- ── Auth users ──────────────────────────────────────────────
-- Insert into Supabase auth.users; the handle_new_user trigger
-- auto-creates rows in users + student_profiles/teacher_profiles.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
values
  -- Admin
  ('00000000-0000-0000-0000-000000000000', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00001', 'authenticated', 'authenticated',
   'admin@bpm.dance', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"BPM Admin","role":"admin","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', ''),

  -- Teachers
  ('00000000-0000-0000-0000-000000000000', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002', 'authenticated', 'authenticated',
   'maria@bpm.dance', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"María García","role":"teacher","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', ''),

  ('00000000-0000-0000-0000-000000000000', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003', 'authenticated', 'authenticated',
   'carlos@bpm.dance', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"Carlos Rivera","role":"teacher","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', ''),

  -- Students
  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00001', 'authenticated', 'authenticated',
   'alice@test.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"Alice Murphy","role":"student","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', ''),

  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002', 'authenticated', 'authenticated',
   'bob@test.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"Bob O''Brien","role":"student","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', ''),

  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00003', 'authenticated', 'authenticated',
   'carol@test.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"Carol Walsh","role":"student","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', ''),

  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00004', 'authenticated', 'authenticated',
   'dave@test.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"Dave Keane","role":"student","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', ''),

  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00005', 'authenticated', 'authenticated',
   'eve@test.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"Eve Byrne","role":"student","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', '');


-- ── Enrich teacher profiles ─────────────────────────────────

update teacher_profiles
set bio = 'Professional Bachata and Salsa instructor with 10+ years of experience.',
    specialties = '{Bachata,Salsa Line,Bachata Tradicional}'
where id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002';

update teacher_profiles
set bio = 'Cuban Salsa and Afro-Cuban specialist. Founder of BPM Dublin.',
    specialties = '{Cuban,Afro-Cuban,Reggaeton}'
where id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003';


-- ── Enrich student profiles ─────────────────────────────────

update student_profiles set preferred_role = 'follower' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00001';
update student_profiles set preferred_role = 'leader'   where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002';
update student_profiles set preferred_role = 'follower' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00003';
update student_profiles set preferred_role = 'leader'   where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00004';
update student_profiles set preferred_role = 'follower' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00005';


-- ── Dance styles ────────────────────────────────────────────

insert into dance_styles (id, name, requires_role_balance, sort_order) values
  ('d0d0d0d0-0000-0000-0000-000000000001', 'Bachata',               true,  1),
  ('d0d0d0d0-0000-0000-0000-000000000002', 'Bachata Tradicional',   true,  2),
  ('d0d0d0d0-0000-0000-0000-000000000003', 'Bachata Partnerwork',   true,  3),
  ('d0d0d0d0-0000-0000-0000-000000000004', 'Cuban',                 true,  4),
  ('d0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line',            true,  5),
  ('d0d0d0d0-0000-0000-0000-000000000006', 'Reggaeton',             false, 6),
  ('d0d0d0d0-0000-0000-0000-000000000007', 'Ladies Styling',        false, 7),
  ('d0d0d0d0-0000-0000-0000-000000000008', 'Afro-Cuban',            false, 8);


-- ── Class templates (weekly schedule) ───────────────────────
-- day_of_week: 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday

-- Monday
insert into classes (id, academy_id, dance_style_id, title, class_type, level, day_of_week, start_time, end_time, max_capacity, leader_cap, follower_cap, location) values
  ('e0e0e0e0-0000-0000-0000-000000000001', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Beginner 1',     'class', 'Beginner 1',     1, '19:00', '20:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000002', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Beginner 2',       'class', 'Beginner 2',     1, '19:00', '20:00', 20, 10, 10, 'BPM Studio B'),
  ('e0e0e0e0-0000-0000-0000-000000000003', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Beginner 2',     'class', 'Beginner 2',     1, '20:00', '21:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000004', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Intermediate',     'class', 'Intermediate',   1, '20:00', '21:00', 16, 8,  8,  'BPM Studio B'),

-- Tuesday
  ('e0e0e0e0-0000-0000-0000-000000000005', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Beginner 1',  'class', 'Beginner 1',     2, '19:00', '20:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000006', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Beginner 2',  'class', 'Beginner 2',     2, '20:00', '21:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000007', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000006', 'Reggaeton Open',         'class', 'Open',           2, '20:00', '21:00', 25, null, null, 'BPM Studio B'),

-- Wednesday
  ('e0e0e0e0-0000-0000-0000-000000000008', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000002', 'Bachata Tradicional Beg 1', 'class', 'Beginner 1',  3, '19:00', '20:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000009', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000003', 'Bachata Partnerwork Int',   'class', 'Intermediate', 3, '20:00', '21:00', 16, 8,  8,  'BPM Studio A'),

-- Thursday
  ('e0e0e0e0-0000-0000-0000-000000000010', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Beginner 1',          'class', 'Beginner 1',  4, '19:00', '20:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000011', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000007', 'Ladies Styling Open',       'class', 'Open',         4, '20:00', '21:00', 20, null, null, 'BPM Studio A'),

-- Friday
  ('e0e0e0e0-0000-0000-0000-000000000012', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', null,                                    'BPM Friday Social',         'social', null,         5, '21:00', '01:00', null, null, null, 'BPM Studio'),

-- Saturday
  ('e0e0e0e0-0000-0000-0000-000000000013', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', null,                                    'Student Practice',          'student_practice', null, 6, '14:00', '15:00', null, null, null, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000014', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000008', 'Afro-Cuban Open',           'class', 'Open',         6, '15:00', '16:00', 20, null, null, 'BPM Studio A');


-- ── Teacher pairs ───────────────────────────────────────────

insert into teacher_pairs (class_id, teacher_1_id, teacher_2_id, effective_from) values
  ('e0e0e0e0-0000-0000-0000-000000000001', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003', '2025-01-01'),
  ('e0e0e0e0-0000-0000-0000-000000000002', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003', null,                                     '2025-01-01'),
  ('e0e0e0e0-0000-0000-0000-000000000003', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003', '2025-01-01'),
  ('e0e0e0e0-0000-0000-0000-000000000004', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003', null,                                     '2025-01-01'),
  ('e0e0e0e0-0000-0000-0000-000000000005', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002', null,                                     '2025-01-01'),
  ('e0e0e0e0-0000-0000-0000-000000000006', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002', null,                                     '2025-01-01'),
  ('e0e0e0e0-0000-0000-0000-000000000008', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003', '2025-01-01'),
  ('e0e0e0e0-0000-0000-0000-000000000009', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003', '2025-01-01'),
  ('e0e0e0e0-0000-0000-0000-000000000010', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003', null,                                     '2025-01-01'),
  ('e0e0e0e0-0000-0000-0000-000000000014', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003', null,                                     '2025-01-01');


-- ── Bookable class instances (next week sample) ─────────────
-- Generate instances for next Mon–Sat from active class templates.
-- status = 'open' for classes, 'scheduled' for socials/practice.

do $$
declare
  _class    record;
  _next_day date;
  _status   instance_status;
begin
  for _class in select * from classes where is_active = true
  loop
    -- Calculate next occurrence of this day_of_week
    _next_day := current_date + ((7 + _class.day_of_week - extract(dow from current_date)::int) % 7);
    if _next_day <= current_date then
      _next_day := _next_day + 7;
    end if;

    -- Socials and student_practice stay 'scheduled'; classes open for booking
    if _class.class_type = 'class' then
      _status := 'open';
    else
      _status := 'scheduled';
    end if;

    insert into bookable_classes (
      academy_id, class_id, dance_style_id, title, class_type, level,
      date, start_time, end_time, max_capacity, leader_cap, follower_cap,
      status, location
    ) values (
      _class.academy_id, _class.id, _class.dance_style_id, _class.title, _class.class_type, _class.level,
      _next_day, _class.start_time, _class.end_time, _class.max_capacity, _class.leader_cap, _class.follower_cap,
      _status, _class.location
    );
  end loop;
end $$;


-- ── Products (catalog) ──────────────────────────────────────

insert into products (id, academy_id, name, description, product_type, price_cents, total_credits, duration_days, dance_style_id, allowed_levels, metadata) values
  -- Monthly Unlimited Membership
  ('f0f0f0f0-0000-0000-0000-000000000001',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Monthly Unlimited',
   'Unlimited access to all classes for one month.',
   'membership', 8000, null, 30, null, null, '{}'),

  -- 10-Class Pack
  ('f0f0f0f0-0000-0000-0000-000000000002',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   '10-Class Pack',
   '10 classes, any style, valid for 3 months.',
   'pack', 7000, 10, 90, null, null, '{}'),

  -- 5-Class Pack
  ('f0f0f0f0-0000-0000-0000-000000000003',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   '5-Class Pack',
   '5 classes, any style, valid for 2 months.',
   'pack', 4000, 5, 60, null, null, '{}'),

  -- Single Class Drop-in
  ('f0f0f0f0-0000-0000-0000-000000000004',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Single Class Drop-in',
   'One-time class entry.',
   'drop_in', 1000, 1, 30, null, null, '{}'),

  -- Beginners 1 & 2 Pass (style-specific promo)
  ('f0f0f0f0-0000-0000-0000-000000000005',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Beginners 1 & 2 Pass',
   'Covers Beginner 1 and Beginner 2 for ONE selected style. Valid 8 weeks.',
   'promo_pass', 2500, 16, 56, null, '{Beginner 1,Beginner 2}',
   '{"style_required": true, "description_note": "Student picks one style at purchase."}'),

  -- Beginners Latin Combo (PROVISIONAL)
  ('f0f0f0f0-0000-0000-0000-000000000006',
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Beginners Latin Combo',
   'Covers Beginner 1 in TWO of three Latin styles (Bachata, Cuban, Salsa Line). Valid 8 weeks. PROVISIONAL.',
   'promo_pass', 3500, 16, 56, null, '{Beginner 1}',
   '{"is_provisional": true, "pick_n_styles": 2, "eligible_styles": ["Bachata", "Cuban", "Salsa Line"]}');


-- ── Sample subscriptions ────────────────────────────────────

insert into student_subscriptions (id, student_id, product_id, status, total_credits, remaining_credits, valid_from, valid_until, dance_style_id, allowed_levels) values
  -- Alice: Monthly Unlimited
  ('11111111-0000-0000-0000-000000000001',
   'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00001',
   'f0f0f0f0-0000-0000-0000-000000000001',
   'active', null, null, current_date, current_date + 30, null, null),

  -- Bob: 10-Class Pack (7 remaining)
  ('11111111-0000-0000-0000-000000000002',
   'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002',
   'f0f0f0f0-0000-0000-0000-000000000002',
   'active', 10, 7, current_date - 14, current_date + 76, null, null),

  -- Carol: Beginners 1 & 2 Pass for Bachata
  ('11111111-0000-0000-0000-000000000003',
   'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00003',
   'f0f0f0f0-0000-0000-0000-000000000005',
   'active', 16, 14, current_date - 7, current_date + 49,
   'd0d0d0d0-0000-0000-0000-000000000001', '{Beginner 1,Beginner 2}'),

  -- Dave: 5-Class Pack (3 remaining)
  ('11111111-0000-0000-0000-000000000004',
   'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00004',
   'f0f0f0f0-0000-0000-0000-000000000003',
   'active', 5, 3, current_date - 21, current_date + 39, null, null);

  -- Eve: no active subscription (will need a drop-in)


-- ── Sample bookings (for the generated bookable_classes) ────
-- Book Alice and Bob into Bachata Beg 1 (next Monday)

do $$
declare
  _bclass_id uuid;
begin
  select id into _bclass_id
  from bookable_classes
  where class_id = 'e0e0e0e0-0000-0000-0000-000000000001'
    and status = 'open'
  order by date limit 1;

  if _bclass_id is not null then
    insert into bookings (bookable_class_id, student_id, dance_role, status, subscription_id) values
      (_bclass_id, 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00001', 'follower', 'confirmed', '11111111-0000-0000-0000-000000000001'),
      (_bclass_id, 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002', 'leader',   'confirmed', '11111111-0000-0000-0000-000000000002');

    -- Wallet transactions for Bob's pack credit
    update student_subscriptions set remaining_credits = remaining_credits - 1 where id = '11111111-0000-0000-0000-000000000002';
    insert into wallet_transactions (student_id, subscription_id, booking_id, tx_type, credits, balance_after, description)
    select 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002', '11111111-0000-0000-0000-000000000002', b.id, 'credit_used', -1, 6,
           'Booked Bachata Beginner 1'
    from bookings b where b.bookable_class_id = _bclass_id and b.student_id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002';
  end if;
end $$;


-- ── Business rules ──────────────────────────────────────────

insert into business_rules (academy_id, key, value, description, is_provisional) values
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'late_cancel_fee_cents',      '200',                                                     'Late cancellation fee in cents',                       false),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'no_show_fee_cents',          '500',                                                     'No-show fee in cents',                                 false),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'late_cancel_threshold_hours', '24',                                                     'Hours before class start for late cancel cutoff',      true),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'credit_deduction_priority',  '["promo_pass","pack","drop_in","membership"]',             'Order to resolve credit source when booking',          true),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'student_practice_bookable',  'false',                                                   'Whether Student Practice events are bookable',         true),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'waitlist_offer_expiry_hours','4',                                                       'Hours before a waitlist offer expires',                 true),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'role_balanced_styles',       '["Bachata","Bachata Tradicional","Bachata Partnerwork","Cuban","Salsa Line"]', 'Styles requiring leader/follower balance', false);
