/**
 * Repository interface for discount rules (Phase 4).
 */
import type { MockDiscountRule } from "@/lib/mock-data";
import type {
  AffiliationType,
  DiscountKind,
  DiscountRuleType,
} from "@/lib/domain/pricing-engine";
import type { ProductType } from "@/types/domain";

export interface CreateDiscountRuleData {
  code: string;
  name: string;
  description?: string | null;
  ruleType: DiscountRuleType;
  affiliationType?: AffiliationType | null;
  discountKind: DiscountKind;
  discountValue: number;
  appliesToProductTypes?: ProductType[] | null;
  appliesToProductIds?: string[] | null;
  minPriceCents?: number | null;
  maxDiscountCents?: number | null;
  isActive?: boolean;
  priority?: number;
  stackable?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
}

export type DiscountRulePatch = Partial<CreateDiscountRuleData>;

export interface IDiscountRuleRepository {
  getAll(): Promise<MockDiscountRule[]>;
  getActive(): Promise<MockDiscountRule[]>;
  getById(id: string): Promise<MockDiscountRule | null>;
  create(data: CreateDiscountRuleData): Promise<MockDiscountRule>;
  update(id: string, patch: DiscountRulePatch): Promise<MockDiscountRule | null>;
  delete(id: string): Promise<boolean>;
}
