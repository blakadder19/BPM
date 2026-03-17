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
