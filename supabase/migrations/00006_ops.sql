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
