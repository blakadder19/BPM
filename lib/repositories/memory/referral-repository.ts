import * as store from "@/lib/services/referral-store";
import type {
  IReferralRepository,
  CreateReferralData,
  ReferralPatch,
  CreateRewardData,
  RewardPatch,
} from "../interfaces/referral-repository";

export const memoryReferralRepo: IReferralRepository = {
  async getCodeForStudent(studentId) {
    return store.getReferralCodeForStudent(studentId);
  },
  async getAllCodes() {
    return store.getAllReferralCodes();
  },
  async findStudentByCode(code) {
    return store.findStudentIdByReferralCode(code);
  },

  async getAllReferrals() {
    return store.getReferrals();
  },
  async getReferralsByReferrer(referrerId) {
    return store.getReferralsByReferrer(referrerId);
  },
  async getReferralById(id) {
    return store.getReferral(id) ?? null;
  },
  async createReferral(data: CreateReferralData) {
    return store.createReferral({
      referrerStudentId: data.referrerStudentId,
      referredStudentId: data.referredStudentId ?? null,
      referredEmail: data.referredEmail ?? null,
      referralCode: data.referralCode ?? null,
      status: data.status ?? "pending",
      note: data.note ?? null,
    });
  },
  async updateReferral(id, patch: ReferralPatch) {
    return store.updateReferral(id, patch);
  },
  async deleteReferral(id) {
    return store.deleteReferral(id);
  },

  async getAllRewards() {
    return store.getRewards();
  },
  async getRewardsByReferrer(referrerId) {
    return store.getRewardsByReferrer(referrerId);
  },
  async getRewardById(id) {
    return store.getReward(id) ?? null;
  },
  async createReward(data: CreateRewardData) {
    return store.createReward({
      referrerStudentId: data.referrerStudentId,
      termId: data.termId ?? null,
      verifiedReferralCount: data.verifiedReferralCount,
      discountKind: data.discountKind,
      discountValue: data.discountValue,
      status: data.status ?? "pending",
      note: data.note ?? null,
    });
  },
  async updateReward(id, patch: RewardPatch) {
    return store.updateReward(id, patch);
  },
  async deleteReward(id) {
    return store.deleteReward(id);
  },
};
