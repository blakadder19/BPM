import {
  getSubscriptions as mockGetAll,
  createSubscription as mockCreate,
  updateSubscription as mockUpdate,
} from "@/lib/services/subscription-store";
import type { MockSubscription } from "@/lib/mock-data";
import type { SubscriptionStatus } from "@/types/domain";

const isDev = process.env.NODE_ENV === "development";

export async function getSubscriptions(): Promise<MockSubscription[]> {
  if (isDev) return mockGetAll();

  // PROVISIONAL: production reads from student_subscriptions JOIN subscription_products
  return [];
}

export async function createSubscription(data: {
  studentId: string;
  productName: string;
  status: SubscriptionStatus;
  totalCredits: number | null;
  remainingCredits: number | null;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
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
