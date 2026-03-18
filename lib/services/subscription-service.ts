import {
  getSubscriptions as mockGetAll,
  getSubscription as mockGetOne,
  createSubscription as mockCreate,
  updateSubscription as mockUpdate,
} from "@/lib/services/subscription-store";
import type { MockSubscription } from "@/lib/mock-data";
import type { PaymentMethod, ProductType, SubscriptionStatus } from "@/types/domain";

const isDev = process.env.NODE_ENV === "development";

export async function getSubscriptions(): Promise<MockSubscription[]> {
  if (isDev) return mockGetAll();
  return [];
}

export function getSubscriptionSync(id: string): MockSubscription | undefined {
  return mockGetOne(id);
}

export async function createSubscription(data: {
  studentId: string;
  productId: string;
  productName: string;
  productType: ProductType;
  status: SubscriptionStatus;
  totalCredits: number | null;
  remainingCredits: number | null;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
  termId: string | null;
  paymentMethod: PaymentMethod;
  autoRenew: boolean;
  classesUsed: number;
  classesPerTerm: number | null;
  selectedStyleId?: string | null;
  selectedStyleName?: string | null;
  selectedStyleIds?: string[] | null;
  selectedStyleNames?: string[] | null;
}): Promise<{ success: boolean; error?: string }> {
  if (isDev) {
    mockCreate(data);
    return { success: true };
  }
  return { success: false, error: "Production subscription creation not yet implemented" };
}

export async function updateSubscription(
  id: string,
  patch: {
    productName?: string;
    status?: SubscriptionStatus;
    totalCredits?: number | null;
    remainingCredits?: number | null;
    validFrom?: string;
    validUntil?: string | null;
    notes?: string | null;
    termId?: string | null;
    paymentMethod?: PaymentMethod;
    autoRenew?: boolean;
    classesUsed?: number;
    classesPerTerm?: number | null;
  }
): Promise<{ success: boolean; error?: string }> {
  if (isDev) {
    const result = mockUpdate(id, patch);
    return result
      ? { success: true }
      : { success: false, error: "Subscription not found" };
  }
  return { success: false, error: "Production subscription update not yet implemented" };
}
