-- ============================================================
-- BPM Booking System · Migration 00001
-- Enums and shared utility functions
-- ============================================================

-- ── Identity ────────────────────────────────────────────────
create type user_role       as enum ('student', 'admin', 'teacher');

-- ── Scheduling ──────────────────────────────────────────────
create type class_type      as enum ('class', 'social', 'student_practice');
create type instance_status as enum ('scheduled', 'open', 'closed', 'cancelled');
create type dance_role      as enum ('leader', 'follower');

-- ── Bookings ────────────────────────────────────────────────
create type booking_status  as enum ('confirmed', 'cancelled');
create type waitlist_status as enum ('waiting', 'offered', 'promoted', 'expired');
create type attendance_mark as enum ('present', 'absent', 'late', 'excused');

-- ── Commerce ────────────────────────────────────────────────
create type product_type        as enum ('membership', 'pack', 'drop_in', 'promo_pass');
create type subscription_status as enum ('active', 'paused', 'expired', 'exhausted', 'cancelled');
create type payment_status      as enum ('pending', 'completed', 'failed', 'refunded');
create type tx_type             as enum ('credit_used', 'credit_added', 'credit_refunded', 'credit_expired', 'penalty_charged');

-- ── Ops ─────────────────────────────────────────────────────
create type penalty_reason  as enum ('late_cancel', 'no_show');


-- ── Shared utility: auto-update updated_at ──────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
