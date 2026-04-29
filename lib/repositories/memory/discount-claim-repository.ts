import * as store from "@/lib/services/discount-claim-store";
import type {
  IDiscountClaimRepository,
  ClaimAttemptResult,
} from "../interfaces/discount-claim-repository";

export const memoryDiscountClaimRepo: IDiscountClaimRepository = {
  async findActive(studentId, claimType) {
    return store.findActive(studentId, claimType);
  },
  async tryCreate(input): Promise<ClaimAttemptResult> {
    return store.tryCreate(input);
  },
  async release(id, reason) {
    return store.release(id, reason);
  },
  async setRelated(id, patch) {
    return store.setRelated(id, patch);
  },
  async getById(id) {
    return store.getById(id);
  },
};
