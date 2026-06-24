import { describe, expect, it } from "vitest";
import type {
  MockStudentReferral,
  MockReferralReward,
} from "@/lib/mock-data";
import {
  DEFAULT_REFERRAL_REWARD_THRESHOLD,
  isRewardEligible,
  summarizeReferrals,
  summarizeRewards,
  validateReferralCreate,
  validateRewardInput,
  formatReferralReward,
  resolveReferralCode,
} from "@/lib/domain/referrals";

function referral(
  partial: Partial<MockStudentReferral> & { referrerStudentId: string },
): MockStudentReferral {
  const now = new Date().toISOString();
  return {
    id: `ref-${Math.random().toString(36).slice(2, 8)}`,
    referrerStudentId: partial.referrerStudentId,
    referredStudentId: partial.referredStudentId ?? null,
    referredEmail: partial.referredEmail ?? null,
    referralCode: partial.referralCode ?? null,
    status: partial.status ?? "pending",
    verifiedAt: partial.verifiedAt ?? null,
    verifiedBy: partial.verifiedBy ?? null,
    note: partial.note ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function reward(
  partial: Partial<MockReferralReward> & { referrerStudentId: string },
): MockReferralReward {
  const now = new Date().toISOString();
  return {
    id: `rrwd-${Math.random().toString(36).slice(2, 8)}`,
    referrerStudentId: partial.referrerStudentId,
    termId: partial.termId ?? null,
    verifiedReferralCount: partial.verifiedReferralCount ?? 3,
    rewardType: "membership_discount",
    discountKind: partial.discountKind ?? "percentage",
    discountValue: partial.discountValue ?? 10,
    status: partial.status ?? "pending",
    approvedBy: partial.approvedBy ?? null,
    approvedAt: partial.approvedAt ?? null,
    appliedSubscriptionId: partial.appliedSubscriptionId ?? null,
    appliedAt: partial.appliedAt ?? null,
    cancelledAt: partial.cancelledAt ?? null,
    cancelledReason: partial.cancelledReason ?? null,
    note: partial.note ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe("summarizeReferrals", () => {
  it("returns all-zero counts for an empty list", () => {
    const counts = summarizeReferrals([]);
    expect(counts).toEqual({
      pending: 0,
      verified: 0,
      rejected: 0,
      rewarded: 0,
      total: 0,
      verifiedAllTime: 0,
      rewardable: 0,
    });
  });

  it("buckets statuses correctly and computes derived counts", () => {
    const counts = summarizeReferrals([
      referral({ referrerStudentId: "s-1", status: "pending" }),
      referral({ referrerStudentId: "s-1", status: "verified" }),
      referral({ referrerStudentId: "s-1", status: "verified" }),
      referral({ referrerStudentId: "s-1", status: "rejected" }),
      referral({ referrerStudentId: "s-1", status: "rewarded" }),
    ]);
    expect(counts.pending).toBe(1);
    expect(counts.verified).toBe(2);
    expect(counts.rejected).toBe(1);
    expect(counts.rewarded).toBe(1);
    expect(counts.total).toBe(5);
    expect(counts.verifiedAllTime).toBe(3);
    expect(counts.rewardable).toBe(2);
  });
});

describe("summarizeRewards", () => {
  it("buckets reward statuses", () => {
    const summary = summarizeRewards([
      reward({ referrerStudentId: "s-1", status: "pending" }),
      reward({ referrerStudentId: "s-1", status: "approved" }),
      reward({ referrerStudentId: "s-1", status: "applied" }),
      reward({ referrerStudentId: "s-1", status: "cancelled" }),
    ]);
    expect(summary).toEqual({
      pending: 1,
      approved: 1,
      applied: 1,
      cancelled: 1,
      total: 4,
    });
  });
});

describe("isRewardEligible", () => {
  it("requires the configured threshold of verified-not-rewarded referrals", () => {
    const make = (verified: number) =>
      summarizeReferrals(
        Array.from({ length: verified }, () =>
          referral({ referrerStudentId: "s-1", status: "verified" }),
        ),
      );
    expect(isRewardEligible(make(0))).toBe(false);
    expect(isRewardEligible(make(2))).toBe(false);
    expect(isRewardEligible(make(3))).toBe(true);
    expect(isRewardEligible(make(7))).toBe(true);
  });

  it("uses the default threshold of 3", () => {
    expect(DEFAULT_REFERRAL_REWARD_THRESHOLD).toBe(3);
  });

  it("respects a custom threshold", () => {
    const counts = summarizeReferrals(
      Array.from({ length: 3 }, () =>
        referral({ referrerStudentId: "s-1", status: "verified" }),
      ),
    );
    expect(isRewardEligible(counts, 5)).toBe(false);
    expect(isRewardEligible(counts, 3)).toBe(true);
  });

  it("rejects non-positive thresholds defensively", () => {
    const counts = summarizeReferrals([
      referral({ referrerStudentId: "s-1", status: "verified" }),
    ]);
    expect(isRewardEligible(counts, 0)).toBe(false);
    expect(isRewardEligible(counts, -1)).toBe(false);
    expect(isRewardEligible(counts, Number.NaN)).toBe(false);
  });

  it("does NOT count already-rewarded referrals toward the next reward", () => {
    const counts = summarizeReferrals([
      referral({ referrerStudentId: "s-1", status: "rewarded" }),
      referral({ referrerStudentId: "s-1", status: "rewarded" }),
      referral({ referrerStudentId: "s-1", status: "rewarded" }),
    ]);
    expect(counts.verifiedAllTime).toBe(3);
    expect(counts.rewardable).toBe(0);
    expect(isRewardEligible(counts)).toBe(false);
  });
});

describe("validateReferralCreate", () => {
  const existing: MockStudentReferral[] = [];

  it("requires a referrer", () => {
    expect(
      validateReferralCreate({
        referrerStudentId: "",
        referredStudentId: "s-2",
        referredEmail: null,
        existing,
      }),
    ).toMatch(/Referrer/);
  });

  it("requires at least a referred id or email", () => {
    expect(
      validateReferralCreate({
        referrerStudentId: "s-1",
        referredStudentId: null,
        referredEmail: null,
        existing,
      }),
    ).toMatch(/referred student or a referred email/);
  });

  it("blocks self-referral", () => {
    expect(
      validateReferralCreate({
        referrerStudentId: "s-1",
        referredStudentId: "s-1",
        referredEmail: null,
        existing,
      }),
    ).toMatch(/cannot refer themselves/);
  });

  it("blocks duplicate by referredStudentId for the same referrer", () => {
    const prior = [
      referral({
        referrerStudentId: "s-1",
        referredStudentId: "s-2",
        status: "pending",
      }),
    ];
    expect(
      validateReferralCreate({
        referrerStudentId: "s-1",
        referredStudentId: "s-2",
        referredEmail: null,
        existing: prior,
      }),
    ).toMatch(/already been referred/);
  });

  it("blocks duplicate by referred email (case-insensitive)", () => {
    const prior = [
      referral({
        referrerStudentId: "s-1",
        referredEmail: "beginner@example.com",
        status: "verified",
      }),
    ];
    expect(
      validateReferralCreate({
        referrerStudentId: "s-1",
        referredStudentId: null,
        referredEmail: "BEGINNER@example.com",
        existing: prior,
      }),
    ).toMatch(/email has already been referred/);
  });

  it("does NOT block when the prior referral is rejected", () => {
    const prior = [
      referral({
        referrerStudentId: "s-1",
        referredStudentId: "s-2",
        status: "rejected",
      }),
    ];
    expect(
      validateReferralCreate({
        referrerStudentId: "s-1",
        referredStudentId: "s-2",
        referredEmail: null,
        existing: prior,
      }),
    ).toBeNull();
  });

  it("does NOT block duplicates across different referrers", () => {
    const prior = [
      referral({
        referrerStudentId: "s-1",
        referredStudentId: "s-2",
        status: "pending",
      }),
    ];
    expect(
      validateReferralCreate({
        referrerStudentId: "s-3",
        referredStudentId: "s-2",
        referredEmail: null,
        existing: prior,
      }),
    ).toBeNull();
  });
});

describe("validateRewardInput", () => {
  it("requires a positive integer value", () => {
    expect(validateRewardInput({ discountKind: "percentage", discountValue: 0 })).toMatch(/positive/);
    expect(validateRewardInput({ discountKind: "percentage", discountValue: -1 })).toMatch(/positive/);
    expect(validateRewardInput({ discountKind: "percentage", discountValue: 1.5 })).toMatch(/positive/);
  });
  it("caps percentage at 100", () => {
    expect(validateRewardInput({ discountKind: "percentage", discountValue: 100 })).toBeNull();
    expect(validateRewardInput({ discountKind: "percentage", discountValue: 101 })).toMatch(/100/);
  });
  it("allows large fixed values", () => {
    expect(validateRewardInput({ discountKind: "fixed_cents", discountValue: 10_000 })).toBeNull();
  });
});

describe("formatReferralReward", () => {
  it("formats percentage", () => {
    const r = reward({
      referrerStudentId: "s-1",
      discountKind: "percentage",
      discountValue: 15,
    });
    expect(formatReferralReward(r)).toBe("15%");
  });
  it("formats fixed cents in euros with 2 decimals", () => {
    const r = reward({
      referrerStudentId: "s-1",
      discountKind: "fixed_cents",
      discountValue: 1250,
    });
    expect(formatReferralReward(r)).toBe("€12.50");
  });
});

describe("resolveReferralCode (Phase 7 checkout flow)", () => {
  it("returns empty when the code is whitespace", () => {
    const r = resolveReferralCode({
      code: "   ",
      resolvedReferrerId: null,
      applicantStudentId: "beg-1",
      applicantEmail: null,
      existingForReferrer: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("empty");
  });

  it("returns not_found when the referrer lookup yielded null", () => {
    const r = resolveReferralCode({
      code: "BPM-XXXX",
      resolvedReferrerId: null,
      applicantStudentId: "beg-1",
      applicantEmail: null,
      existingForReferrer: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("not_found");
      // Friendly message — verifies UX brief copy contract.
      expect(r.message).toMatch(/couldn't find/i);
    }
  });

  it("blocks self-referral when applicant id matches referrer id", () => {
    const r = resolveReferralCode({
      code: "BPM-AAAA",
      resolvedReferrerId: "s-1",
      applicantStudentId: "s-1",
      applicantEmail: null,
      existingForReferrer: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("self_referral");
  });

  it("blocks duplicate referral by referred_student_id", () => {
    const r = resolveReferralCode({
      code: "BPM-AAAA",
      resolvedReferrerId: "s-1",
      applicantStudentId: "beg-1",
      applicantEmail: null,
      existingForReferrer: [
        referral({
          referrerStudentId: "s-1",
          referredStudentId: "beg-1",
          status: "pending",
        }),
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("already_referred");
  });

  it("blocks duplicate referral by referred_email (case-insensitive)", () => {
    const r = resolveReferralCode({
      code: "BPM-AAAA",
      resolvedReferrerId: "s-1",
      applicantStudentId: null,
      applicantEmail: "Beg@Example.com",
      existingForReferrer: [
        referral({
          referrerStudentId: "s-1",
          referredStudentId: null,
          referredEmail: "beg@example.com",
          status: "verified",
        }),
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("already_referred");
  });

  it("ignores rejected referrals when deduping (admin can re-allow)", () => {
    const r = resolveReferralCode({
      code: "BPM-AAAA",
      resolvedReferrerId: "s-1",
      applicantStudentId: "beg-1",
      applicantEmail: null,
      existingForReferrer: [
        referral({
          referrerStudentId: "s-1",
          referredStudentId: "beg-1",
          status: "rejected",
        }),
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.referrerStudentId).toBe("s-1");
      expect(r.normalizedCode).toBe("BPM-AAAA");
    }
  });

  it("returns ok with upper-cased normalised code on success", () => {
    const r = resolveReferralCode({
      code: "  bpm-aaaa  ",
      resolvedReferrerId: "s-1",
      applicantStudentId: "beg-1",
      applicantEmail: "beg@example.com",
      existingForReferrer: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalizedCode).toBe("BPM-AAAA");
      expect(r.referrerStudentId).toBe("s-1");
    }
  });
});
