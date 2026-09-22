-- ════════════════════════════════════════════════════════════
-- 00076 — VAT snapshot on purchases (Phase 15)
-- ════════════════════════════════════════════════════════════
--
-- Adds a frozen VAT breakdown to both purchase tables so BPM can
-- report base amount, VAT and total paid separately.
--
-- Design notes
-- ------------
-- * Every column is NULLABLE with no default value beyond 0 for the
--   amount columns. Historical rows keep NULL, which the application
--   reads as "this purchase predates VAT tracking" — NOT as
--   "€0.00 of VAT was charged". The two are different for reporting
--   and the app distinguishes them.
--
-- * There is deliberately NO BACKFILL. Inventing a VAT split for a
--   payment that was taken before VAT was configured would corrupt
--   the historical record and any return filed from it.
--
-- * `vat_rate_percent` is numeric(5,2), which covers 0.00–999.99 and
--   supports reduced rates such as 13.5. The application validates
--   0–100 and stores at most 2 decimal places.
--
-- * `vat_price_mode` records which interpretation was used at
--   purchase time ('exclusive' = VAT added on top of the listed
--   price, 'inclusive' = VAT backed out of it). Storing it means an
--   admin flipping the setting later cannot change how a historical
--   receipt reads.
--
-- * The invariant subtotal + vat = total is enforced by a CHECK that
--   only fires when all three values are present, so NULL historical
--   rows are unaffected. Added NOT VALID so the migration does not
--   scan existing data; validate later if desired.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── student_subscriptions ──────────────────────────────────

alter table student_subscriptions
  add column if not exists subtotal_ex_vat_cents int,
  add column if not exists vat_amount_cents      int,
  add column if not exists vat_rate_percent      numeric(5,2),
  add column if not exists vat_price_mode        text,
  add column if not exists total_inc_vat_cents   int;

comment on column student_subscriptions.subtotal_ex_vat_cents is
  'Post-discount amount excluding VAT, frozen at purchase time. NULL on rows created before VAT tracking existed — NULL means "unknown", not zero.';
comment on column student_subscriptions.vat_amount_cents is
  'VAT charged on this purchase, frozen at purchase time. NULL = pre-VAT-tracking row. 0 = VAT was evaluated but did not apply (disabled, 0% rate, or excluded payment method).';
comment on column student_subscriptions.vat_rate_percent is
  'VAT rate actually charged, e.g. 23.00 or 13.50. Never recomputed if the configured rate changes later.';
comment on column student_subscriptions.vat_price_mode is
  'exclusive = VAT was added on top of the listed price; inclusive = VAT was backed out of it. Frozen at purchase time.';
comment on column student_subscriptions.total_inc_vat_cents is
  'What the customer actually paid, inclusive of VAT. Equals subtotal_ex_vat_cents + vat_amount_cents. Mirrors price_cents_at_purchase when VAT does not apply.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_subscriptions_vat_mode_check'
  ) then
    alter table student_subscriptions
      add constraint student_subscriptions_vat_mode_check
      check (vat_price_mode is null or vat_price_mode in ('exclusive', 'inclusive'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_subscriptions_vat_nonneg_check'
  ) then
    alter table student_subscriptions
      add constraint student_subscriptions_vat_nonneg_check
      check (
        (vat_amount_cents is null or vat_amount_cents >= 0)
        and (subtotal_ex_vat_cents is null or subtotal_ex_vat_cents >= 0)
        and (total_inc_vat_cents is null or total_inc_vat_cents >= 0)
        and (vat_rate_percent is null or (vat_rate_percent >= 0 and vat_rate_percent <= 100))
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_subscriptions_vat_sum_check'
  ) then
    alter table student_subscriptions
      add constraint student_subscriptions_vat_sum_check
      check (
        subtotal_ex_vat_cents is null
        or vat_amount_cents is null
        or total_inc_vat_cents is null
        or subtotal_ex_vat_cents + vat_amount_cents = total_inc_vat_cents
      )
      not valid;
  end if;
end $$;

-- ── event_purchases ────────────────────────────────────────

alter table event_purchases
  add column if not exists subtotal_ex_vat_cents int,
  add column if not exists vat_amount_cents      int,
  add column if not exists vat_rate_percent      numeric(5,2),
  add column if not exists vat_price_mode        text,
  add column if not exists total_inc_vat_cents   int;

comment on column event_purchases.subtotal_ex_vat_cents is
  'Post-discount ticket amount excluding VAT, frozen at purchase time. NULL on rows created before VAT tracking existed.';
comment on column event_purchases.vat_amount_cents is
  'VAT charged on this ticket, frozen at purchase time. NULL = pre-VAT-tracking row. 0 = VAT evaluated but not applicable.';
comment on column event_purchases.vat_rate_percent is
  'VAT rate actually charged. Never recomputed if the configured rate changes later.';
comment on column event_purchases.vat_price_mode is
  'exclusive = VAT added on top of the ticket price; inclusive = VAT backed out of it.';
comment on column event_purchases.total_inc_vat_cents is
  'What the customer actually paid, inclusive of VAT. Mirrors paid_amount_cents when VAT does not apply.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_purchases_vat_mode_check'
  ) then
    alter table event_purchases
      add constraint event_purchases_vat_mode_check
      check (vat_price_mode is null or vat_price_mode in ('exclusive', 'inclusive'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_purchases_vat_nonneg_check'
  ) then
    alter table event_purchases
      add constraint event_purchases_vat_nonneg_check
      check (
        (vat_amount_cents is null or vat_amount_cents >= 0)
        and (subtotal_ex_vat_cents is null or subtotal_ex_vat_cents >= 0)
        and (total_inc_vat_cents is null or total_inc_vat_cents >= 0)
        and (vat_rate_percent is null or (vat_rate_percent >= 0 and vat_rate_percent <= 100))
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_purchases_vat_sum_check'
  ) then
    alter table event_purchases
      add constraint event_purchases_vat_sum_check
      check (
        subtotal_ex_vat_cents is null
        or vat_amount_cents is null
        or total_inc_vat_cents is null
        or subtotal_ex_vat_cents + vat_amount_cents = total_inc_vat_cents
      )
      not valid;
  end if;
end $$;

-- ── Reporting helpers ──────────────────────────────────────
-- Partial indexes so a "VAT collected in period" query does not scan
-- the (majority) NULL historical rows.

create index if not exists idx_student_subscriptions_vat_collected
  on student_subscriptions(paid_at)
  where vat_amount_cents is not null and vat_amount_cents > 0;

create index if not exists idx_event_purchases_vat_collected
  on event_purchases(paid_at)
  where vat_amount_cents is not null and vat_amount_cents > 0;
