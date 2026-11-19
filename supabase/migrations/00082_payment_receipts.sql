-- 00082_payment_receipts.sql
--
-- Phase 23A — foundation for Payment Receipts. Independent parts:
--
--   1. student_subscriptions.product_name_snapshot / product_type_snapshot
--      Freezes the product identity a receipt prints. New rows are written
--      by the app with the product's name/type at creation time. Existing
--      rows are backfilled from the CURRENT products table, so for them the
--      value is the name known when this migration ran, not necessarily the
--      name at purchase time. Only NULLs are filled; an already-frozen value
--      is never overwritten. Every backfilled row is recorded in
--      student_subscription_identity_backfill_00082 so the two kinds of
--      value stay distinguishable. updated_at is left untouched.
--
--  1b. event_purchases.event_title_snapshot
--      Freezes the event title a receipt prints, so renaming an event never
--      rewrites old receipts. New rows get the title from the event record
--      at creation time. Existing rows are backfilled from the CURRENT
--      special_events title — the title at migration time, which is the
--      best available record for them. Only NULLs are filled; every
--      backfilled row is recorded in event_purchase_title_backfill_00082.
--      No migration defines a trigger on event_purchases, so the backfill
--      touches only this column.
--
--   2. receipt_access_tokens — public credentials for GUEST event purchase
--      receipts. Only the SHA-256 of a 32-byte random token is stored. RLS
--      on, no policies: service-role access only. At most one active token
--      per purchase, enforced by a partial unique index; issuing goes through
--      rotate_receipt_access_token(), which locks the purchase row, revokes
--      the active token and inserts the new one in a single transaction.
--
--   3. payments:send_receipt — added to the Admin preset in code. Because
--      exact grants are authoritative since 00080, this adds the key to
--      current active / pending Admin grants and pending Admin invites
--      (only where missing). Teachers and every other role gain nothing;
--      Super Admin already resolves to every permission. Previous values are
--      kept in staff_permissions_pre_00082 / staff_invites_pre_00082. Runs
--      once (marker row); a re-run never re-adds a key a Super Admin removed.
--
-- Apply manually after review. NEVER via `supabase db push`.

-- ── 1. Frozen subscription product identity ─────────────────

alter table public.student_subscriptions
  add column if not exists product_name_snapshot text,
  add column if not exists product_type_snapshot text;

comment on column public.student_subscriptions.product_name_snapshot is
  'Product name frozen when the row was created. Rows created before 00082 were backfilled with the name current at migration time (see student_subscription_identity_backfill_00082).';
comment on column public.student_subscriptions.product_type_snapshot is
  'Product type frozen when the row was created. Rows created before 00082 were backfilled with the type current at migration time.';

create table if not exists public.student_subscription_identity_backfill_00082 (
  subscription_id       uuid primary key,
  product_name_snapshot text,
  product_type_snapshot text,
  backfilled_at         timestamptz not null default now()
);

alter table public.student_subscription_identity_backfill_00082 enable row level security;
revoke all on public.student_subscription_identity_backfill_00082 from anon, authenticated;

do $$
declare
  has_trigger boolean;
begin
  select exists (
    select 1 from pg_trigger
    where tgrelid = 'public.student_subscriptions'::regclass
      and tgname = 'trg_student_subscriptions_updated_at'
  ) into has_trigger;

  if has_trigger then
    alter table public.student_subscriptions disable trigger trg_student_subscriptions_updated_at;
  end if;

  with filled as (
    update public.student_subscriptions s
    set product_name_snapshot = coalesce(s.product_name_snapshot, p.name),
        product_type_snapshot = coalesce(s.product_type_snapshot, p.product_type::text)
    from public.products p
    where p.id = s.product_id
      and (s.product_name_snapshot is null or s.product_type_snapshot is null)
    returning s.id, s.product_name_snapshot, s.product_type_snapshot
  )
  insert into public.student_subscription_identity_backfill_00082
    (subscription_id, product_name_snapshot, product_type_snapshot)
  select id, product_name_snapshot, product_type_snapshot from filled
  on conflict (subscription_id) do nothing;

  if has_trigger then
    alter table public.student_subscriptions enable trigger trg_student_subscriptions_updated_at;
  end if;
end $$;

-- ── 1b. Frozen event title on event purchases ───────────────

alter table public.event_purchases
  add column if not exists event_title_snapshot text;

comment on column public.event_purchases.event_title_snapshot is
  'Event title frozen when the purchase was created. Rows created before 00082 were backfilled with the title current at migration time (see event_purchase_title_backfill_00082).';

create table if not exists public.event_purchase_title_backfill_00082 (
  event_purchase_id    uuid primary key,
  event_title_snapshot text,
  backfilled_at        timestamptz not null default now()
);

alter table public.event_purchase_title_backfill_00082 enable row level security;
revoke all on public.event_purchase_title_backfill_00082 from anon, authenticated;

with filled as (
  update public.event_purchases ep
  set event_title_snapshot = e.title
  from public.special_events e
  where e.id = ep.event_id
    and ep.event_title_snapshot is null
  returning ep.id, ep.event_title_snapshot
)
insert into public.event_purchase_title_backfill_00082 (event_purchase_id, event_title_snapshot)
select id, event_title_snapshot from filled
on conflict (event_purchase_id) do nothing;

-- ── 2. Guest receipt access tokens ──────────────────────────

create table if not exists public.receipt_access_tokens (
  id                uuid primary key default gen_random_uuid(),
  event_purchase_id uuid not null references public.event_purchases(id) on delete cascade,
  token_hash        text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  issued_reason     text not null check (issued_reason in ('purchase_email', 'admin_send')),
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz,
  revoked_at        timestamptz,
  last_used_at      timestamptz,
  constraint receipt_access_tokens_expiry_after_creation
    check (expires_at is null or expires_at > created_at)
);

create unique index if not exists receipt_access_tokens_one_active_per_purchase
  on public.receipt_access_tokens (event_purchase_id)
  where revoked_at is null;

create index if not exists receipt_access_tokens_event_purchase_idx
  on public.receipt_access_tokens (event_purchase_id);

alter table public.receipt_access_tokens enable row level security;
revoke all on public.receipt_access_tokens from anon, authenticated;

create or replace function public.rotate_receipt_access_token(
  p_event_purchase_id uuid,
  p_token_hash        text,
  p_issued_reason     text,
  p_created_by        uuid default null,
  p_expires_at        timestamptz default null
) returns setof public.receipt_access_tokens
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Serialises concurrent issues for the same purchase and enforces that
  -- public receipt credentials exist only for guest purchases.
  perform 1
  from public.event_purchases
  where id = p_event_purchase_id
    and student_id is null
  for update;
  if not found then
    raise exception 'receipt access tokens are only issued for guest event purchases';
  end if;

  update public.receipt_access_tokens
  set revoked_at = now()
  where event_purchase_id = p_event_purchase_id
    and revoked_at is null;

  return query
  insert into public.receipt_access_tokens
    (event_purchase_id, token_hash, issued_reason, created_by, expires_at)
  values
    (p_event_purchase_id, p_token_hash, p_issued_reason, p_created_by, p_expires_at)
  returning *;
end $$;

revoke all on function public.rotate_receipt_access_token(uuid, text, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.rotate_receipt_access_token(uuid, text, text, uuid, timestamptz)
  to service_role;

-- ── 3. payments:send_receipt for current Admins ─────────────

create table if not exists public.staff_permission_migrations (
  key        text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists public.staff_permissions_pre_00082 (
  user_id           uuid primary key,
  email             text,
  staff_role_key    text,
  staff_status      text,
  staff_permissions jsonb,
  captured_at       timestamptz not null default now()
);

create table if not exists public.staff_invites_pre_00082 (
  invite_id   uuid primary key,
  email       text,
  role_key    text,
  status      text,
  permissions jsonb,
  captured_at timestamptz not null default now()
);

alter table public.staff_permission_migrations enable row level security;
alter table public.staff_permissions_pre_00082 enable row level security;
alter table public.staff_invites_pre_00082     enable row level security;
revoke all on public.staff_permission_migrations from anon, authenticated;
revoke all on public.staff_permissions_pre_00082 from anon, authenticated;
revoke all on public.staff_invites_pre_00082     from anon, authenticated;

do $$
declare
  new_key constant text := 'payments:send_receipt';
begin
  if exists (select 1 from public.staff_permission_migrations where key = '00082_payments_send_receipt') then
    raise notice '00082: payments:send_receipt already granted; nothing to do';
    return;
  end if;

  if not exists (select 1 from public.staff_permission_model_marker) then
    raise exception '00082 requires 00080 (exact staff permissions) to have run first';
  end if;

  insert into public.staff_permissions_pre_00082
    (user_id, email, staff_role_key, staff_status, staff_permissions)
  select id, email, staff_role_key, staff_status, staff_permissions
  from public.users
  where staff_role_key = 'admin'
    and staff_status in ('active', 'pending')
    and jsonb_typeof(staff_permissions) = 'array'
    and not staff_permissions ? new_key;

  insert into public.staff_invites_pre_00082
    (invite_id, email, role_key, status, permissions)
  select id, email, role_key, status, permissions
  from public.staff_invites
  where status = 'pending'
    and role_key = 'admin'
    and jsonb_typeof(permissions) = 'array'
    and not permissions ? new_key;

  update public.users u
  set staff_permissions = u.staff_permissions || jsonb_build_array(new_key)
  from public.staff_permissions_pre_00082 b
  where b.user_id = u.id
    and not u.staff_permissions ? new_key;

  update public.staff_invites i
  set permissions = i.permissions || jsonb_build_array(new_key)
  from public.staff_invites_pre_00082 b
  where b.invite_id = i.id
    and not i.permissions ? new_key;

  insert into public.staff_permission_migrations (key) values ('00082_payments_send_receipt');
end $$;
