-- 00033_seed_historical_bookings.sql
-- Seeds past bookable_classes instances and op_bookings for history testing.
-- Creates past class occurrences (1 and 2 weeks ago) by duplicating current
-- instances, then creates realistic booking records against those past classes.

DO $$
DECLARE
  v_academy_id uuid;
  v_class      record;
  v_student    record;
  v_new_id     uuid;
  v_bk_id      text;
  v_counter    int := 0;
  v_statuses   text[] := ARRAY['checked_in', 'checked_in', 'checked_in', 'cancelled', 'missed'];
  v_roles      text[] := ARRAY['leader', 'follower', NULL, 'leader', 'follower'];
BEGIN
  SELECT id INTO v_academy_id FROM academies LIMIT 1;
  IF v_academy_id IS NULL THEN
    RAISE NOTICE 'No academy found — skipping history seed.';
    RETURN;
  END IF;

  -- ── 1 week ago ─────────────────────────────────────────────
  FOR v_class IN
    SELECT * FROM bookable_classes
    WHERE date >= CURRENT_DATE AND date < CURRENT_DATE + 7
    ORDER BY date, start_time
    LIMIT 8
  LOOP
    v_new_id := gen_random_uuid();
    INSERT INTO bookable_classes (
      id, academy_id, class_id, dance_style_id, title, class_type, level,
      date, start_time, end_time, max_capacity, leader_cap, follower_cap,
      status, location, term_bound, term_id
    ) VALUES (
      v_new_id, v_academy_id, v_class.class_id, v_class.dance_style_id,
      v_class.title, v_class.class_type, v_class.level,
      v_class.date - 7,
      v_class.start_time, v_class.end_time,
      v_class.max_capacity, v_class.leader_cap, v_class.follower_cap,
      'open', v_class.location,
      v_class.term_bound, v_class.term_id
    );

    FOR v_student IN
      SELECT id, full_name FROM users WHERE role = 'student' LIMIT 3
    LOOP
      v_counter := v_counter + 1;
      v_bk_id := 'seed-hist-' || v_counter;
      INSERT INTO op_bookings (
        id, bookable_class_id, student_id, student_name,
        dance_role, status, source, booked_at
      ) VALUES (
        v_bk_id,
        v_new_id::text,
        v_student.id::text,
        v_student.full_name,
        v_roles[((v_counter - 1) % 5) + 1],
        v_statuses[((v_counter - 1) % 5) + 1],
        'subscription',
        ((v_class.date - 10)::date)::text
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;

  -- ── 2 weeks ago ────────────────────────────────────────────
  FOR v_class IN
    SELECT * FROM bookable_classes
    WHERE date >= CURRENT_DATE AND date < CURRENT_DATE + 7
    ORDER BY date, start_time
    LIMIT 5
  LOOP
    v_new_id := gen_random_uuid();
    INSERT INTO bookable_classes (
      id, academy_id, class_id, dance_style_id, title, class_type, level,
      date, start_time, end_time, max_capacity, leader_cap, follower_cap,
      status, location, term_bound, term_id
    ) VALUES (
      v_new_id, v_academy_id, v_class.class_id, v_class.dance_style_id,
      v_class.title, v_class.class_type, v_class.level,
      v_class.date - 14,
      v_class.start_time, v_class.end_time,
      v_class.max_capacity, v_class.leader_cap, v_class.follower_cap,
      'open', v_class.location,
      v_class.term_bound, v_class.term_id
    );

    FOR v_student IN
      SELECT id, full_name FROM users WHERE role = 'student' LIMIT 2
    LOOP
      v_counter := v_counter + 1;
      v_bk_id := 'seed-hist-' || v_counter;
      INSERT INTO op_bookings (
        id, bookable_class_id, student_id, student_name,
        dance_role, status, source, booked_at
      ) VALUES (
        v_bk_id,
        v_new_id::text,
        v_student.id::text,
        v_student.full_name,
        v_roles[((v_counter - 1) % 5) + 1],
        v_statuses[((v_counter - 1) % 5) + 1],
        'subscription',
        ((v_class.date - 17)::date)::text
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seeded % historical booking records across past class instances.', v_counter;
END $$;
