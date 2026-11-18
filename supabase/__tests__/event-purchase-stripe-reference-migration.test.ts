/**
 * Migration 00083 adds a partial unique index on Stripe payment references
 * and changes no data. The fulfilment code recognises a violation of this
 * index by name, so the two must stay in sync.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/00083_event_purchase_stripe_reference_unique.sql"),
  "utf8",
);
const DIAGNOSTIC = readFileSync(
  join(ROOT, "supabase/diagnostics/2026-11-18-event-purchase-stripe-reference-00083.sql"),
  "utf8",
);
const FULFILMENT = readFileSync(join(ROOT, "lib/services/event-purchase-fulfillment.ts"), "utf8");

function sqlWithoutComments(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

describe("00083 event purchase Stripe reference uniqueness", () => {
  const sql = sqlWithoutComments(MIGRATION);

  it("creates a unique index limited to stripe: references", () => {
    expect(sql).toMatch(
      /create unique index if not exists ux_event_purchases_stripe_reference\s+on public\.event_purchases \(payment_reference\)\s+where payment_reference like 'stripe:%'/,
    );
  });

  it("the fulfilment code matches the index by its exact name", () => {
    expect(FULFILMENT).toContain('"ux_event_purchases_stripe_reference"');
  });

  it("stops before creating the index when duplicates exist", () => {
    const precheck = sql.indexOf("raise exception");
    expect(precheck).toBeGreaterThan(-1);
    expect(precheck).toBeLessThan(sql.indexOf("create unique index"));
  });

  it("changes no rows", () => {
    expect(sql).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from|truncate|drop\s+)/i);
  });

  it("the diagnostic is read-only", () => {
    expect(sqlWithoutComments(DIAGNOSTIC)).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|create)\b/i);
  });
});
