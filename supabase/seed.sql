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

  -- Students (8 to match mock-data)
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
   now(), now(), '', ''),

  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00006', 'authenticated', 'authenticated',
   'fiona@test.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"Fiona Doyle","role":"student","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', ''),

  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00007', 'authenticated', 'authenticated',
   'gary@test.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"Gary Nolan","role":"student","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
   now(), now(), '', ''),

  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00008', 'authenticated', 'authenticated',
   'hannah@test.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"Hannah Ryan","role":"student","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
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

update student_profiles set preferred_role = 'follower', date_of_birth = '1995-03-22' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00001';
update student_profiles set preferred_role = 'leader',   date_of_birth = '1992-07-15' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002';
update student_profiles set preferred_role = 'follower', date_of_birth = '1998-11-30' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00003';
update student_profiles set preferred_role = 'leader',   date_of_birth = '1990-01-10' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00004';
update student_profiles set preferred_role = 'follower', date_of_birth = '1996-06-05' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00005';
update student_profiles set preferred_role = 'leader',   date_of_birth = '1993-09-18' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00006';
update student_profiles set preferred_role = 'follower', date_of_birth = '1997-04-12' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00007';
update student_profiles set preferred_role = 'leader',   date_of_birth = '1994-12-28' where id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00008';


-- ── Terms ───────────────────────────────────────────────────

insert into terms (id, academy_id, name, start_date, end_date, status) values
  ('00000000-0000-0000-0001-000000000001', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 1 – 2026', '2026-01-12', '2026-02-06', 'past'),
  ('00000000-0000-0000-0001-000000000002', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 2 – 2026', '2026-02-10', '2026-03-27', 'active');


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

insert into classes (id, academy_id, dance_style_id, title, class_type, level, day_of_week, start_time, end_time, max_capacity, leader_cap, follower_cap, location) values
  ('e0e0e0e0-0000-0000-0000-000000000001', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Beginner 1',     'class', 'Beginner 1',     1, '19:00', '20:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000002', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Beginner 2',       'class', 'Beginner 2',     1, '19:00', '20:00', 20, 10, 10, 'BPM Studio B'),
  ('e0e0e0e0-0000-0000-0000-000000000003', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Beginner 2',     'class', 'Beginner 2',     1, '20:00', '21:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000004', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Intermediate',     'class', 'Intermediate',   1, '20:00', '21:00', 16, 8,  8,  'BPM Studio B'),
  ('e0e0e0e0-0000-0000-0000-000000000005', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Beginner 1',  'class', 'Beginner 1',     2, '19:00', '20:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000006', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Beginner 2',  'class', 'Beginner 2',     2, '20:00', '21:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000007', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000006', 'Reggaeton Open',         'class', 'Open',           2, '20:00', '21:00', 25, null, null, 'BPM Studio B'),
  ('e0e0e0e0-0000-0000-0000-000000000008', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000002', 'Bachata Tradicional Beg 1', 'class', 'Beginner 1',  3, '19:00', '20:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000009', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000003', 'Bachata Partnerwork Int',   'class', 'Intermediate', 3, '20:00', '21:00', 16, 8,  8,  'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000010', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Beginner 1',          'class', 'Beginner 1',  4, '19:00', '20:00', 20, 10, 10, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000011', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'd0d0d0d0-0000-0000-0000-000000000007', 'Ladies Styling Open',       'class', 'Open',         4, '20:00', '21:00', 20, null, null, 'BPM Studio A'),
  ('e0e0e0e0-0000-0000-0000-000000000012', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', null,                                    'BPM Friday Social',         'social', null,         5, '21:00', '01:00', null, null, null, 'BPM Studio'),
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


-- ── Bookable class instances ────────────────────────────────

do $$
declare
  _class    record;
  _next_day date;
  _status   instance_status;
begin
  for _class in select * from classes where is_active = true
  loop
    _next_day := current_date + ((7 + _class.day_of_week - extract(dow from current_date)::int) % 7);
    if _next_day <= current_date then
      _next_day := _next_day + 7;
    end if;

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


-- ── Products (full catalog matching mock-data) ──────────────

insert into products (id, academy_id, name, description, long_description, product_type, price_cents, total_credits, duration_days, dance_style_id, allowed_levels, term_bound, recurring, classes_per_term, auto_renew, benefits, credits_model, is_provisional, metadata) values
  -- 4 Classes Membership
  ('f0f0f0f0-0000-0000-0000-000000000001', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   '4 Classes Membership', '4 classes per term, any style.', '4 classes per 4-week term. Includes birthday-week free class, member giveaway eligibility, and free weekend Student Practice.',
   'membership', 4000, null, null, null, null, true, true, 4, true,
   '{"1 free class during birthday week","Member giveaway eligibility","Free weekend Student Practice"}',
   'unlimited', false, '{}'),

  -- 8 Classes Membership
  ('f0f0f0f0-0000-0000-0000-000000000002', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   '8 Classes Membership', '8 classes per term, any style.', '8 classes per 4-week term. Includes birthday-week free class, member giveaway eligibility, and free weekend Student Practice.',
   'membership', 6500, null, null, null, null, true, true, 8, true,
   '{"1 free class during birthday week","Member giveaway eligibility","Free weekend Student Practice"}',
   'unlimited', false, '{}'),

  -- 12 Classes Membership
  ('f0f0f0f0-0000-0000-0000-000000000003', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   '12 Classes Membership', '12 classes per term, any style.', '12 classes per 4-week term. Includes birthday-week free class, member giveaway eligibility, and free weekend Student Practice.',
   'membership', 8500, null, null, null, null, true, true, 12, true,
   '{"1 free class during birthday week","Member giveaway eligibility","Free weekend Student Practice"}',
   'unlimited', false, '{}'),

  -- 16 Classes Membership
  ('f0f0f0f0-0000-0000-0000-000000000004', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   '16 Classes Membership', '16 classes per term. Maximum flexibility.', '16 classes per 4-week term. Includes birthday-week free class, member giveaway eligibility, and free weekend Student Practice.',
   'membership', 10000, null, null, null, null, true, true, 16, true,
   '{"1 free class during birthday week","Member giveaway eligibility","Free weekend Student Practice"}',
   'unlimited', false, '{}'),

  -- Beginners 1 & 2 Pass
  ('f0f0f0f0-0000-0000-0000-000000000005', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Beginners 1 & 2 Pass', 'Covers Beg 1 and Beg 2 for one style.', 'Access to Beginner 1 and Beginner 2 for ONE selected style. Valid for 8 weeks (2 terms).',
   'pass', 2500, 16, 56, null, '{Beginner 1,Beginner 2}', true, false, null, false,
   null, 'fixed', false,
   '{"style_required": true}'),

  -- Beginners Latin Combo (PROVISIONAL)
  ('f0f0f0f0-0000-0000-0000-000000000006', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Beginners Latin Combo', 'Beg 1 in two of three Latin styles.', 'Covers Beginner 1 in TWO of three Latin styles (Bachata, Cuban, Salsa Line). Valid for 8 weeks (2 terms). PROVISIONAL.',
   'pass', 3500, 16, 56, null, '{Beginner 1}', true, false, null, false,
   null, 'fixed', true,
   '{"pick_n_styles": 2, "eligible_styles": ["Bachata", "Cuban", "Salsa Line"]}'),

  -- Single Class Drop-in
  ('f0f0f0f0-0000-0000-0000-000000000007', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Single Class Drop-in', 'One-time class entry.', 'Pay-per-class entry for any open class. No membership required.',
   'drop_in', 1200, 1, 1, null, null, false, false, null, false,
   null, 'single_use', false, '{}');


-- ── Subscriptions with payment metadata ─────────────────────

insert into student_subscriptions (id, student_id, product_id, status, total_credits, remaining_credits, valid_from, valid_until, dance_style_id, allowed_levels, payment_method, payment_status, assigned_at, term_id, classes_used, classes_per_term, auto_renew, selected_style_names) values
  -- Alice: 8 Classes Membership (paid via Revolut)
  ('11111111-0000-0000-0000-000000000001',
   'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00001',
   'f0f0f0f0-0000-0000-0000-000000000002',
   'active', null, null, '2026-02-10', '2026-03-27', null, null,
   'revolut', 'paid', now(),
   '00000000-0000-0000-0001-000000000002', 3, 8, true, null),

  -- Bob: Beginners 1 & 2 Pass for Bachata (paid via card)
  ('11111111-0000-0000-0000-000000000002',
   'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002',
   'f0f0f0f0-0000-0000-0000-000000000005',
   'active', 16, 12, '2026-02-10', '2026-04-06',
   'd0d0d0d0-0000-0000-0000-000000000001', '{Beginner 1,Beginner 2}',
   'card', 'paid', now(),
   '00000000-0000-0000-0001-000000000002', 4, null, false, '{"Bachata"}'),

  -- Carol: 4 Classes Membership (paid via bank transfer)
  ('11111111-0000-0000-0000-000000000003',
   'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00003',
   'f0f0f0f0-0000-0000-0000-000000000001',
   'active', null, null, '2026-02-10', '2026-03-27', null, null,
   'bank_transfer', 'paid', now(),
   '00000000-0000-0000-0001-000000000002', 2, 4, true, null),

  -- Dave: 16 Classes Membership (paid cash)
  ('11111111-0000-0000-0000-000000000004',
   'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00004',
   'f0f0f0f0-0000-0000-0000-000000000004',
   'active', null, null, '2026-02-10', '2026-03-27', null, null,
   'cash', 'paid', now(),
   '00000000-0000-0000-0001-000000000002', 6, 16, true, null),

  -- Fiona: 12 Classes Membership (complimentary via admin)
  ('11111111-0000-0000-0000-000000000005',
   'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00006',
   'f0f0f0f0-0000-0000-0000-000000000003',
   'active', null, null, '2026-02-10', '2026-03-27', null, null,
   'manual', 'complimentary', now(),
   '00000000-0000-0000-0001-000000000002', 1, 12, false, null);


-- ── Code of Conduct acceptances ─────────────────────────────

insert into coc_acceptances (student_id, version, accepted_at) values
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00001', '1.0', '2026-01-20T10:00:00Z'),
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002', '1.0', '2026-02-01T14:30:00Z'),
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00006', '1.0', '2026-01-25T09:15:00Z'),
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00003', '1.0', '2026-02-05T11:00:00Z'),
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00004', '1.0', '2026-02-08T16:00:00Z');


-- ── Sample bookings ─────────────────────────────────────────

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
