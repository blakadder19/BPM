-- Read-only preview for migration 00082 (Payment Receipts). Run before and
-- after applying. Changes nothing.

-- 1. Preconditions: 00080 has run; 00082 has not. After applying, check:
--      select applied_at from public.staff_permission_migrations
--      where key = '00082_payments_send_receipt';
select
  (select exact_since from public.staff_permission_model_marker)            as marker_00080,
  to_regclass('public.receipt_access_tokens')                               as tokens_table,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'student_subscriptions'
      and column_name in ('product_name_snapshot', 'product_type_snapshot')) as snapshot_columns;

-- 2. Staff grants 00082 will change: Admin, active or pending, lacking the key.
select email, staff_role_key, staff_status,
       jsonb_array_length(staff_permissions) as n_before
from public.users
where staff_role_key = 'admin'
  and staff_status in ('active', 'pending')
  and jsonb_typeof(staff_permissions) = 'array'
  and not staff_permissions ? 'payments:send_receipt'
order by email;

-- 3. Pending Admin invites 00082 will change.
select email, role_key, status, expires_at,
       jsonb_array_length(permissions) as n_before
from public.staff_invites
where status = 'pending'
  and role_key = 'admin'
  and jsonb_typeof(permissions) = 'array'
  and not permissions ? 'payments:send_receipt'
order by email;

-- 4. Staff grants that stay unchanged (context).
select staff_role_key, staff_status, count(*) as n
from public.users
where staff_role_key is not null
group by staff_role_key, staff_status
order by staff_role_key, staff_status;

-- 5. Subscription rows the identity backfill would fill, and rows it cannot
--    (no matching product). Counts only.
select
  count(*) filter (where p.id is not null) as backfillable,
  count(*) filter (where p.id is null)     as no_product_match,
  count(*)                                 as total_rows
from public.student_subscriptions s
left join public.products p on p.id = s.product_id;

-- 6. Product names in use by more than one product (counts only), which the
--    backfill would freeze as-is.
select count(*) as duplicate_names
from (
  select name from public.products group by name having count(*) > 1
) d;

-- 7. Refund-state anomalies. A refunded row has a receipt only with a
--    recorded refund amount equal to the total AND a refund date (Stripe
--    rows also need refund_status = 'succeeded'); €0 is never read as full.
select 'subscription' as kind, payment_method::text as payment_method,
       payment_status::text as payment_status, refund_status::text as refund_status,
       count(*) as n,
       count(*) filter (where refunded_amount_cents > 0) as with_amount,
       count(*) filter (where coalesce(refunded_amount_cents, 0) = 0) as zero_amount,
       count(*) filter (where refunded_at is null)       as no_refunded_at
from public.student_subscriptions
where payment_status = 'refunded' or refunded_amount_cents > 0 or refund_status is not null
group by payment_method, payment_status, refund_status
union all
select 'event_purchase', payment_method::text, payment_status::text, refund_status::text,
       count(*),
       count(*) filter (where refunded_amount_cents > 0),
       count(*) filter (where coalesce(refunded_amount_cents, 0) = 0),
       count(*) filter (where refunded_at is null)
from public.event_purchases
where payment_status = 'refunded' or refunded_amount_cents > 0 or refund_status is not null
group by payment_method, payment_status, refund_status;

-- 8. Event purchases the title backfill would fill, and rows it cannot
--    (no matching event — impossible while event_id is NOT NULL + FK).
select
  count(*) filter (where e.id is not null)                         as backfillable,
  count(*) filter (where e.id is null)                             as no_event_match,
  count(*) filter (where e.id is not null and btrim(e.title) = '') as blank_event_title,
  count(*)                                                         as total_rows
from public.event_purchases ep
left join public.special_events e on e.id = ep.event_id;

-- 9. Event titles shared by more than one event (counts only).
select count(*) as duplicate_event_titles
from (
  select title from public.special_events group by title having count(*) > 1
) d;
