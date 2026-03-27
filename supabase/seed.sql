-- ============================================================
-- BPM Booking System · Seed Data
-- Aligned with the real BPM Academy schedule and catalog.
-- Source: BPM booking document + lib/mock-data.ts
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
-- Only seed the admin + 2 teachers here. The 3 demo login accounts
-- (admin@bpm.dance, teacher@bpm.dance, student@bpm.dance) are created
-- manually in the Supabase dashboard for the hosted project.
-- This seed is for local dev (supabase db reset) only.

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

  -- Generic student (local dev only)
  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00001', 'authenticated', 'authenticated',
   'student@bpm.dance', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   format('{"full_name":"BPM Student","role":"student","academy_id":"%s"}', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001')::jsonb,
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


-- ── Terms (Real BPM 2026 — 9 × 4-week blocks) ──────────────
-- Source: BPM document. Term 1 starts Mon 30 Mar 2026.

insert into terms (id, academy_id, name, start_date, end_date, status) values
  ('00000000-0000-0000-0001-000000000001', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 1 – 2026', '2026-03-30', '2026-04-26', 'active'),
  ('00000000-0000-0000-0001-000000000002', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 2 – 2026', '2026-04-27', '2026-05-24', 'upcoming'),
  ('00000000-0000-0000-0001-000000000003', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 3 – 2026', '2026-05-25', '2026-06-21', 'upcoming'),
  ('00000000-0000-0000-0001-000000000004', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 4 – 2026', '2026-06-22', '2026-07-19', 'upcoming'),
  ('00000000-0000-0000-0001-000000000005', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 5 – 2026', '2026-07-20', '2026-08-16', 'upcoming'),
  ('00000000-0000-0000-0001-000000000006', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 6 – 2026', '2026-08-17', '2026-09-13', 'upcoming'),
  ('00000000-0000-0000-0001-000000000007', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 7 – 2026', '2026-09-14', '2026-10-11', 'upcoming'),
  ('00000000-0000-0000-0001-000000000008', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 8 – 2026', '2026-10-12', '2026-11-08', 'upcoming'),
  ('00000000-0000-0000-0001-000000000009', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Term 9 – 2026', '2026-11-09', '2026-12-06', 'upcoming');


-- ── Dance styles (all 10 from BPM document) ─────────────────

insert into dance_styles (id, name, requires_role_balance, sort_order) values
  ('d0d0d0d0-0000-0000-0000-000000000001', 'Bachata',               true,  1),
  ('d0d0d0d0-0000-0000-0000-000000000002', 'Bachata Tradicional',   true,  2),
  ('d0d0d0d0-0000-0000-0000-000000000004', 'Cuban',                 true,  3),
  ('d0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line',            true,  4),
  ('d0d0d0d0-0000-0000-0000-000000000006', 'Reggaeton',             false, 6),
  ('d0d0d0d0-0000-0000-0000-000000000007', 'Ladies Styling',        false, 7),
  ('d0d0d0d0-0000-0000-0000-000000000008', 'Afro-Cuban',            false, 8),
  ('d0d0d0d0-0000-0000-0000-000000000009', 'Yoga',                  false, 9),
  ('d0d0d0d0-0000-0000-0000-000000000010', 'Kids Hip Hop',          false, 10);


-- ── Class templates (full BPM April timetable — 37 slots) ───
-- Source: mock-data.ts CLASSES array derived from BPM document.
-- term_bound = true only for Beginner 1 and Beginner 2 classes.
-- term_id points to Term 1 for term-bound classes.
--
-- Abbreviations for dance_style_id:
--   ds01 = Bachata, ds02 = Bachata Tradicional
--   ds04 = Cuban, ds05 = Salsa Line, ds06 = Reggaeton
--   ds07 = Ladies Styling, ds08 = Afro-Cuban, ds09 = Yoga, ds10 = Kids Hip Hop

insert into classes (id, academy_id, dance_style_id, title, class_type, level, day_of_week, start_time, end_time, max_capacity, leader_cap, follower_cap, location, term_bound, term_id) values

  -- ── MONDAY (day_of_week = 1) ──────────────────────────────
  ('e0e0e0e0-0000-0000-0000-000000000001', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000009', 'Yoga Flow',
   'class', 'All Levels', 1, '10:00', '11:00', 25, null, null, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000002', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000009', 'Yoga Flow',
   'class', 'All Levels', 1, '11:00', '12:00', 25, null, null, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000003', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Improvers',
   'class', 'Improvers', 1, '18:30', '19:30', 16, 8, 8, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000004', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Intermediate',
   'class', 'Intermediate', 1, '18:30', '19:30', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000005', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Improvers',
   'class', 'Improvers', 1, '19:30', '20:30', 16, 8, 8, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000006', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Intermediate',
   'class', 'Intermediate', 1, '19:30', '20:30', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000007', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Improvers',
   'class', 'Improvers', 1, '20:30', '21:30', 16, 8, 8, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000008', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Intermediate',
   'class', 'Intermediate', 1, '20:30', '21:30', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000009', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   null, 'Monday Social',
   'social', null, 1, '21:30', '00:00', null, null, null, 'BPM Studio', false, null),

  -- ── TUESDAY (day_of_week = 2) ─────────────────────────────
  ('e0e0e0e0-0000-0000-0000-000000000010', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000009', 'Yoga Flow',
   'class', 'All Levels', 2, '10:00', '11:00', 25, null, null, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000011', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000009', 'Yoga Flow',
   'class', 'All Levels', 2, '11:00', '12:00', 25, null, null, 'Studio A', false, null),

  -- ── WEDNESDAY (day_of_week = 3) ───────────────────────────
  ('e0e0e0e0-0000-0000-0000-000000000012', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000010', 'Kids Hip Hop',
   'class', null, 3, '13:30', '14:30', 15, null, null, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000013', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000009', 'Yoga Strength & Stability',
   'class', 'Strength & Stability', 3, '17:30', '18:30', 25, null, null, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000014', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Beginners 1',
   'class', 'Beginner 1', 3, '18:30', '19:30', 20, 10, 10, 'Studio A',
   true, '00000000-0000-0000-0001-000000000001'),

  ('e0e0e0e0-0000-0000-0000-000000000015', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Beginners 1',
   'class', 'Beginner 1', 3, '19:30', '20:30', 20, 10, 10, 'Studio A',
   true, '00000000-0000-0000-0001-000000000001'),

  ('e0e0e0e0-0000-0000-0000-000000000016', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Beginners 1',
   'class', 'Beginner 1', 3, '20:30', '21:30', 20, 10, 10, 'Studio A',
   true, '00000000-0000-0000-0001-000000000001'),

  ('e0e0e0e0-0000-0000-0000-000000000017', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Intermediate',
   'class', 'Intermediate', 3, '20:30', '21:30', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000018', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   null, 'Wednesday Social',
   'social', null, 3, '21:30', '00:00', null, null, null, 'BPM Studio', false, null),

  -- ── FRIDAY (day_of_week = 5) ──────────────────────────────
  ('e0e0e0e0-0000-0000-0000-000000000019', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Improvers',
   'class', 'Improvers', 5, '18:00', '19:00', 16, 8, 8, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000020', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Intermediate',
   'class', 'Intermediate', 5, '18:00', '19:00', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000021', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Improvers',
   'class', 'Improvers', 5, '19:00', '20:00', 16, 8, 8, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000022', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Intermediate',
   'class', 'Intermediate', 5, '19:00', '20:00', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000023', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000002', 'Bachata Traditional',
   'class', 'Open', 5, '20:00', '21:00', 20, 10, 10, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000024', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Improvers',
   'class', 'Improvers', 5, '21:00', '22:00', 16, 8, 8, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000025', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Intermediate',
   'class', 'Intermediate', 5, '21:00', '22:00', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000026', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   null, 'Friday Social',
   'social', null, 5, '22:00', '01:00', null, null, null, 'BPM Studio', false, null),

  -- ── SATURDAY (day_of_week = 6) ────────────────────────────
  ('e0e0e0e0-0000-0000-0000-000000000027', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Beginners 1',
   'class', 'Beginner 1', 6, '13:00', '14:00', 20, 10, 10, 'Studio A',
   true, '00000000-0000-0000-0001-000000000001'),

  ('e0e0e0e0-0000-0000-0000-000000000028', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Intermediate',
   'class', 'Intermediate', 6, '13:00', '14:00', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000029', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Beginners 1',
   'class', 'Beginner 1', 6, '14:00', '15:00', 20, 10, 10, 'Studio A',
   true, '00000000-0000-0000-0001-000000000001'),

  ('e0e0e0e0-0000-0000-0000-000000000030', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Intermediate',
   'class', 'Intermediate', 6, '14:00', '15:00', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000031', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   null, 'Student Practice',
   'student_practice', null, 6, '15:00', '16:00', null, null, null, 'Studio A', false, null),

  -- ── SUNDAY (day_of_week = 0) ──────────────────────────────
  ('e0e0e0e0-0000-0000-0000-000000000032', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000004', 'Cuban Beginners 1',
   'class', 'Beginner 1', 0, '13:00', '14:00', 20, 10, 10, 'Studio A',
   true, '00000000-0000-0000-0001-000000000001'),

  ('e0e0e0e0-0000-0000-0000-000000000033', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000005', 'Salsa Line Intermediate',
   'class', 'Intermediate', 0, '13:00', '14:00', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000034', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Beginners 1',
   'class', 'Beginner 1', 0, '14:00', '15:00', 20, 10, 10, 'Studio A',
   true, '00000000-0000-0000-0001-000000000001'),

  ('e0e0e0e0-0000-0000-0000-000000000035', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000001', 'Bachata Intermediate',
   'class', 'Intermediate', 0, '14:00', '15:00', 16, 8, 8, 'Studio B', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000036', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   null, 'Student Practice',
   'student_practice', null, 0, '15:00', '16:00', null, null, null, 'Studio A', false, null),

  ('e0e0e0e0-0000-0000-0000-000000000037', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'd0d0d0d0-0000-0000-0000-000000000009', 'Yoga Reset & Recovery',
   'class', 'Reset & Recovery', 0, '17:00', '18:00', 25, null, null, 'Studio A', false, null);


-- ── Teacher pairs (legacy) ─────────────────────────────────
-- Legacy table from migration 00003. Not read by the app (which uses
-- teacher_roster + teacher_default_assignments instead). Left empty.


-- ── Teacher roster ─────────────────────────────────────────
-- Admin-managed roster entries (used by the Teachers tab).
-- These are standalone roster records, NOT auth.users.
-- Emails left null where the source did not provide them.

insert into teacher_roster (id, academy_id, full_name, email, category, is_active) values
  -- Core instructors
  ('f0f0f0f0-0000-0000-0000-000000000001', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Zaria',     null, 'core_instructor', true),
  ('f0f0f0f0-0000-0000-0000-000000000002', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Guillermo', null, 'core_instructor', true),
  ('f0f0f0f0-0000-0000-0000-000000000003', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Berkan',    null, 'core_instructor', true),
  ('f0f0f0f0-0000-0000-0000-000000000004', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Bilge',     null, 'core_instructor', true),
  -- Instructors
  ('f0f0f0f0-0000-0000-0000-000000000005', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Miguel',    null, 'instructor', true),
  ('f0f0f0f0-0000-0000-0000-000000000006', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Seda',      null, 'instructor', true),
  ('f0f0f0f0-0000-0000-0000-000000000007', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Mario',     null, 'instructor', true),
  ('f0f0f0f0-0000-0000-0000-000000000008', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Camila',    null, 'instructor', true),
  -- Yoga instructors
  ('f0f0f0f0-0000-0000-0000-000000000009', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Jennifer',  null, 'yoga', true),
  ('f0f0f0f0-0000-0000-0000-000000000010', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Gizem',     null, 'yoga', true),
  -- Crew
  ('f0f0f0f0-0000-0000-0000-000000000011', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Corey',     null, 'crew', true),
  ('f0f0f0f0-0000-0000-0000-000000000012', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Orlaith',   null, 'crew', true),
  ('f0f0f0f0-0000-0000-0000-000000000013', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Marta',     null, 'crew', true),
  ('f0f0f0f0-0000-0000-0000-000000000014', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'Laura',     null, 'crew', true);

-- ── Teacher default assignments ────────────────────────────
-- Left empty — real assignments to be created via the admin UI
-- once the academy confirms who teaches what.


-- ── Bookable class instances (Term 1: all 4 weeks) ──────────
-- Generates one instance per class template per week of Term 1.

do $$
declare
  _term_start  date := '2026-03-30';
  _term_end    date := '2026-04-26';
  _class       record;
  _week_start  date;
  _inst_date   date;
  _status      instance_status;
begin
  for _class in select * from classes where is_active = true
  loop
    _week_start := _term_start;
    while _week_start <= _term_end loop
      _inst_date := _week_start + ((7 + _class.day_of_week - extract(dow from _week_start)::int) % 7);

      if _inst_date > _term_end then
        _week_start := _week_start + 7;
        continue;
      end if;

      if _class.class_type = 'class' then
        _status := 'open';
      else
        _status := 'scheduled';
      end if;

      insert into bookable_classes (
        academy_id, class_id, dance_style_id, title, class_type, level,
        date, start_time, end_time, max_capacity, leader_cap, follower_cap,
        status, location, term_bound, term_id
      ) values (
        _class.academy_id, _class.id, _class.dance_style_id,
        _class.title, _class.class_type, _class.level,
        _inst_date, _class.start_time, _class.end_time,
        _class.max_capacity, _class.leader_cap, _class.follower_cap,
        _status, _class.location,
        _class.term_bound, _class.term_id
      );

      _week_start := _week_start + 7;
    end loop;
  end loop;
end $$;


-- ── Products (final BPM catalog matching lib/mock-data.ts) ──

insert into products (id, academy_id, name, description, long_description, product_type, price_cents, total_credits, duration_days, dance_style_id, allowed_levels, term_bound, recurring, classes_per_term, auto_renew, benefits, credits_model, is_provisional, metadata, allowed_style_ids, allowed_style_names, style_name, span_terms) values

  -- ── Drop-in ──
  ('f0f0f0f0-0000-0000-0000-000000000007', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Drop In', 'One class pass. Pay at reception.',
   'A single-use class entry valid for any style and any level. Pay at reception or have it assigned by an admin. No term commitment required.',
   'drop_in', 1500, 1, null, null, null, false, false, null, false,
   null, 'single_use', false, '{}',
   null, null, 'All styles', null),

  -- ── Latin Passes (monthly, selected style) ──
  ('f0f0f0f0-0000-0000-0000-000000000010', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Bronze Latin Pass', '4 classes per month. One dance style of your choice.',
   '4 classes per month in one dance style of your choice. Pay online or at reception.',
   'pass', 5500, 4, 30, null, null, false, false, null, false,
   null, 'fixed', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000001','d0d0d0d0-0000-0000-0000-000000000002','d0d0d0d0-0000-0000-0000-000000000004','d0d0d0d0-0000-0000-0000-000000000005']::uuid[], ARRAY['Bachata','Bachata Tradicional','Cuban','Salsa Line'], '1 selected style', null),

  ('f0f0f0f0-0000-0000-0000-000000000011', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Silver Latin Pass', '8 classes per month. One dance style of your choice.',
   '8 classes per month in one dance style of your choice. Pay online or at reception.',
   'pass', 10500, 8, 30, null, null, false, false, null, false,
   null, 'fixed', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000001','d0d0d0d0-0000-0000-0000-000000000002','d0d0d0d0-0000-0000-0000-000000000004','d0d0d0d0-0000-0000-0000-000000000005']::uuid[], ARRAY['Bachata','Bachata Tradicional','Cuban','Salsa Line'], '1 selected style', null),

  ('f0f0f0f0-0000-0000-0000-000000000012', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Gold Latin Pass', '12 classes per month. One dance style of your choice.',
   '12 classes per month in one dance style of your choice. Pay online or at reception.',
   'pass', 15500, 12, 30, null, null, false, false, null, false,
   null, 'fixed', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000001','d0d0d0d0-0000-0000-0000-000000000002','d0d0d0d0-0000-0000-0000-000000000004','d0d0d0d0-0000-0000-0000-000000000005']::uuid[], ARRAY['Bachata','Bachata Tradicional','Cuban','Salsa Line'], '1 selected style', null),

  -- ── Yoga Passes (monthly, yoga only) ──
  ('f0f0f0f0-0000-0000-0000-000000000013', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Bronze Yoga Pass', '4 yoga classes per month.',
   '4 yoga classes per month. Pay online or at reception.',
   'pass', 5500, 4, 30, null, null, false, false, null, false,
   null, 'fixed', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000009']::uuid[], ARRAY['Yoga'], 'Yoga', null),

  ('f0f0f0f0-0000-0000-0000-000000000014', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Silver Yoga Pass', '8 yoga classes per month.',
   '8 yoga classes per month. Pay online or at reception.',
   'pass', 10500, 8, 30, null, null, false, false, null, false,
   null, 'fixed', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000009']::uuid[], ARRAY['Yoga'], 'Yoga', null),

  ('f0f0f0f0-0000-0000-0000-000000000015', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Gold Yoga Pass', '12 yoga classes per month.',
   '12 yoga classes per month. Pay online or at reception.',
   'pass', 15500, 12, 30, null, null, false, false, null, false,
   null, 'fixed', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000009']::uuid[], ARRAY['Yoga'], 'Yoga', null),

  -- ── Promo / Combo Passes ──
  ('f0f0f0f0-0000-0000-0000-000000000005', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Beginners 1 & 2 Promo Pass', '8 classes of one dance style. Covers Beginner 1 + 2.',
   '8 classes in one selected dance style covering Beginner 1 and Beginner 2 levels. Spans 2 terms (4 Beginner 1 + 4 Beginner 2). Pay at reception or online.',
   'pass', 10000, 8, 56, null, '{Beginner 1,Beginner 2}', true, false, null, false,
   null, 'fixed', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000001','d0d0d0d0-0000-0000-0000-000000000002','d0d0d0d0-0000-0000-0000-000000000004','d0d0d0d0-0000-0000-0000-000000000005']::uuid[], ARRAY['Bachata','Bachata Tradicional','Cuban','Salsa Line'], '1 selected style', 2),

  ('f0f0f0f0-0000-0000-0000-000000000006', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Latin Combo (Mix and Match)', '8 classes. Mix two of our three Beginner 1 courses.',
   'Mix and match two of our three Beginner 1 courses (Bachata, Cuban, Salsa Line). Includes 8 classes. Pay at reception or online.',
   'pass', 9000, 8, 56, null, '{Beginner 1}', true, false, null, false,
   null, 'fixed', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000001','d0d0d0d0-0000-0000-0000-000000000004','d0d0d0d0-0000-0000-0000-000000000005']::uuid[], ARRAY['Bachata','Cuban','Salsa Line'], 'Pick 2 of 3 Latin', null),

  -- ── Social Pass ──
  ('f0f0f0f0-0000-0000-0000-000000000016', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Social Pass', '20 socials per month. Weekday socials + weekend student practice.',
   'Access to standard weekday socials (Mon, Wed, Fri, and weekend student practice). Includes 20 socials per month. Events are not included.',
   'pass', 10000, 20, 30, null, null, false, false, null, false,
   null, 'fixed', false, '{}',
   null, null, 'Socials only', null),

  -- ── Bronze Memberships (4 classes/month) ──
  ('f0f0f0f0-0000-0000-0000-000000000001', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Bronze Standard Membership', '4 classes per month (excluding Salsa & Bachata classes).',
   '4 classes per month excluding Salsa and Bachata classes. Cash or card with auto-renewal.',
   'membership', 6500, null, null, null, null, true, true, 4, true,
   '{"Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000006','d0d0d0d0-0000-0000-0000-000000000007','d0d0d0d0-0000-0000-0000-000000000008','d0d0d0d0-0000-0000-0000-000000000009','d0d0d0d0-0000-0000-0000-000000000010']::uuid[], ARRAY['Afro-Cuban','Kids Hip Hop','Ladies Styling','Reggaeton','Yoga'], 'Excl. Salsa & Bachata', null),

  ('f0f0f0f0-0000-0000-0000-000000000020', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Bronze Bachata Membership', '4 classes per month (Bachata classes only).',
   '4 Bachata classes per month. Cash or card with auto-renewal.',
   'membership', 6500, null, null, null, null, true, true, 4, true,
   '{"Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000001','d0d0d0d0-0000-0000-0000-000000000002']::uuid[], ARRAY['Bachata','Bachata Tradicional'], 'Bachata', null),

  ('f0f0f0f0-0000-0000-0000-000000000021', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Bronze Salsa Membership', '4 classes per month (Salsa classes only).',
   '4 Salsa classes per month. Cash or card with auto-renewal.',
   'membership', 6500, null, null, null, null, true, true, 4, true,
   '{"Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000004','d0d0d0d0-0000-0000-0000-000000000005']::uuid[], ARRAY['Cuban','Salsa Line'], 'Salsa', null),

  ('f0f0f0f0-0000-0000-0000-000000000022', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Bronze Yoga Membership', '4 classes per month (Yoga classes only).',
   '4 Yoga classes per month. Cash or card with auto-renewal.',
   'membership', 6000, null, null, null, null, true, true, 4, true,
   '{"Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000009']::uuid[], ARRAY['Yoga'], 'Yoga', null),

  -- ── Silver Memberships (8 classes/month) ──
  ('f0f0f0f0-0000-0000-0000-000000000002', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Silver Standard Membership', '8 classes per month (excluding Salsa & Bachata classes).',
   '8 classes per month excluding Salsa and Bachata classes. Cash or card with auto-renewal.',
   'membership', 12000, null, null, null, null, true, true, 8, true,
   '{"Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000006','d0d0d0d0-0000-0000-0000-000000000007','d0d0d0d0-0000-0000-0000-000000000008','d0d0d0d0-0000-0000-0000-000000000009','d0d0d0d0-0000-0000-0000-000000000010']::uuid[], ARRAY['Afro-Cuban','Kids Hip Hop','Ladies Styling','Reggaeton','Yoga'], 'Excl. Salsa & Bachata', null),

  ('f0f0f0f0-0000-0000-0000-000000000023', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Silver Bachata Membership', '8 classes per month (Bachata classes only).',
   '8 Bachata classes per month. Cash or card with auto-renewal.',
   'membership', 12000, null, null, null, null, true, true, 8, true,
   '{"Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000001','d0d0d0d0-0000-0000-0000-000000000002']::uuid[], ARRAY['Bachata','Bachata Tradicional'], 'Bachata', null),

  ('f0f0f0f0-0000-0000-0000-000000000024', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Silver Salsa Membership', '8 classes per month (Salsa classes only).',
   '8 Salsa classes per month. Cash or card with auto-renewal.',
   'membership', 12000, null, null, null, null, true, true, 8, true,
   '{"Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000004','d0d0d0d0-0000-0000-0000-000000000005']::uuid[], ARRAY['Cuban','Salsa Line'], 'Salsa', null),

  ('f0f0f0f0-0000-0000-0000-000000000025', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Silver Yoga Membership', '8 classes per month (Yoga classes only).',
   '8 Yoga classes per month. Cash or card with auto-renewal.',
   'membership', 11000, null, null, null, null, true, true, 8, true,
   '{"Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000009']::uuid[], ARRAY['Yoga'], 'Yoga', null),

  -- ── Gold Memberships (12 classes/month) ──
  ('f0f0f0f0-0000-0000-0000-000000000003', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Gold Standard Membership', '12 classes per month (excluding Salsa & Bachata classes).',
   '12 classes per month excluding Salsa and Bachata classes. Cash or card with auto-renewal.',
   'membership', 17000, null, null, null, null, true, true, 12, true,
   '{"Earlybird access to studio events","Priority class booking","Exclusive quarterly event for Gold members","Special discounts on merchandise and studio events","Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000006','d0d0d0d0-0000-0000-0000-000000000007','d0d0d0d0-0000-0000-0000-000000000008','d0d0d0d0-0000-0000-0000-000000000009','d0d0d0d0-0000-0000-0000-000000000010']::uuid[], ARRAY['Afro-Cuban','Kids Hip Hop','Ladies Styling','Reggaeton','Yoga'], 'Excl. Salsa & Bachata', null),

  ('f0f0f0f0-0000-0000-0000-000000000026', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Gold Bachata Membership', '12 classes per month (Bachata classes only).',
   '12 Bachata classes per month. Cash or card with auto-renewal.',
   'membership', 17000, null, null, null, null, true, true, 12, true,
   '{"Earlybird access to studio events","Priority class booking","Exclusive quarterly event for Gold members","Special discounts on merchandise and studio events","Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000001','d0d0d0d0-0000-0000-0000-000000000002']::uuid[], ARRAY['Bachata','Bachata Tradicional'], 'Bachata', null),

  ('f0f0f0f0-0000-0000-0000-000000000027', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Gold Salsa Membership', '12 classes per month (Salsa classes only).',
   '12 Salsa classes per month. Cash or card with auto-renewal.',
   'membership', 17000, null, null, null, null, true, true, 12, true,
   '{"Earlybird access to studio events","Priority class booking","Exclusive quarterly event for Gold members","Special discounts on merchandise and studio events","Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000004','d0d0d0d0-0000-0000-0000-000000000005']::uuid[], ARRAY['Cuban','Salsa Line'], 'Salsa', null),

  ('f0f0f0f0-0000-0000-0000-000000000028', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Gold Yoga Membership', '12 classes per month (Yoga classes only).',
   '12 Yoga classes per month. Cash or card with auto-renewal.',
   'membership', 16000, null, null, null, null, true, true, 12, true,
   '{"Earlybird access to studio events","Priority class booking","Exclusive quarterly event for Gold members","Special discounts on merchandise and studio events","Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week"}',
   'unlimited', false, '{}',
   ARRAY['d0d0d0d0-0000-0000-0000-000000000009']::uuid[], ARRAY['Yoga'], 'Yoga', null),

  -- ── Rainbow Membership (all-access, 16 classes/month) ──
  ('f0f0f0f0-0000-0000-0000-000000000004', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001',
   'Rainbow Membership', '16 classes per month, all styles included.',
   '16 classes per month across all styles. Our all-access membership with maximum flexibility. Cash or card with auto-renewal.',
   'membership', 22000, null, null, null, null, true, true, 16, true,
   '{"Earlybird access to studio events","Priority class booking","Exclusive quarterly event for Gold members","Special discounts on merchandise and studio events","Free entry to 1 community event per month or weekend Latin practice hours","Member-exclusive giveaways","Free class of your choice on your birthday week","Free BPM T-shirt"}',
   'unlimited', false, '{}',
   null, null, 'All styles', null);


-- ── Subscriptions / Bookings / CoC ────────────────────────────
-- No demo subscriptions or bookings seeded. Real entitlements are
-- assigned via the admin UI. The generic student@bpm.dance account
-- is available for testing the assign-entitlement flow.


-- ── Business rules ──────────────────────────────────────────

insert into business_rules (academy_id, key, value, description, is_provisional) values
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'late_cancel_fee_cents',      '200',                                                     'Late cancellation fee in cents',                       false),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'no_show_fee_cents',          '500',                                                     'No-show fee in cents',                                 false),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'late_cancel_threshold_hours', '24',                                                     'Hours before class start for late cancel cutoff',      true),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'credit_deduction_priority',  '["promo_pass","pack","drop_in","membership"]',             'Order to resolve credit source when booking',          true),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'student_practice_bookable',  'false',                                                   'Whether Student Practice events are bookable',         true),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'waitlist_offer_expiry_hours','4',                                                       'Hours before a waitlist offer expires',                 true),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001', 'role_balanced_styles',       '["Bachata","Bachata Tradicional","Cuban","Salsa Line"]', 'Styles requiring leader/follower balance', false);
