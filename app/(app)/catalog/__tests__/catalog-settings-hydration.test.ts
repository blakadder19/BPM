import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The catalog skips full operational hydration for egress reasons, but the
 * term purchase rules it shows come from business settings, which must be
 * loaded from the database before they are read — never defaulted.
 */

const h = vi.hoisted(() => ({
  calls: [] as string[],
  hydrate: async () => {},
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireRole: async () => ({ id: "student-1", email: "student@example.test" }),
}));
vi.mock("@/lib/server/cached-queries", () => ({
  cachedCocCheck: async () => true,
  cachedGetProducts: async () => [],
  cachedGetTerms: async () => [],
  cachedGetStudentSubs: async () => [],
}));
vi.mock("@/lib/services/dance-style-store", () => ({ getDanceStyles: () => [] }));
vi.mock("@/lib/services/term-lifecycle-service", () => ({
  lazyExpireSubscriptions: async () => {},
}));
vi.mock("@/lib/stripe", () => ({ isStripeEnabled: () => false }));
vi.mock("@/lib/services/pricing-service", () => ({
  previewPricingForStudent: async () => new Map(),
}));
vi.mock("@/components/catalog/student-catalog", () => ({ StudentCatalog: () => null }));
vi.mock("@/lib/services/settings-store", () => ({
  hydrateSettings: async () => {
    h.calls.push("hydrate:start");
    await h.hydrate();
    h.calls.push("hydrate:done");
  },
  getLoadedSettings: () => {
    h.calls.push("read");
    return { studentTermSelectionEnabled: true, termPurchaseWindowDays: 14 };
  },
}));

import CatalogPage from "@/app/(app)/catalog/page";

beforeEach(() => {
  h.calls.length = 0;
  h.hydrate = async () => {};
});

describe("CatalogPage business settings", () => {
  it("loads settings before reading the term purchase rules", async () => {
    await CatalogPage();
    expect(h.calls).toEqual(["hydrate:start", "hydrate:done", "read"]);
  });

  it("fails instead of rendering with default rules when settings cannot load", async () => {
    h.hydrate = async () => {
      throw new Error("Business settings could not be loaded");
    };
    await expect(CatalogPage()).rejects.toThrow("Business settings could not be loaded");
    expect(h.calls).not.toContain("read");
  });
});
