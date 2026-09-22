-- ════════════════════════════════════════════════════════════
-- Phase 16 diagnostic — subscriptions that lapsed but were never
-- marked expired
-- ════════════════════════════════════════════════════════════
--
-- READ-ONLY. Nothing here mutates data. Run it in the Supabase SQL
-- editor before deciding whether any repair is warranted.
--
-- Context
-- -------
-- The nightly term-lifecycle job flips a subscription to `expired`
-- once `today > valid_until`. If it has not run (or errored) there
-- can be rows sitting at `status = 'active'` with a past
-- `valid_until`.
--
-- As of Phase 16 these rows are ALREADY HARMLESS for booking: the
-- entitlement selector and the credit service both check the
-- validity window directly rather than trusting `status`, so a
-- lapsed row cannot fund a booking regardless of what its status
-- column says. This query exists to quantify the backlog and to
-- reassure Finance, not to gate the fix.
--
-- DO NOT mass-zero `remaining_credits`. The unused balance is
-- historical truth — it is what the student did not use before their
-- term ended — and Phase 16 deliberately preserves it while making
-- it unspendable.
-- ════════════════════════════════════════════════════════════


-- ── 1. How big is the backlog? ─────────────────────────────

select
  count(*)                                        as lapsed_active_rows,
  count(*) filter (where remaining_credits > 0)   as with_unused_credits,
  coalesce(sum(remaining_credits), 0)             as total_unused_credits
from student_subscriptions
where status = 'active'
  and valid_until is not null
  and valid_until < current_date;


-- ── 2. Which rows, with enough context to judge them? ──────

select
  ss.id                       as subscription_id,
  u.email                     as student_email,
  ss.product_id,
  ss.term_id,
  t.name                      as term_name,
  ss.valid_from,
  ss.valid_until,
  current_date - ss.valid_until           as days_overdue,
  ss.total_credits,
  ss.remaining_credits,
  ss.classes_per_term,
  ss.classes_used,
  ss.payment_status,
  -- A two-term product legitimately runs past its FIRST term's end.
  -- `valid_until` already accounts for that (Phase 14 writes the
  -- second term's end date), so anything listed here really is
  -- overdue regardless of span.
  coalesce(p.span_terms, 1)   as span_terms
from student_subscriptions ss
left join users u on u.id = ss.student_id
left join terms t on t.id = ss.term_id
left join products p on p.id = ss.product_id
where ss.status = 'active'
  and ss.valid_until is not null
  and ss.valid_until < current_date
order by ss.valid_until asc, ss.remaining_credits desc nulls last;


-- ── 3. Sanity check before any repair ──────────────────────
--
-- Confirms nothing in the candidate set is a two-term product that
-- is still inside its legitimate span. Should return 0 rows; if it
-- does not, STOP and investigate before touching anything.

select ss.id, ss.valid_until, t2.end_date as span_term_end
from student_subscriptions ss
join products p       on p.id = ss.product_id and coalesce(p.span_terms, 1) >= 2
join terms t1         on t1.id = ss.term_id
join lateral (
  select * from terms nxt
  where nxt.start_date > t1.end_date
  order by nxt.start_date asc
  limit 1
) t2 on true
where ss.status = 'active'
  and ss.valid_until is not null
  and ss.valid_until < current_date
  and current_date <= t2.end_date;


-- ── 4. RECOMMENDED REPAIR (status only) ────────────────────
--
-- Commented out deliberately — run it only after reviewing query 2
-- and confirming query 3 returns nothing.
--
-- This aligns the STATUS column with reality. It does NOT touch
-- total_credits, remaining_credits, classes_used, price, term,
-- payment or discount data. The student's history is unchanged; only
-- the lifecycle label catches up.
--
-- Safer alternative: trigger the existing lifecycle job from
-- Admin → Students → "Run lifecycle", which performs the same
-- transition through the application (and therefore also fires the
-- renewal-preparation logic and comm events that a raw UPDATE would
-- skip). Prefer that unless the backlog is too large for one run.
--
-- update student_subscriptions
-- set    status     = 'expired',
--        updated_at = now()
-- where  status = 'active'
--   and  valid_until is not null
--   and  valid_until < current_date;
