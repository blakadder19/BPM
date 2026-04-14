-- ============================================================
-- BPM Booking System · Migration 00034
-- Special Events: events, sessions, products, purchases
-- ============================================================

-- ── New enums for special events ─────────────────────────────

create type event_status       as enum ('draft', 'published');
create type event_session_type as enum ('workshop', 'social', 'intensive', 'masterclass', 'other');
create type event_product_type as enum ('full_pass', 'combo_pass', 'single_session', 'social_ticket', 'other');
create type event_inclusion_rule as enum ('all_sessions', 'selected_sessions', 'all_workshops', 'socials_only');
create type event_payment_method as enum ('stripe', 'manual');
create type event_payment_status as enum ('pending', 'paid', 'refunded');

-- ── Special Events ───────────────────────────────────────────

create table special_events (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid           not null references academies(id),
  title             text           not null,
  subtitle          text,
  description       text           not null default '',
  cover_image_url   text,
  location          text           not null default '',
  start_date        date           not null,
  end_date          date           not null,
  status            event_status   not null default 'draft',
  is_visible        boolean        not null default false,
  is_featured       boolean        not null default false,
  featured_on_dashboard boolean    not null default false,
  is_public         boolean        not null default false,
  sales_open        boolean        not null default false,
  created_at        timestamptz    not null default now(),
  updated_at        timestamptz    not null default now(),
  constraint chk_event_dates check (end_date >= start_date)
);

alter table special_events enable row level security;

create trigger trg_special_events_updated_at
  before update on special_events
  for each row execute function update_updated_at();

create index idx_special_events_academy on special_events(academy_id);
create index idx_special_events_status on special_events(status);
create index idx_special_events_dates on special_events(start_date, end_date);

-- ── Event Sessions ───────────────────────────────────────────

create table event_sessions (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid               not null references special_events(id) on delete cascade,
  title             text               not null,
  session_type      event_session_type not null default 'workshop',
  date              date               not null,
  start_time        time               not null,
  end_time          time               not null,
  teacher_name      text,
  room              text,
  capacity          int,
  description       text,
  sort_order        int                not null default 0,
  created_at        timestamptz        not null default now()
);

alter table event_sessions enable row level security;

create index idx_event_sessions_event on event_sessions(event_id);
create index idx_event_sessions_date on event_sessions(date, start_time);

-- ── Event Products ───────────────────────────────────────────

create table event_products (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid                 not null references special_events(id) on delete cascade,
  name                 text                 not null,
  description          text,
  price_cents          int                  not null,
  product_type         event_product_type   not null default 'other',
  is_visible           boolean              not null default true,
  sales_open           boolean              not null default false,
  inclusion_rule       event_inclusion_rule not null default 'all_sessions',
  included_session_ids uuid[],
  sort_order           int                  not null default 0,
  created_at           timestamptz          not null default now()
);

alter table event_products enable row level security;

create index idx_event_products_event on event_products(event_id);

-- ── Event Purchases ──────────────────────────────────────────

create table event_purchases (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid                   not null references users(id),
  event_product_id     uuid                   not null references event_products(id),
  event_id             uuid                   not null references special_events(id),
  payment_method       event_payment_method   not null,
  payment_status       event_payment_status   not null default 'pending',
  payment_reference    text,
  purchased_at         timestamptz            not null default now(),
  paid_at              timestamptz,
  notes                text
);

alter table event_purchases enable row level security;

create index idx_event_purchases_student on event_purchases(student_id);
create index idx_event_purchases_event on event_purchases(event_id);
create index idx_event_purchases_product on event_purchases(event_product_id);
create index idx_event_purchases_reference on event_purchases(payment_reference) where payment_reference is not null;
