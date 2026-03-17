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
