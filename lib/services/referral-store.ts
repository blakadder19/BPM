/**
 * In-memory store for the referral programme (Phase 3 MVP).
 *
 * Mirrors `lib/services/discount-engine-store.ts`:
 *   - In memory mode (default for dev/tests) we seed from STUDENT_REFERRALS /
 *     REFERRAL_REWARDS (currently empty arrays) and lazily allocate a
 *     referral code per student on first read.
 *   - In supabase mode we return empty arrays and let the supabase repo
 *     be the source of truth.
 *
 * The store is intentionally NOT coupled to affiliations or discount rules.
 * Rewards here are tracked records that admins manually translate into a
 * discount on the referrer's next membership — no auto-apply.
 */
import {
  STUDENT_REFERRALS,
  REFERRAL_REWARDS,
  type MockStudentReferral,
  type MockReferralReward,
  type ReferralStatus,
  type ReferralRewardStatus,
  type ReferralDiscountKind,
} from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import { isSupabaseMode } from "@/lib/config/data-provider";

const g = globalThis as unknown as {
  __bpm_referral_codes?: Map<string, string>;
  __bpm_student_referrals?: MockStudentReferral[];
  __bpm_referral_rewards?: MockReferralReward[];
};

function initCodes(): Map<string, string> {
  if (!g.__bpm_referral_codes) g.__bpm_referral_codes = new Map();
  return g.__bpm_referral_codes;
}

function initReferrals(): MockStudentReferral[] {
  if (!g.__bpm_student_referrals) {
    g.__bpm_student_referrals = isSupabaseMode()
      ? []
      : STUDENT_REFERRALS.map((r) => ({ ...r }));
  }
  return g.__bpm_student_referrals;
}

function initRewards(): MockReferralReward[] {
  if (!g.__bpm_referral_rewards) {
    g.__bpm_referral_rewards = isSupabaseMode()
      ? []
      : REFERRAL_REWARDS.map((r) => ({ ...r }));
  }
  return g.__bpm_referral_rewards;
}

// ── Code allocation ────────────────────────────────────────

/**
 * Generate a human-friendly, case-insensitive-unique referral code.
 * Format: BPM-XXXX (4 base32-ish chars, ambiguous chars excluded).
 * Collisions are vanishingly rare with 4 chars from 32 symbols, but we
 * retry up to 5 times defensively against the in-memory set.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

function randomCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `BPM-${out}`;
}

export function getReferralCodeForStudent(studentId: string): string {
  const map = initCodes();
  const existing = map.get(studentId);
  if (existing) return existing;
  const usedLower = new Set(Array.from(map.values()).map((c) => c.toLowerCase()));
  let candidate = randomCode();
  for (let i = 0; i < 5 && usedLower.has(candidate.toLowerCase()); i++) {
    candidate = randomCode();
  }
  map.set(studentId, candidate);
  return candidate;
}

export function getAllReferralCodes(): Array<{ studentId: string; code: string }> {
  return Array.from(initCodes().entries()).map(([studentId, code]) => ({
    studentId,
    code,
  }));
}

/** Reverse lookup for "find the referrer whose code matches X". */
export function findStudentIdByReferralCode(code: string): string | null {
  const needle = code.trim().toLowerCase();
  if (!needle) return null;
  for (const [studentId, c] of initCodes().entries()) {
    if (c.toLowerCase() === needle) return studentId;
  }
  return null;
}

/**
 * Used by hydration to import existing codes from Supabase without
 * re-allocating new ones.
 */
export function hydrateReferralCodes(
  rows: Array<{ studentId: string; code: string }>,
): void {
  const map = initCodes();
  map.clear();
  for (const r of rows) map.set(r.studentId, r.code);
}

// ── student_referrals CRUD ─────────────────────────────────

export function getReferrals(): MockStudentReferral[] {
  return initReferrals();
}

export function getReferralsByReferrer(referrerId: string): MockStudentReferral[] {
  return initReferrals().filter((r) => r.referrerStudentId === referrerId);
}

export function getReferral(id: string): MockStudentReferral | undefined {
  return initReferrals().find((r) => r.id === id);
}

export interface CreateReferralInput {
  referrerStudentId: string;
  referredStudentId?: string | null;
  referredEmail?: string | null;
  referralCode?: string | null;
  status?: ReferralStatus;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  note?: string | null;
  id?: string;
}

export function createReferral(data: CreateReferralInput): MockStudentReferral {
  const list = initReferrals();
  const now = new Date().toISOString();
  const row: MockStudentReferral = {
    id: data.id ?? generateId("ref"),
    referrerStudentId: data.referrerStudentId,
    referredStudentId: data.referredStudentId ?? null,
    referredEmail: data.referredEmail?.trim().toLowerCase() ?? null,
    referralCode: data.referralCode ?? null,
    status: data.status ?? "pending",
    verifiedAt: data.verifiedAt ?? null,
    verifiedBy: data.verifiedBy ?? null,
    note: data.note ?? null,
    createdAt: now,
    updatedAt: now,
  };
  list.push(row);
  return row;
}

export function updateReferral(
  id: string,
  patch: Partial<Omit<MockStudentReferral, "id" | "createdAt" | "updatedAt">>,
): MockStudentReferral | null {
  const row = getReferral(id);
  if (!row) return null;
  if (patch.referrerStudentId !== undefined)
    row.referrerStudentId = patch.referrerStudentId;
  if (patch.referredStudentId !== undefined)
    row.referredStudentId = patch.referredStudentId;
  if (patch.referredEmail !== undefined)
    row.referredEmail = patch.referredEmail?.toLowerCase() ?? null;
  if (patch.referralCode !== undefined) row.referralCode = patch.referralCode;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.verifiedAt !== undefined) row.verifiedAt = patch.verifiedAt;
  if (patch.verifiedBy !== undefined) row.verifiedBy = patch.verifiedBy;
  if (patch.note !== undefined) row.note = patch.note;
  row.updatedAt = new Date().toISOString();
  return { ...row };
}

export function deleteReferral(id: string): boolean {
  const list = initReferrals();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

// ── referral_rewards CRUD ──────────────────────────────────

export function getRewards(): MockReferralReward[] {
  return initRewards();
}

export function getRewardsByReferrer(referrerId: string): MockReferralReward[] {
  return initRewards().filter((r) => r.referrerStudentId === referrerId);
}

export function getReward(id: string): MockReferralReward | undefined {
  return initRewards().find((r) => r.id === id);
}

export interface CreateRewardInput {
  referrerStudentId: string;
  termId?: string | null;
  verifiedReferralCount: number;
  discountKind: ReferralDiscountKind;
  discountValue: number;
  status?: ReferralRewardStatus;
  note?: string | null;
  id?: string;
}

export function createReward(data: CreateRewardInput): MockReferralReward {
  const list = initRewards();
  const now = new Date().toISOString();
  const row: MockReferralReward = {
    id: data.id ?? generateId("rrwd"),
    referrerStudentId: data.referrerStudentId,
    termId: data.termId ?? null,
    verifiedReferralCount: data.verifiedReferralCount,
    rewardType: "membership_discount",
    discountKind: data.discountKind,
    discountValue: data.discountValue,
    status: data.status ?? "pending",
    approvedBy: null,
    approvedAt: null,
    appliedSubscriptionId: null,
    appliedAt: null,
    cancelledAt: null,
    cancelledReason: null,
    note: data.note ?? null,
    createdAt: now,
    updatedAt: now,
  };
  list.push(row);
  return row;
}

export function updateReward(
  id: string,
  patch: Partial<Omit<MockReferralReward, "id" | "createdAt" | "updatedAt">>,
): MockReferralReward | null {
  const row = getReward(id);
  if (!row) return null;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  return { ...row };
}

export function deleteReward(id: string): boolean {
  const list = initRewards();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}
