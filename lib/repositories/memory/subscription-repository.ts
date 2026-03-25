import * as store from "@/lib/services/subscription-store";
import type { ISubscriptionRepository, CreateSubscriptionData, SubscriptionPatch } from "../interfaces/subscription-repository";

export const memorySubscriptionRepo: ISubscriptionRepository = {
  getAll: async () => store.getSubscriptions(),
  getByStudent: async (studentId) =>
    store.getSubscriptions().filter((s) => s.studentId === studentId),
  getById: async (id) => store.getSubscription(id) ?? null,
  create: async (data: CreateSubscriptionData) => store.createSubscription(data),
  update: async (id, patch: SubscriptionPatch) => store.updateSubscription(id, patch),
  delete: async (id) => store.deleteSubscription(id),
};
