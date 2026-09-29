import { describe, it, expect } from "vitest";
import { purchasesForEvents } from "../event-purchase-grouping";

type P = { id: string; eventId: string };

const events = [{ id: "e2" }, { id: "e1" }, { id: "e3" }];
// As getAllPurchases returns them: newest first, events interleaved.
const all: P[] = [
  { id: "p5", eventId: "e1" },
  { id: "p4", eventId: "e2" },
  { id: "p3", eventId: "e1" },
  { id: "p2", eventId: "orphan" },
  { id: "p1", eventId: "e2" },
];

/** What the old code produced: one query per event, flattened. */
function perEventFanOut(evts: { id: string }[], purchases: P[]): P[] {
  return evts.flatMap((e) => purchases.filter((p) => p.eventId === e.id));
}

describe("purchasesForEvents", () => {
  it("returns exactly what the per-event fan-out returned, in the same order", () => {
    expect(purchasesForEvents(events, all)).toEqual(perEventFanOut(events, all));
    expect(purchasesForEvents(events, all).map((p) => p.id)).toEqual(["p4", "p1", "p5", "p3"]);
  });

  it("drops purchases whose event is not in the list", () => {
    expect(purchasesForEvents(events, all).some((p) => p.eventId === "orphan")).toBe(false);
  });

  it("handles events with no purchases and empty inputs", () => {
    expect(purchasesForEvents([{ id: "e3" }], all)).toEqual([]);
    expect(purchasesForEvents([], all)).toEqual([]);
    expect(purchasesForEvents(events, [])).toEqual([]);
  });
});
