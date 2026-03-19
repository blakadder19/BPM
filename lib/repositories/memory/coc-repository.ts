import * as store from "@/lib/services/coc-store";
import type { ICocRepository } from "../interfaces/coc-repository";

export const memoryCocRepo: ICocRepository = {
  getAcceptance: async (studentId) => store.getCocAcceptance(studentId) ?? null,
  hasAcceptedVersion: async (studentId, version) =>
    store.hasAcceptedCurrentVersion(studentId, version),
  accept: async (studentId, version) => store.acceptCoc(studentId, version),
  revoke: async (studentId) => store.revokeAcceptance(studentId),
};
