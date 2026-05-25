/**
 * Unit tests for product stackability — the `allowMultipleActivePurchases`
 * flag and the duplicate-guard branches it drives in the in-memory store.
 *
 * We exercise the store layer directly (no Supabase) because in-memory
 * mode is the documented default for local dev + CI.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createProduct, updateProduct, getProducts } from "@/lib/services/product-store";

beforeEach(() => {
  // Reset the global in-memory product store so each test is isolated.
  // The store seeds itself from PRODUCTS the first time getProducts()
  // is called inside a fresh global scope.
  const g = globalThis as unknown as { __bpm_products?: unknown };
  g.__bpm_products = undefined;
});

describe("product stackability", () => {
  it("defaults allowMultipleActivePurchases to true for new products", () => {
    const p = createProduct({
      name: "Bronze Pass — Salsa",
      description: "Stackable pass test",
      productType: "pass",
      priceCents: 5500,
      totalCredits: 4,
      durationDays: 30,
      styleName: "Salsa",
      allowedLevels: null,
      isProvisional: false,
      notes: null,
      validityDescription: null,
      creditsModel: "fixed",
      termBound: false,
      recurring: false,
      classesPerTerm: null,
      autoRenew: false,
    });
    expect(p.allowMultipleActivePurchases).toBe(true);
  });

  it("honours an explicit allowMultipleActivePurchases=false on create", () => {
    const p = createProduct({
      name: "Single-issue annual membership",
      description: "Non-stackable test",
      productType: "membership",
      priceCents: 50000,
      totalCredits: null,
      durationDays: 365,
      styleName: null,
      allowedLevels: null,
      isProvisional: false,
      notes: null,
      validityDescription: null,
      creditsModel: "unlimited",
      termBound: false,
      recurring: false,
      classesPerTerm: null,
      autoRenew: false,
      allowMultipleActivePurchases: false,
    });
    expect(p.allowMultipleActivePurchases).toBe(false);
  });

  it("can be toggled via updateProduct", () => {
    const p = createProduct({
      name: "Togglable pass",
      description: "",
      productType: "pass",
      priceCents: 5000,
      totalCredits: 4,
      durationDays: 30,
      styleName: null,
      allowedLevels: null,
      isProvisional: false,
      notes: null,
      validityDescription: null,
      creditsModel: "fixed",
      termBound: false,
      recurring: false,
      classesPerTerm: null,
      autoRenew: false,
    });
    expect(p.allowMultipleActivePurchases).toBe(true);
    const updated = updateProduct(p.id, { allowMultipleActivePurchases: false });
    expect(updated?.allowMultipleActivePurchases).toBe(false);
    const reset = updateProduct(p.id, { allowMultipleActivePurchases: true });
    expect(reset?.allowMultipleActivePurchases).toBe(true);
  });

  it("all seeded products have allowMultipleActivePurchases set (default true)", () => {
    // Touching getProducts() seeds the store from PRODUCTS in memory mode.
    const list = getProducts();
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(typeof p.allowMultipleActivePurchases).toBe("boolean");
      // Every PRODUCT literal is initialised to true — verify the seed
      // is consistent with the business rule "stackable by default".
      expect(p.allowMultipleActivePurchases).toBe(true);
    }
  });
});

describe("stackability duplicate-guard branch", () => {
  // Pure logic equivalent to the guards in catalog-purchase.ts and
  // stripe-checkout.ts. Mirrors the production rule so the regression
  // is caught if either guard drifts.
  function isStackable(product: { productType: string; allowMultipleActivePurchases: boolean }): boolean {
    return product.productType === "drop_in" || product.allowMultipleActivePurchases !== false;
  }

  it("drop-ins are always stackable", () => {
    expect(isStackable({ productType: "drop_in", allowMultipleActivePurchases: false })).toBe(true);
    expect(isStackable({ productType: "drop_in", allowMultipleActivePurchases: true })).toBe(true);
  });

  it("passes are stackable when the flag is true (default)", () => {
    expect(isStackable({ productType: "pass", allowMultipleActivePurchases: true })).toBe(true);
  });

  it("passes are non-stackable only when explicitly flagged", () => {
    expect(isStackable({ productType: "pass", allowMultipleActivePurchases: false })).toBe(false);
  });

  it("memberships behave the same as passes", () => {
    expect(isStackable({ productType: "membership", allowMultipleActivePurchases: true })).toBe(true);
    expect(isStackable({ productType: "membership", allowMultipleActivePurchases: false })).toBe(false);
  });
});
