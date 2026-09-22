-- ════════════════════════════════════════════════════════════
-- 00077 — Broadcast send summary (Phase 17)
-- ════════════════════════════════════════════════════════════
--
-- Records what a broadcast ACTUALLY resolved to and delivered at send
-- time, as opposed to `audience_params`, which stores the admin's
-- CONFIGURATION. The two must not be conflated: an audience is
-- resolved live at send time, so re-resolving a sent broadcast later
-- can legitimately produce a different set of people (someone bought
-- a ticket, someone got refunded, an account was deactivated). The
-- send summary is the immutable record of who was reached.
--
-- Introduced for the "Event ticket holders" audience, where Zaria
-- needs to be able to answer "who did we email about the Latin
-- Legends cancellation, and how many of them were guests?" weeks
-- later. Written for every audience type so the shape is uniform.
--
-- Shape (all keys optional; consumers must tolerate older rows):
--   {
--     "audienceType": "event_ticket_holders",
--     "eventId": "...",
--     "eventName": "Latin Legends Vol.2",
--     "eventDate": "2026-10-04",
--     "ticketHolderStatus": "all",
--     "resolvedRecipientCount": 143,
--     "linkedStudentCount": 61,
--     "guestCount": 82,
--     "excludedUnpaidCount": 4,
--     "excludedNoEmailCount": 1,
--     "duplicatesCollapsed": 7,
--     "inAppSentCount": 61,
--     "emailSentCount": 141,
--     "emailFailedCount": 2,
--     "sentAt": "2026-09-22T12:31:00.000Z"
--   }
--
-- Nullable with no backfill: broadcasts sent before this shipped
-- legitimately have no summary, and inventing one would misrepresent
-- what was delivered.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════

alter table admin_broadcasts
  add column if not exists send_summary jsonb;

comment on column admin_broadcasts.send_summary is
  'Immutable record of what this broadcast resolved to and delivered at send time (recipient counts, guest vs linked split, per-channel results, and for event audiences the eventId/eventName). NULL on broadcasts sent before Phase 17. Distinct from audience_params, which holds the admin''s configuration and is re-resolved on every send.';

-- Lets an admin find every broadcast sent about one event without a
-- full table scan of the jsonb.
create index if not exists idx_admin_broadcasts_send_summary_event
  on admin_broadcasts ((send_summary ->> 'eventId'))
  where send_summary is not null;
