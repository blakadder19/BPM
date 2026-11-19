/**
 * Phase 23A — every new subscription row freezes product_name_snapshot /
 * product_type_snapshot. Both repositories go through freezeProductIdentity,
 * so no creation path can skip it. The Supabase repo retries without the
 * columns only when the database rejects them as missing (pre-00082).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freezeProductIdentity } from "@/lib/domain/subscription-snapshot";
import type { CreateSubscriptionData } from "../interfaces/subscription-repository";

const h = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  responses: [] as { data: unknown; error: { code?: string; message: string } | null }[],
}));

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

import { isMissingProductIdentityColumnError, supabaseSubscriptionRepo } from "../supabase/subscription-repository";
import { memorySubscriptionRepo } from "../memory/subscription-repository";

function input(over: Partial<CreateSubscriptionData> = {}): CreateSubscriptionData {
  return {
    studentId: "student-zaria-test",
    productId: "prod-1",
    productName: "Bronze Class Pass",
    productType: "pass",
    status: "active",
    totalCredits: 4,
    remainingCredits: 4,
    validFrom: "2026-11-01",
    validUntil: "2026-12-01",
    notes: null,
    termId: null,
    paymentMethod: "stripe",
    autoRenew: false,
    classesUsed: 0,
    classesPerTerm: null,
    priceCentsAtPurchase: 4500,
    ...over,
  };
}

function returnedRow(row: Record<string, unknown>) {
  return { id: "sub-new", created_at: "2026-11-17T10:00:00Z", ...row, products: { name: "Renamed Live Product", product_type: "pass" } };
}

beforeEach(() => {
  h.inserts = [];
  h.responses = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("freezeProductIdentity", () => {
  it("trims and freezes name and type", () => {
    expect(freezeProductIdentity({ productName: "  Bronze  ", productType: "pass" })).toEqual({
      productNameSnapshot: "Bronze",
      productTypeSnapshot: "pass",
    });
  });

  it.each([
    ["", "pass"],
    ["   ", "pass"],
    ["Bronze", ""],
  ])("refuses blank name/type (%j, %j)", (productName, productType) => {
    expect(() => freezeProductIdentity({ productName, productType })).toThrow();
  });
});

describe("isMissingProductIdentityColumnError", () => {
  it("matches only rejections naming the 00082 columns", () => {
    expect(isMissingProductIdentityColumnError({ code: "PGRST204", message: "Could not find the 'product_name_snapshot' column" })).toBe(true);
    expect(isMissingProductIdentityColumnError({ code: "42703", message: 'column "product_type_snapshot" does not exist' })).toBe(true);
    expect(isMissingProductIdentityColumnError({ message: "product_name_snapshot missing" })).toBe(true);
    expect(isMissingProductIdentityColumnError({ code: "PGRST204", message: "Could not find the 'notes' column" })).toBe(false);
    expect(isMissingProductIdentityColumnError({ code: "23505", message: "duplicate key product_name_snapshot" })).toBe(false);
  });
});

describe("memory subscription repository", () => {
  it("freezes the product identity on create", async () => {
    const sub = await memorySubscriptionRepo.create(input());
    expect(sub.productNameSnapshot).toBe("Bronze Class Pass");
    expect(sub.productTypeSnapshot).toBe("pass");
  });

  it("refuses a create with no product name", async () => {
    await expect(memorySubscriptionRepo.create(input({ productName: "" }))).rejects.toThrow();
  });
});

describe("supabase subscription repository", () => {
  it("inserts the snapshot columns and maps them back", async () => {
    h.responses.push({
      data: returnedRow({ product_name_snapshot: "Bronze Class Pass", product_type_snapshot: "pass" }),
      error: null,
    });
    const sub = await supabaseSubscriptionRepo.create(input());
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]).toMatchObject({ product_name_snapshot: "Bronze Class Pass", product_type_snapshot: "pass" });
    expect(sub.productNameSnapshot).toBe("Bronze Class Pass");
    expect(sub.productName).toBe("Renamed Live Product");
  });

  it("retries without the columns only when they are missing (pre-00082)", async () => {
    h.responses.push({ data: null, error: { code: "PGRST204", message: "Could not find the 'product_name_snapshot' column" } });
    h.responses.push({ data: returnedRow({}), error: null });
    const sub = await supabaseSubscriptionRepo.create(input());
    expect(h.inserts).toHaveLength(2);
    expect(h.inserts[1]).not.toHaveProperty("product_name_snapshot");
    expect(h.inserts[1]).not.toHaveProperty("product_type_snapshot");
    expect(sub.productNameSnapshot).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("does not retry on any other error", async () => {
    h.responses.push({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });
    await expect(supabaseSubscriptionRepo.create(input())).rejects.toThrow(/foreign key/);
    expect(h.inserts).toHaveLength(1);
  });

  it("refuses a blank product name before touching the database", async () => {
    await expect(supabaseSubscriptionRepo.create(input({ productName: " " }))).rejects.toThrow();
    expect(h.inserts).toHaveLength(0);
  });
});
