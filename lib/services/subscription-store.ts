/**
 * Mutable in-memory subscription store, seeded from mock data.
 * In production, replace with Supabase-backed service.
 */

import { SUBSCRIPTIONS, type MockSubscription } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import type { SubscriptionStatus } from "@/types/domain";

let subs: MockSubscription[] | null = null;

function init(): MockSubscription[] {
  if (!subs) {
    subs = SUBSCRIPTIONS.map((s) => ({ ...s }));
  }
  return subs;
}

export function getSubscriptions(): MockSubscription[] {
  return init();
}

export function createSubscription(data: {
  studentId: string;
  productName: string;
  status: SubscriptionStatus;
  totalCredits: number | null;
  remainingCredits: number | null;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
}): MockSubscription {
  const list = init();
  const sub: MockSubscription = {
    id: generateId("sub"),
    studentId: data.studentId,
    productId: generateId("p"),
    productName: data.productName,
    productType: "membership",
    status: data.status,
    totalCredits: data.totalCredits,
    remainingCredits: data.remainingCredits,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    selectedStyleId: null,
    selectedStyleName: null,
    selectedStyleIds: null,
    selectedStyleNames: null,
    notes: data.notes,
  };
  list.push(sub);
  return sub;
}

export function updateSubscription(
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
): MockSubscription | null {
  const list = init();
  const sub = list.find((s) => s.id === id);
  if (!sub) return null;

  if (patch.productName !== undefined) sub.productName = patch.productName;
  if (patch.status !== undefined) sub.status = patch.status;
  if (patch.totalCredits !== undefined) sub.totalCredits = patch.totalCredits;
  if (patch.remainingCredits !== undefined) sub.remainingCredits = patch.remainingCredits;
  if (patch.validFrom !== undefined) sub.validFrom = patch.validFrom;
  if (patch.validUntil !== undefined) sub.validUntil = patch.validUntil;
  if (patch.notes !== undefined) sub.notes = patch.notes;

  return { ...sub };
}
