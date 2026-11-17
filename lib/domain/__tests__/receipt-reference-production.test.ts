/**
 * Collision diagnostic for receipt references over real purchase ids.
 *
 * Skipped unless BPM_RECEIPT_ID_SNAPSHOT points to a JSON file of the form
 * { "subscriptions": ["<uuid>", ...], "eventPurchases": ["<uuid>", ...] }
 * exported read-only from production (ids only — no personal data):
 *
 *   BPM_RECEIPT_ID_SNAPSHOT=/tmp/ids.json npx vitest run receipt-reference-production
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatReceiptReference } from "../receipts";

const snapshotPath = process.env.BPM_RECEIPT_ID_SNAPSHOT;

describe.skipIf(!snapshotPath)("receipt references — production id collision check", () => {
  it("every current subscription and event purchase id maps to a distinct reference", () => {
    const ids = JSON.parse(readFileSync(snapshotPath as string, "utf8")) as {
      subscriptions: string[];
      eventPurchases: string[];
    };
    const refs = [
      ...ids.subscriptions.map((id) => formatReceiptReference("subscription", id)),
      ...ids.eventPurchases.map((id) => formatReceiptReference("event_purchase", id)),
    ];
    // Prefixes keep the two sources apart; the 80-bit body must also be
    // unique across both, so a reference never depends on its prefix.
    const bodies = refs.map((r) => r.slice("BPM-X-".length));

    console.info(
      `[receipt-reference] checked ${ids.subscriptions.length} subscription + ${ids.eventPurchases.length} event purchase ids`,
    );
    expect(ids.subscriptions.length + ids.eventPurchases.length).toBeGreaterThan(0);
    expect(new Set(refs).size).toBe(refs.length);
    expect(new Set(bodies).size).toBe(bodies.length);
  });
});
