-- Past event archive / delete protection (Phase 4).
--
-- Adds a single nullable timestamptz column to `special_events` so
-- admins can hide past events from public surfaces (events list,
-- student detail, public shareable page) without losing any history
-- (purchases, payments, check-ins, finance audit log).
--
-- Why a separate column instead of a new `event_status` enum value?
--   * Mirrors the existing `products.archived_at` pattern from
--     migration 00055 — a soft archival timestamp distinct from the
--     `status` enum. Reusing the same shape keeps admin code consistent.
--   * Adding an enum value is intrusive (touches every CHECK / row
--     conversion); a nullable column is purely additive and trivially
--     reversible.
--   * The `status` enum (`draft` / `published`) keeps its current
--     "is the event content finalised?" semantic, and `archived_at`
--     gets the orthogonal "is this event hidden from public surfaces?"
--     semantic. The two compose: a `published` event with
--     `archived_at IS NOT NULL` is "published-but-archived" — visible
--     to admins, invisible to students/public.
--
-- Safe / additive:
--   * Column is nullable; every existing row keeps NULL and continues
--     to behave exactly as before (i.e. not archived).
--   * No data is rewritten. No FKs change. No enum widening.
--   * Server-side delete-protection (lib/actions/special-events.ts)
--     enforces "events with purchases cannot be hard-deleted" so
--     historical event_purchases / event_audit_log entries are never
--     orphaned — even if someone bypasses the UI and calls the action
--     directly.

alter table special_events
  add column if not exists archived_at timestamptz;

create index if not exists idx_special_events_archived_at
  on special_events (archived_at)
  where archived_at is not null;
