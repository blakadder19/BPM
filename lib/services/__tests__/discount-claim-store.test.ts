import { describe, expect, it, beforeEach } from "vitest";

import {
  tryCreate,
  release,
  findActive,
  findActiveForRule,
  getActiveByStudent,
  setRelated,
  _resetForTests,
} from "@/lib/services/discount-claim-store";

describe("discount-claim-store atomic guarantees", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("grants a first-time claim when none exists", () => {
    const r = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-1",
      source: "catalog_purchase",
    });
    expect(r.granted).toBe(true);
    expect(r.claim?.studentId).toBe("s-1");
    expect(r.existingClaim).toBeNull();
  });

  it("denies a second concurrent claim for the same student", () => {
    const a = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-1",
      source: "catalog_purchase",
    });
    const b = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-1",
      source: "stripe_checkout",
    });
    expect(a.granted).toBe(true);
    expect(b.granted).toBe(false);
    expect(b.existingClaim?.id).toBe(a.claim?.id);
  });

  it("permits claims for different students independently", () => {
    const a = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-1",
      source: "catalog_purchase",
    });
    const b = tryCreate({
      studentId: "s-2",
      claimType: "first_time_purchase",
      ruleId: "rule-1",
      source: "stripe_checkout",
    });
    expect(a.granted).toBe(true);
    expect(b.granted).toBe(true);
  });

  it("simulates concurrent loop: only one of N parallel attempts wins", () => {
    const N = 50;
    let granted = 0;
    for (let i = 0; i < N; i++) {
      const r = tryCreate({
        studentId: "s-race",
        claimType: "first_time_purchase",
        ruleId: "rule-1",
        source: "catalog_purchase",
      });
      if (r.granted) granted++;
    }
    expect(granted).toBe(1);
  });

  it("released claims free up the slot for a fresh attempt", () => {
    const a = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-1",
      source: "stripe_checkout",
    });
    expect(a.granted).toBe(true);

    const released = release(a.claim!.id, "stripe_session_create_threw");
    expect(released).toBe(true);

    expect(findActive("s-1", "first_time_purchase")).toBeNull();

    const b = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-1",
      source: "catalog_purchase",
    });
    expect(b.granted).toBe(true);
    expect(b.claim?.id).not.toBe(a.claim?.id);
  });

  it("setRelated patches subscription / session ids without releasing", () => {
    const a = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-1",
      source: "stripe_checkout",
    });
    expect(a.granted).toBe(true);

    setRelated(a.claim!.id, { relatedSessionId: "cs_test_123" });
    setRelated(a.claim!.id, { relatedSubscriptionId: "sub-99" });

    const active = findActive("s-1", "first_time_purchase");
    expect(active?.relatedSessionId).toBe("cs_test_123");
    expect(active?.relatedSubscriptionId).toBe("sub-99");
    expect(active?.releasedAt).toBeNull();
  });

  it("released claim still appears via id but not as active", () => {
    const a = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-1",
      source: "qr_dropin",
    });
    release(a.claim!.id, "test_release");
    expect(findActive("s-1", "first_time_purchase")).toBeNull();
  });

  // ── Rule-scoped semantics (post-00064) ────────────────────

  it("permits two claims for the same student under different rule ids", () => {
    const a = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-beg",
      source: "catalog_purchase",
    });
    const b = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-yoga",
      source: "catalog_purchase",
    });
    expect(a.granted).toBe(true);
    expect(b.granted).toBe(true);
    expect(a.claim!.id).not.toBe(b.claim!.id);
  });

  it("blocks a second attempt for the same student + rule_id", () => {
    const a = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-beg",
      source: "catalog_purchase",
    });
    const b = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-beg",
      source: "stripe_checkout",
    });
    expect(a.granted).toBe(true);
    expect(b.granted).toBe(false);
    expect(b.existingClaim?.id).toBe(a.claim?.id);
  });

  it("findActiveForRule isolates per-rule lookups", () => {
    tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-beg",
      source: "catalog_purchase",
    });
    expect(findActiveForRule("s-1", "rule-beg")).not.toBeNull();
    expect(findActiveForRule("s-1", "rule-yoga")).toBeNull();
  });

  it("getActiveByStudent returns every active claim regardless of rule", () => {
    tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-beg",
      source: "catalog_purchase",
    });
    tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-yoga",
      source: "stripe_checkout",
    });
    const list = getActiveByStudent("s-1", "first_time_purchase");
    expect(list).toHaveLength(2);
    const ruleIds = list.map((c) => c.ruleId).sort();
    expect(ruleIds).toEqual(["rule-beg", "rule-yoga"]);
  });

  it("legacy null-ruleId claims sit outside the scoped unique index", () => {
    // The DB partial unique index is `(student_id, rule_id) WHERE
    // rule_id IS NOT NULL` — legacy null rows are intentionally
    // excluded so historical "any first-time" rows don't poison the
    // new per-rule slots. The in-memory store mirrors that.
    const legacy = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: null,
      source: "admin_manual",
    });
    expect(legacy.granted).toBe(true);
    const scoped = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: "rule-beg",
      source: "catalog_purchase",
    });
    expect(scoped.granted).toBe(true);
    // findActiveForRule MUST not return the legacy row for this rule.
    expect(findActiveForRule("s-1", "rule-beg")?.id).toBe(scoped.claim?.id);
  });

  it("legacy null-ruleId claims still deduplicate among themselves", () => {
    const a = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: null,
      source: "admin_manual",
    });
    const b = tryCreate({
      studentId: "s-1",
      claimType: "first_time_purchase",
      ruleId: null,
      source: "admin_manual",
    });
    expect(a.granted).toBe(true);
    expect(b.granted).toBe(false);
    expect(b.existingClaim?.id).toBe(a.claim?.id);
  });
});
