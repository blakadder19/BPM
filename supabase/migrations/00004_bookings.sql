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
