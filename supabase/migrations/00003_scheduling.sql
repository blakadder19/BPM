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
