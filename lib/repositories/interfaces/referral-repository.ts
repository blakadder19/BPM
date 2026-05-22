/**
 * Repository interface for the referral programme (Phase 3 MVP).
 *
 * Two entities live here:
 *   - Referral codes (one stable code per student; lazily allocated)
 *   - student_referrals (referrer → referred, with verification status)
 *   - referral_rewards (referrer-bound, admin-approved & admin-applied)
 *
 * Reward redemption is intentionally NOT automatic — the repository
 * stores `appliedSubscriptionId` and `appliedAt` when an admin marks
 * the reward as applied at reception.
 */
import type {
  MockStudentReferral,
  MockReferralReward,
  ReferralStatus,
  ReferralRewardStatus,
  ReferralDiscountKind,
} from "@/lib/mock-data";

export interface CreateReferralData {
  referrerStudentId: string;
  referredStudentId?: string | null;
  referredEmail?: string | null;
  referralCode?: string | null;
  status?: ReferralStatus;
  note?: string | null;
}

export interface ReferralPatch {
  status?: ReferralStatus;
  referredStudentId?: string | null;
  referredEmail?: string | null;
  note?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export interface CreateRewardData {
  referrerStudentId: string;
  termId?: string | null;
  verifiedReferralCount: number;
  discountKind: ReferralDiscountKind;
  discountValue: number;
  status?: ReferralRewardStatus;
  note?: string | null;
}

export interface RewardPatch {
  status?: ReferralRewardStatus;
  termId?: string | null;
  discountKind?: ReferralDiscountKind;
  discountValue?: number;
  note?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  appliedSubscriptionId?: string | null;
  appliedAt?: string | null;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
}

export interface IReferralRepository {
  // ── codes ──────────────────────────────────────────────
  getCodeForStudent(studentId: string): Promise<string>;
  getAllCodes(): Promise<Array<{ studentId: string; code: string }>>;
  findStudentByCode(code: string): Promise<string | null>;

  // ── referrals ─────────────────────────────────────────
  getAllReferrals(): Promise<MockStudentReferral[]>;
  getReferralsByReferrer(referrerId: string): Promise<MockStudentReferral[]>;
  getReferralById(id: string): Promise<MockStudentReferral | null>;
  createReferral(data: CreateReferralData): Promise<MockStudentReferral>;
  updateReferral(id: string, patch: ReferralPatch): Promise<MockStudentReferral | null>;
  deleteReferral(id: string): Promise<boolean>;

  // ── rewards ───────────────────────────────────────────
  getAllRewards(): Promise<MockReferralReward[]>;
  getRewardsByReferrer(referrerId: string): Promise<MockReferralReward[]>;
  getRewardById(id: string): Promise<MockReferralReward | null>;
  createReward(data: CreateRewardData): Promise<MockReferralReward>;
  updateReward(id: string, patch: RewardPatch): Promise<MockReferralReward | null>;
  deleteReward(id: string): Promise<boolean>;
}
