/**
 * Phase 11 — smoke tests for the `?tab=<friendly>` URL param mapper.
 *
 * The catalog page accepts a public-facing "tab" query so external
 * links (e.g. the "Log in to purchase" CTA on the public event page
 * that redirects to `/login?next=/catalog?tab=passes` after auth) can
 * deep-link into the passes / memberships / drop-ins tab.
 *
 * We keep the mapper as a small, pure helper so we can lock the
 * accepted vocabulary and fallback behaviour with tests without
 * needing a full component render.
 */
import { describe, it, expect } from "vitest";
import { resolveInitialTypeFilter } from "../catalog-tab-mapping";

describe("resolveInitialTypeFilter", () => {
  it("returns 'all' when no tab is provided", () => {
    expect(resolveInitialTypeFilter(null)).toBe("all");
    expect(resolveInitialTypeFilter("")).toBe("all");
  });

  it("maps the primary friendly names to internal filter values", () => {
    expect(resolveInitialTypeFilter("passes")).toBe("pass");
    expect(resolveInitialTypeFilter("memberships")).toBe("membership");
    expect(resolveInitialTypeFilter("drop-ins")).toBe("drop_in");
  });

  it("accepts singular forms too", () => {
    expect(resolveInitialTypeFilter("pass")).toBe("pass");
    expect(resolveInitialTypeFilter("membership")).toBe("membership");
    expect(resolveInitialTypeFilter("drop-in")).toBe("drop_in");
  });

  it("accepts a few forgiving variants for drop-in", () => {
    expect(resolveInitialTypeFilter("dropins")).toBe("drop_in");
    expect(resolveInitialTypeFilter("dropin")).toBe("drop_in");
    expect(resolveInitialTypeFilter("drop_in")).toBe("drop_in");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveInitialTypeFilter("PASSES")).toBe("pass");
    expect(resolveInitialTypeFilter("  Passes  ")).toBe("pass");
    expect(resolveInitialTypeFilter("Memberships")).toBe("membership");
  });

  it("falls back to 'all' for unknown / bogus values (never crashes)", () => {
    expect(resolveInitialTypeFilter("foo")).toBe("all");
    expect(resolveInitialTypeFilter("💥")).toBe("all");
    expect(resolveInitialTypeFilter("workshop")).toBe("all");
  });
});
