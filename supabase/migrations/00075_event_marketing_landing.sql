-- Phase 13 — per-event opt-in for the conversion-focused (mobile
-- Book-now sticky bar, above-the-fold CTA, compact summary card)
-- public-event landing UX introduced in Phase 12.
--
-- Rationale:
--   Phase 12 turned every public event page into a paid-ads landing
--   by default. Some events don't want that: a members-only social,
--   a friends-and-family workshop, an archived retro landing, etc.
--   This flag lets admins opt-in per event from `Admin → Events`
--   without a code change, so future paid-ad drops (e.g. new
--   beginner-intake events Zaria may launch) can be gated the same
--   way with zero engineering.
--
-- Safety belts:
--   * default false — the aggressive mobile UX only turns on when
--     an admin explicitly toggles the checkbox.
--   * NOT NULL — no ambiguity at read time; every row is one of
--     two states.
--   * add column IF NOT EXISTS — idempotent, safe to re-run on any
--     environment.
--
-- Enabling the flag for the current campaign event
-- ─────────────────────────────────────────────────
-- Once this migration has run in prod, an admin can either:
--   (a) open Admin → Events → edit the campaign event → tick
--       "Optimise this event page for new students / ads" → save.
--   (b) or, for a one-shot script:
--         update special_events
--            set is_marketing_landing = true
--          where id = '<event-uuid>';
--     (No migration should hard-code prod UUIDs, so we deliberately
--      do NOT flip any specific event here.)

alter table special_events
  add column if not exists is_marketing_landing boolean not null default false;

comment on column special_events.is_marketing_landing is
  'When true, the public /event/<id> page renders the conversion-focused mobile UX (sticky Book-now CTA, above-the-fold summary card, guest-checkout-first flow). Set per event from Admin → Events. Default false preserves the standard event page layout for non-campaign events.';

-- Optional index — cheap and future-proofs any admin dashboard that
-- wants to list campaign-mode events (e.g. "which events are wired
-- for ads right now"). Partial so it costs nothing on rows where
-- the flag is false (which is the overwhelming majority).
create index if not exists idx_special_events_marketing_landing
  on special_events(is_marketing_landing)
  where is_marketing_landing = true;
