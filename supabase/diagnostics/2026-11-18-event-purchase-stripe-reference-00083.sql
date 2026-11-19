-- Read-only checks for migration 00083 (one event purchase per Stripe
-- Checkout Session). Run before and after applying. Changes nothing.
-- Outputs ids and amounts only — no names or emails.

-- 1. Is 00083 applied?
select to_regclass('public.ux_event_purchases_stripe_reference') as unique_index;

-- 2. Precondition: must return 0 before applying.
select count(*) as duplicated_stripe_references
from (
  select payment_reference
  from public.event_purchases
  where payment_reference like 'stripe:%'
  group by payment_reference
  having count(*) > 1
) d;

-- 3. Detail for any duplicates found in (2). For each session, the oldest
--    row is the one the app and receipts treat as the purchase. Before
--    removing or refunding anything, check Stripe: one session = one charge,
--    so later rows are extra records of the same payment, but their QR codes
--    may have been emailed and used at check-in (checked_in_at).
select
  ep.payment_reference,
  ep.id,
  ep.purchased_at,
  row_number() over (partition by ep.payment_reference order by ep.purchased_at, ep.id) as nth,
  ep.payment_status,
  ep.paid_amount_cents,
  ep.refunded_amount_cents,
  ep.checked_in_at is not null as checked_in,
  (ep.student_id is null) as guest,
  exists (
    select 1 from public.receipt_access_tokens t
    where t.event_purchase_id = ep.id and t.revoked_at is null
  ) as has_active_receipt_link
from public.event_purchases ep
where ep.payment_reference in (
  select payment_reference
  from public.event_purchases
  where payment_reference like 'stripe:%'
  group by payment_reference
  having count(*) > 1
)
order by ep.payment_reference, nth;

-- 4. Reference shapes in use (the index only covers 'stripe:%').
select split_part(payment_reference, ':', 1) as prefix, payment_method, count(*)
from public.event_purchases
where payment_reference is not null
group by 1, 2
order by 3 desc;
