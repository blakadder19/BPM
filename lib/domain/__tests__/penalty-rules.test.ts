import { describe, it, expect } from "vitest";
import { resolvePenalty } from "../penalty-rules";
import type { ActiveSubscription, ClassContext } from "../credit-rules";

const classCtx: ClassContext = { danceStyleId: "ds-1", level: "Beginner 1" };

function makeSub(overrides: Partial<ActiveSubscription> = {}): ActiveSubscription {
  return {
    id: "sub-1",
    productType: "pack",
    remainingCredits: 5,
    danceStyleId: "ds-1",
    allowedLevels: null,
    ...overrides,
  };
}

describe("resolvePenalty", () => {
  it("deducts credit when a matching subscription exists", () => {
    const decision = resolvePenalty("late_cancel", 200, [makeSub()], classCtx);

    expect(decision.resolution).toBe("credit_deducted");
    expect(decision.subscriptionId).toBe("sub-1");
    expect(decision.creditDeducted).toBe(1);
    expect(decision.description).toContain("1 credit deducted");
  });

  it("returns monetary_pending when no subscriptions exist", () => {
    const decision = resolvePenalty("no_show", 500, [], classCtx);

    expect(decision.resolution).toBe("monetary_pending");
    expect(decision.subscriptionId).toBeNull();
    expect(decision.creditDeducted).toBe(0);
    expect(decision.description).toContain("€5.00 pending");
  });

  it("returns monetary_pending when subscription has no credits", () => {
    const decision = resolvePenalty(
      "late_cancel",
      200,
      [makeSub({ remainingCredits: 0 })],
      classCtx
    );

    expect(decision.resolution).toBe("monetary_pending");
    expect(decision.description).toContain("€2.00 pending");
  });

  it("returns monetary_pending when subscription style doesn't match", () => {
    const decision = resolvePenalty(
      "no_show",
      500,
      [makeSub({ danceStyleId: "ds-99" })],
      classCtx
    );

    expect(decision.resolution).toBe("monetary_pending");
  });

  it("uses correct label for no_show", () => {
    const decision = resolvePenalty("no_show", 500, [makeSub()], classCtx);
    expect(decision.description).toContain("No-show");
  });

  it("uses correct label for late_cancel", () => {
    const decision = resolvePenalty("late_cancel", 200, [makeSub()], classCtx);
    expect(decision.description).toContain("Late cancel");
  });

  it("picks subscription matching the priority order", () => {
    const subs: ActiveSubscription[] = [
      makeSub({ id: "sub-membership", productType: "membership", remainingCredits: 10 }),
      makeSub({ id: "sub-pack", productType: "pack", remainingCredits: 3 }),
      makeSub({ id: "sub-promo", productType: "promo_pass", remainingCredits: 1 }),
    ];

    const decision = resolvePenalty("late_cancel", 200, subs, classCtx);
    expect(decision.subscriptionId).toBe("sub-promo");
  });
});
