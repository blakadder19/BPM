/**
 * Phase 23A.1 — event purchase repositories persist event_title_snapshot.
 * The Supabase repo retries without it only when the database rejects the
 * column as missing (pre-00082).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freezeEventTitle } from "@/lib/domain/event-title-snapshot";
import type { CreatePurchaseData } from "../interfaces/special-event-repository";

const h = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  responses: [] as { data: unknown; error: { code?: string; message: string } | null }[],
}));

vi.mock("@/lib/supabase/academy", () => ({ getAcademyId: vi.fn(async () => "academy-1") }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        h.inserts.push(row);
        const response = h.responses.shift() ?? { data: null, error: { message: "no response queued" } };
        return { select: () => ({ single: async () => response }) };
      },
    }),
  }),
}));

import { isMissingEventTitleColumnError, supabaseSpecialEventRepo } from "../supabase/special-event-repository";
import { memorySpecialEventRepo } from "../memory/special-event-repository";

function input(over: Partial<CreatePurchaseData> = {}): CreatePurchaseData {
  return {
    studentId: null,
    eventProductId: "prod-1",
    eventId: "evt-1",
    guestName: "Guest Person",
    guestEmail: "guest@example.com",
    paymentMethod: "stripe",
    paymentStatus: "paid",
    paidAmountCents: 2000,
    productNameSnapshot: "Full Pass",
    productTypeSnapshot: "full_pass",
    eventTitleSnapshot: "Beginners Salsa & Bachata",
    ...over,
  };
}

const returned = (extra: Record<string, unknown>) => ({
  id: "ep-new",
  event_id: "evt-1",
  event_product_id: "prod-1",
  payment_method: "stripe",
  payment_status: "paid",
  purchased_at: "2026-11-17T10:00:00Z",
  ...extra,
});

beforeEach(() => {
  h.inserts = [];
  h.responses = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("freezeEventTitle", () => {
  it("trims", () => expect(freezeEventTitle("  Yoga Day ")).toBe("Yoga Day"));
  it.each([null, undefined, "", "   "])("refuses %j", (t) => expect(() => freezeEventTitle(t)).toThrow());
});

describe("isMissingEventTitleColumnError", () => {
  it("matches only rejections naming event_title_snapshot", () => {
    expect(isMissingEventTitleColumnError({ code: "PGRST204", message: "Could not find the 'event_title_snapshot' column" })).toBe(true);
    expect(isMissingEventTitleColumnError({ code: "42703", message: 'column "event_title_snapshot" does not exist' })).toBe(true);
    expect(isMissingEventTitleColumnError({ code: "PGRST204", message: "Could not find the 'notes' column" })).toBe(false);
    expect(isMissingEventTitleColumnError({ code: "23503", message: "event_title_snapshot fk" })).toBe(false);
  });
});

describe("supabase event purchase repository", () => {
  it("inserts the frozen title and maps it back", async () => {
    h.responses.push({ data: returned({ event_title_snapshot: "Beginners Salsa & Bachata" }), error: null });
    const p = await supabaseSpecialEventRepo.createPurchase(input());
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].event_title_snapshot).toBe("Beginners Salsa & Bachata");
    expect(p.eventTitleSnapshot).toBe("Beginners Salsa & Bachata");
  });

  it("retries without the column only when it is missing (pre-00082)", async () => {
    h.responses.push({ data: null, error: { code: "PGRST204", message: "Could not find the 'event_title_snapshot' column" } });
    h.responses.push({ data: returned({}), error: null });
    const p = await supabaseSpecialEventRepo.createPurchase(input());
    expect(h.inserts).toHaveLength(2);
    expect(h.inserts[1]).not.toHaveProperty("event_title_snapshot");
    expect(p.eventTitleSnapshot).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("does not retry on any other error", async () => {
    h.responses.push({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });
    await expect(supabaseSpecialEventRepo.createPurchase(input())).rejects.toThrow(/foreign key/);
    expect(h.inserts).toHaveLength(1);
  });

  it("refuses a blank title before touching the database", async () => {
    await expect(supabaseSpecialEventRepo.createPurchase(input({ eventTitleSnapshot: " " }))).rejects.toThrow();
    expect(h.inserts).toHaveLength(0);
  });
});

describe("memory event purchase repository", () => {
  it("stores the frozen title", async () => {
    const p = await memorySpecialEventRepo.createPurchase(input());
    expect(p.eventTitleSnapshot).toBe("Beginners Salsa & Bachata");
  });

  it("refuses a blank title", async () => {
    await expect(memorySpecialEventRepo.createPurchase(input({ eventTitleSnapshot: "" }))).rejects.toThrow();
  });
});
