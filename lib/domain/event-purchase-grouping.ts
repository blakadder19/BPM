/**
 * Replaces the "one getPurchasesByEvent query per event" fan-out with a
 * single getAllPurchases() fetch, returning exactly what the fan-out did:
 * events in the given order, each event's purchases in the order the
 * repository returned them, and nothing for purchases whose event is not
 * in the list.
 */
export function purchasesForEvents<P extends { eventId: string }>(
  events: ReadonlyArray<{ id: string }>,
  allPurchases: ReadonlyArray<P>,
): P[] {
  const byEvent = new Map<string, P[]>();
  for (const purchase of allPurchases) {
    const list = byEvent.get(purchase.eventId);
    if (list) list.push(purchase);
    else byEvent.set(purchase.eventId, [purchase]);
  }
  return events.flatMap((e) => byEvent.get(e.id) ?? []);
}
