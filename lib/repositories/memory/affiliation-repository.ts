import * as store from "@/lib/services/discount-engine-store";
import type {
  IAffiliationRepository,
  CreateAffiliationData,
  AffiliationPatch,
} from "../interfaces/affiliation-repository";

export const memoryAffiliationRepo: IAffiliationRepository = {
  getAll: async () => store.getAffiliations(),
  getByStudent: async (studentId) => store.getAffiliationsByStudent(studentId),
  getById: async (id) => store.getAffiliation(id) ?? null,
  create: async (data: CreateAffiliationData) =>
    store.createAffiliation({
      studentId: data.studentId,
      affiliationType: data.affiliationType,
      verificationStatus: data.verificationStatus ?? "pending",
      verifiedAt: data.verifiedAt ?? null,
      verifiedBy: data.verifiedBy ?? null,
      metadata: data.metadata ?? {},
      validFrom: data.validFrom ?? null,
      validUntil: data.validUntil ?? null,
      notes: data.notes ?? null,
    }),
  update: async (id, patch: AffiliationPatch) => store.updateAffiliation(id, patch),
  delete: async (id) => store.deleteAffiliation(id),
};
