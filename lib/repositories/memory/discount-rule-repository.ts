import * as store from "@/lib/services/discount-engine-store";
import type {
  IDiscountRuleRepository,
  CreateDiscountRuleData,
  DiscountRulePatch,
} from "../interfaces/discount-rule-repository";

export const memoryDiscountRuleRepo: IDiscountRuleRepository = {
  getAll: async () => store.getDiscountRules(),
  getActive: async () => store.getActiveDiscountRules(),
  getById: async (id) => store.getDiscountRule(id) ?? null,
  create: async (data: CreateDiscountRuleData) =>
    store.createDiscountRule({
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      ruleType: data.ruleType,
      affiliationType: data.affiliationType ?? null,
      discountKind: data.discountKind,
      discountValue: data.discountValue,
      appliesToProductTypes: data.appliesToProductTypes ?? null,
      appliesToProductIds: data.appliesToProductIds ?? null,
      minPriceCents: data.minPriceCents ?? null,
      maxDiscountCents: data.maxDiscountCents ?? null,
      isActive: data.isActive ?? true,
      priority: data.priority ?? 0,
      stackable: data.stackable ?? false,
      validFrom: data.validFrom ?? null,
      validUntil: data.validUntil ?? null,
    }),
  update: async (id, patch: DiscountRulePatch) => store.updateDiscountRule(id, patch),
  delete: async (id) => store.deleteDiscountRule(id),
};
