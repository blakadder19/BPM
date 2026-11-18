-- 00083_event_purchase_stripe_reference_unique.sql
--
-- One event purchase per Stripe Checkout Session.
--
-- Stripe fulfilment writes payment_reference = 'stripe:<checkout session id>'.
-- The webhook and the checkout success page both fulfil a paid session and
-- each checks for an existing row before inserting; on different server
-- instances both checks can pass at the same moment and insert two rows.
-- This partial unique index makes the second insert fail; the app treats
-- that failure (constraint name below) as "already fulfilled".
--
-- Scope: only 'stripe:%' references. 'comp:<uuid>' references and free text
-- staff can enter are not constrained. Pending purchases paid later get
-- 'stripe:<their own session>' via UPDATE, which is also covered.
--
-- Safe to run: no data changes. If duplicates already exist the migration
-- stops with an explanatory error before creating anything — resolve them
-- first with supabase/diagnostics/2026-11-18-event-purchase-stripe-reference-00083.sql.
-- event_purchases is small (low hundreds of rows), so a plain (non
-- CONCURRENTLY) build holds its lock for milliseconds.

do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count
  from (
    select payment_reference
    from public.event_purchases
    where payment_reference like 'stripe:%'
    group by payment_reference
    having count(*) > 1
  ) d;

  if dup_count > 0 then
    raise exception
      '00083: % Stripe payment reference(s) are shared by more than one event purchase. Resolve them before applying this migration (see supabase/diagnostics/2026-11-18-event-purchase-stripe-reference-00083.sql).',
      dup_count;
  end if;
end
$$;

create unique index if not exists ux_event_purchases_stripe_reference
  on public.event_purchases (payment_reference)
  where payment_reference like 'stripe:%';

comment on index public.ux_event_purchases_stripe_reference is
  'One event purchase per Stripe Checkout Session (payment_reference = stripe:<session id>). Matched by name in lib/services/event-purchase-fulfillment.ts.';
