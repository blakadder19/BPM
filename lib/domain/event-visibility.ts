/**
 * Pure-domain visibility & history predicates for special events
 * (Phase 4 — past event archive / delete protection).
 *
 * No IO / no Next.js — safe to import from server components, server
 * actions, client components, and tests.
 *
 * Three orthogonal concepts live here:
 *
 *   1. `status` (`draft` / `published`) — "is the event content ready
 *      to be shown to anyone outside admin?"
 *   2. `isVisible` / `isPublic` — surface-specific publication flags
 *      already used by the events module today.
 *   3. `archivedAt` — Phase-4 soft hide. A non-null timestamp removes
 *      the event from every public surface (student events list,
 *      student detail, `/event/[id]` shareable) while keeping it
 *      visible to admins and preserving all related history.
 *
 * The "do we show this to a student/public viewer?" decision MUST
 * pass through one of the predicates below — every public render path
 * must filter on `shouldShowEventInPublicList` or
 * `shouldShowEventOnPublicPage` so an archive cannot be bypassed by
 * adding a new view that forgets the flag.
 */
import { isEventEnded } from "@/lib/domain/datetime";
import type { MockSpecialEvent, MockEventPurchase } from "@/lib/mock-data";

/**
 * Narrow read-only shape for predicate inputs. Lets tests and
 * server-action history checks pass plain objects without dragging
 * the full Mock type through.
 */
export type EventLikeForVisibility = Pick<
  MockSpecialEvent,
  "status" | "isVisible" | "isPublic" | "archivedAt" | "endDate"
>;

/** True when the event has been soft-archived. */
export function isEventArchived(event: { archivedAt: string | null }): boolean {
  return event.archivedAt != null;
}

/** True when the event has already ended (delegates to existing helper). */
export function isEventPast(event: { endDate: string }): boolean {
  return isEventEnded(event.endDate);
}

/**
 * Decision used by the student events list (`/events`) and the
 * dashboard "owned"/"promoted" event cards.
 *
 * `published && isVisible && !archived`. Past events are NOT
 * filtered here — the call sites that want only upcoming events
 * additionally check `isEventPast` (mirrors today's behaviour;
 * Phase 4 deliberately doesn't auto-hide past events from the
 * student list, only allows admins to archive them).
 */
export function shouldShowEventInPublicList(
  event: EventLikeForVisibility,
): boolean {
  if (isEventArchived(event)) return false;
  if (event.status !== "published") return false;
  if (!event.isVisible) return false;
  return true;
}

/**
 * Decision used by the student event detail page
 * (`app/(app)/events/[id]`). Same logic as the list — archived
 * events 404 to students even if they have the direct URL.
 */
export function shouldShowEventToStudent(
  event: EventLikeForVisibility,
): boolean {
  return shouldShowEventInPublicList(event);
}

/**
 * Decision used by the unauthenticated public shareable page
 * (`app/event/[id]`). Stricter than student visibility: requires the
 * dedicated `isPublic` flag and never shows archived events.
 */
export function shouldShowEventOnPublicPage(
  event: EventLikeForVisibility,
): boolean {
  if (isEventArchived(event)) return false;
  if (event.status !== "published") return false;
  if (!event.isPublic) return false;
  return true;
}

/**
 * Does the event have *any* historical record that would be
 * destroyed by a hard delete? In Phase-4 scope this is exactly the
 * presence of an `event_purchases` row for the event — purchases
 * cascade-touch sessions / products / check-ins / finance audit log,
 * so a single purchase is the right "history exists" sentinel.
 *
 * Pure / order-independent / O(n). Caller is responsible for
 * fetching the purchases (the action loads them server-side via the
 * repository before calling this).
 */
export function eventHasHistory(
  purchases: readonly Pick<MockEventPurchase, "id">[] | null | undefined,
): boolean {
  if (!purchases || purchases.length === 0) return false;
  return true;
}

/**
 * Human-readable error used by both the server action and the admin
 * UI when delete is blocked. Centralised here so the wording stays
 * consistent everywhere.
 */
export const DELETE_BLOCKED_MESSAGE =
  "This event has history. Hide or archive it instead of deleting.";
