/**
 * Phase 7 — referral-code action tests.
 *
 * Covers:
 *   - previewReferralCodeAction: success / not-found / self-referral
 *     / duplicate / empty / thrown repo error swallowed.
 *   - applyPendingReferralForPurchase: success creates a row, invalid
 *     code is a no-op, self-referral is blocked, duplicate is a no-op,
 *     thrown repo error is swallowed without a rollback.
 *   - addReferralAction (admin form): formerly crashed when repo calls
 *     threw outside the try/catch. Verifies the safeAction wrapper
 *     converts thrown errors into a structured `fail()` result instead
 *     of letting them propagate to the React error boundary
 *     (the root cause of the "Something went wrong" page crash).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { MockStudentReferral } from "@/lib/mock-data";
import type {
  CreateReferralData,
  IReferralRepository,
  ReferralPatch,
} from "@/lib/repositories/interfaces/referral-repository";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Permission guard — flip GUARD_OK between tests.
let GUARD_OK = true;
vi.mock("@/lib/staff-permissions", () => ({
  requirePermissionForAction: async () =>
    GUARD_OK
      ? { ok: true, access: { user: { id: "admin-1" } } }
      : { ok: false, error: "You do not have permission to perform this action." },
}));

// Student repo — simple in-test map.
const STUDENTS = new Map<string, { id: string; fullName: string; email: string | null }>();
STUDENTS.set("ref-1", { id: "ref-1", fullName: "Ada Lovelace", email: "ada@bpm.test" });
STUDENTS.set("beg-1", { id: "beg-1", fullName: "Grace Hopper", email: "grace@bpm.test" });

// Referral repo state.
let referrals: MockStudentReferral[] = [];
let codeMap = new Map<string, string>(); // studentId → code
let throwOnNextFind = false;

const repo: IReferralRepository = {
  async getCodeForStudent(studentId) {
    const existing = codeMap.get(studentId);
    if (existing) return existing;
    const generated = `BPM-${studentId.toUpperCase().slice(0, 4)}`;
    codeMap.set(studentId, generated);
    return generated;
  },
  async getAllCodes() {
    return Array.from(codeMap.entries()).map(([studentId, code]) => ({
      studentId,
      code,
    }));
  },
  async findStudentByCode(code) {
    if (throwOnNextFind) {
      throwOnNextFind = false;
      throw new Error("simulated supabase failure");
    }
    const needle = code.trim().toLowerCase();
    for (const [studentId, c] of codeMap.entries()) {
      if (c.toLowerCase() === needle) return studentId;
    }
    return null;
  },
  async getAllReferrals() {
    return [...referrals];
  },
  async getReferralsByReferrer(referrerId) {
    return referrals.filter((r) => r.referrerStudentId === referrerId);
  },
  async getReferralById(id) {
    return referrals.find((r) => r.id === id) ?? null;
  },
  async createReferral(input: CreateReferralData) {
    const created: MockStudentReferral = {
      id: `ref-${referrals.length + 1}`,
      referrerStudentId: input.referrerStudentId,
      referredStudentId: input.referredStudentId ?? null,
      referredEmail: input.referredEmail ?? null,
      referralCode: input.referralCode ?? null,
      status: input.status ?? "pending",
      verifiedAt: null,
      verifiedBy: null,
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    referrals.push(created);
    return created;
  },
  async updateReferral(id, patch: ReferralPatch) {
    const idx = referrals.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    referrals[idx] = { ...referrals[idx], ...patch } as MockStudentReferral;
    return referrals[idx];
  },
  async deleteReferral(id) {
    const before = referrals.length;
    referrals = referrals.filter((r) => r.id !== id);
    return referrals.length < before;
  },
  async getAllRewards() {
    return [];
  },
  async getRewardsByReferrer() {
    return [];
  },
  async getRewardById() {
    return null;
  },
  async createReward() {
    throw new Error("not implemented in test fixture");
  },
  async updateReward() {
    return null;
  },
  async deleteReward() {
    return false;
  },
};

vi.mock("@/lib/repositories", () => ({
  getReferralRepo: () => repo,
  getStudentRepo: () => ({
    async getById(id: string) {
      return STUDENTS.get(id) ?? null;
    },
  }),
  getSubscriptionRepo: () => ({
    async getByStudent() {
      return [];
    },
  }),
}));

const importPreview = async () =>
  import("@/lib/actions/referral-code").then((m) => m.previewReferralCodeAction);
const importApply = async () =>
  import("@/lib/actions/referral-code").then(
    (m) => m.applyPendingReferralForPurchase,
  );
const importAddReferral = async () =>
  import("@/lib/actions/referrals").then((m) => m.addReferralAction);

beforeEach(() => {
  referrals = [];
  codeMap = new Map<string, string>();
  // Allocate a known code for the referrer.
  codeMap.set("ref-1", "BPM-AAAA");
  GUARD_OK = true;
  throwOnNextFind = false;
});

describe("previewReferralCodeAction", () => {
  it("resolves a valid code and returns the referrer's first name", async () => {
    const action = await importPreview();
    const r = await action({ code: "BPM-AAAA", applicantStudentId: "beg-1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.code).toBe("BPM-AAAA");
      expect(r.referrerName).toBe("Ada");
    }
  });

  it("matches case-insensitively and trims whitespace", async () => {
    const action = await importPreview();
    const r = await action({
      code: "  bpm-aaaa  ",
      applicantStudentId: "beg-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.code).toBe("BPM-AAAA");
  });

  it("returns not_found with friendly message for unknown codes", async () => {
    const action = await importPreview();
    const r = await action({ code: "BPM-ZZZZ", applicantStudentId: "beg-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("not_found");
      expect(r.error).toMatch(/couldn't find/i);
    }
  });

  it("returns empty when code is whitespace", async () => {
    const action = await importPreview();
    const r = await action({ code: "  ", applicantStudentId: "beg-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("blocks self-referral", async () => {
    const action = await importPreview();
    const r = await action({ code: "BPM-AAAA", applicantStudentId: "ref-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("self_referral");
      expect(r.error).toMatch(/own referral code/i);
    }
  });

  it("blocks duplicate referral by referred student id", async () => {
    referrals.push({
      id: "ref-existing",
      referrerStudentId: "ref-1",
      referredStudentId: "beg-1",
      referredEmail: null,
      referralCode: "BPM-AAAA",
      status: "pending",
      verifiedAt: null,
      verifiedBy: null,
      note: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const action = await importPreview();
    const r = await action({ code: "BPM-AAAA", applicantStudentId: "beg-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("already_referred");
  });

  it("never throws — repo failure becomes a friendly error", async () => {
    throwOnNextFind = true;
    const action = await importPreview();
    const r = await action({ code: "BPM-AAAA", applicantStudentId: "beg-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/continue without it/i);
    }
  });
});

describe("applyPendingReferralForPurchase", () => {
  it("creates a pending referral row when code is valid", async () => {
    const apply = await importApply();
    const r = await apply({
      rawCode: "BPM-AAAA",
      applicantStudentId: "beg-1",
      applicantEmail: "grace@bpm.test",
    });
    expect(r.created).toBe(true);
    if (r.created) {
      expect(r.referrerStudentId).toBe("ref-1");
    }
    expect(referrals).toHaveLength(1);
    expect(referrals[0].status).toBe("pending");
    expect(referrals[0].referredStudentId).toBe("beg-1");
    expect(referrals[0].referralCode).toBe("BPM-AAAA");
  });

  it("is a silent no-op when the code is missing", async () => {
    const apply = await importApply();
    const r = await apply({ rawCode: null, applicantStudentId: "beg-1" });
    expect(r.created).toBe(false);
    if (!r.created) expect(r.reason).toBe("no_code");
    expect(referrals).toHaveLength(0);
  });

  it("rejects self-referral as 'invalid' without creating a row", async () => {
    const apply = await importApply();
    const r = await apply({
      rawCode: "BPM-AAAA",
      applicantStudentId: "ref-1",
      applicantEmail: "ada@bpm.test",
    });
    expect(r.created).toBe(false);
    if (!r.created) expect(r.reason).toBe("invalid");
    expect(referrals).toHaveLength(0);
  });

  it("rejects duplicate referrals", async () => {
    const apply = await importApply();
    await apply({
      rawCode: "BPM-AAAA",
      applicantStudentId: "beg-1",
      applicantEmail: "grace@bpm.test",
    });
    const second = await apply({
      rawCode: "BPM-AAAA",
      applicantStudentId: "beg-1",
      applicantEmail: "grace@bpm.test",
    });
    expect(second.created).toBe(false);
    if (!second.created) expect(second.reason).toBe("duplicate");
    expect(referrals).toHaveLength(1);
  });

  it("never throws — purchase is unaffected by repo failure", async () => {
    throwOnNextFind = true;
    const apply = await importApply();
    const r = await apply({
      rawCode: "BPM-AAAA",
      applicantStudentId: "beg-1",
    });
    expect(r.created).toBe(false);
    if (!r.created) expect(r.reason).toBe("error");
  });
});

describe("addReferralAction (admin form — Phase 7 crash fix)", () => {
  function fd(parts: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(parts)) f.set(k, v);
    return f;
  }

  it("creates a referral with valid input", async () => {
    const action = await importAddReferral();
    const res = await action(
      fd({ referrerStudentId: "ref-1", referredStudentId: "beg-1" }),
    );
    expect(res.success).toBe(true);
    expect(referrals).toHaveLength(1);
  });

  it("rejects unauthorised callers without throwing", async () => {
    GUARD_OK = false;
    const action = await importAddReferral();
    const res = await action(fd({ referrerStudentId: "ref-1" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/permission/i);
  });

  it("rejects when referrer is missing", async () => {
    const action = await importAddReferral();
    const res = await action(fd({}));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/referrer is required/i);
  });

  it("rejects when neither referred student nor email is provided", async () => {
    const action = await importAddReferral();
    const res = await action(fd({ referrerStudentId: "ref-1" }));
    expect(res.success).toBe(false);
    if (!res.success)
      expect(res.error).toMatch(/either a referred student or a referred email/i);
  });

  it("converts repo crashes into a fail() result (root cause of the page crash)", async () => {
    throwOnNextFind = false;
    // Simulate the failure scenario: getReferralsByReferrer throws.
    const original = repo.getReferralsByReferrer;
    repo.getReferralsByReferrer = async () => {
      throw new Error("supabase exploded");
    };
    try {
      const action = await importAddReferral();
      const res = await action(
        fd({ referrerStudentId: "ref-1", referredStudentId: "beg-1" }),
      );
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toMatch(/supabase exploded/);
    } finally {
      repo.getReferralsByReferrer = original;
    }
  });

  it("blocks self-referral at the admin form level", async () => {
    const action = await importAddReferral();
    const res = await action(
      fd({ referrerStudentId: "ref-1", referredStudentId: "ref-1" }),
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/cannot refer themselves/i);
  });
});
