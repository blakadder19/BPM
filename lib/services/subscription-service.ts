/**
 * Subscription service — delegates to the repository selected by DATA_PROVIDER.
 */

import { getSubscriptionRepo } from "@/lib/repositories";
import { getSubscription as mockGetOne } from "@/lib/services/subscription-store";
import type { MockSubscription } from "@/lib/mock-data";
import type { PaymentMethod, SalePaymentStatus, ProductType, SubscriptionStatus } from "@/types/domain";

export async function getSubscriptions(): Promise<MockSubscription[]> {
  return getSubscriptionRepo().getAll();
}

export async function getSubscriptionsByStudent(studentId: string): Promise<MockSubscription[]> {
  return getSubscriptionRepo().getByStudent(studentId);
}

/**
 * Synchronous access — only works reliably in memory mode.
 * Used by domain logic that currently needs sync access (credit-store, booking rules).
 * PROVISIONAL: will be refactored to async when those callers are updated.
 */
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
  paymentStatus?: SalePaymentStatus;
  assignedBy?: string | null;
  assignedAt?: string;
  autoRenew: boolean;
  classesUsed: number;
  classesPerTerm: number | null;
  selectedStyleId?: string | null;
  selectedStyleName?: string | null;
  selectedStyleIds?: string[] | null;
  selectedStyleNames?: string[] | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await getSubscriptionRepo().create(data);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
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
    paymentStatus?: SalePaymentStatus;
    autoRenew?: boolean;
    classesUsed?: number;
    classesPerTerm?: number | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const result = await getSubscriptionRepo().update(id, patch);
  return result
    ? { success: true }
    : { success: false, error: "Subscription not found" };
}
