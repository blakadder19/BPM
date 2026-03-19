/**
 * Mutable in-memory subscription store, seeded from mock data.
 * Uses globalThis to survive HMR module re-evaluation in Next.js dev.
 * In production, replace with Supabase-backed service.
 */

import { SUBSCRIPTIONS, type MockSubscription } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import type { PaymentMethod, SalePaymentStatus, ProductType, SubscriptionStatus } from "@/types/domain";

const g = globalThis as unknown as {
  __bpm_subs?: MockSubscription[];
};

function init(): MockSubscription[] {
  if (!g.__bpm_subs) {
    g.__bpm_subs = SUBSCRIPTIONS.map((s) => ({ ...s }));
  }
  return g.__bpm_subs;
}

export function getSubscriptions(): MockSubscription[] {
  return init();
}

export function getSubscription(id: string): MockSubscription | undefined {
  return init().find((s) => s.id === id);
}

export function createSubscription(data: {
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
}): MockSubscription {
  const list = init();
  const sub: MockSubscription = {
    id: generateId("sub"),
    studentId: data.studentId,
    productId: data.productId,
    productName: data.productName,
    productType: data.productType,
    status: data.status,
    totalCredits: data.totalCredits,
    remainingCredits: data.remainingCredits,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    selectedStyleId: data.selectedStyleId ?? null,
    selectedStyleName: data.selectedStyleName ?? null,
    selectedStyleIds: data.selectedStyleIds ?? null,
    selectedStyleNames: data.selectedStyleNames ?? null,
    notes: data.notes,
    termId: data.termId,
    paymentMethod: data.paymentMethod,
    paymentStatus: data.paymentStatus ?? "paid",
    assignedBy: data.assignedBy ?? null,
    assignedAt: data.assignedAt ?? new Date().toISOString(),
    autoRenew: data.autoRenew,
    classesUsed: data.classesUsed,
    classesPerTerm: data.classesPerTerm,
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
    termId?: string | null;
    paymentMethod?: PaymentMethod;
    paymentStatus?: SalePaymentStatus;
    autoRenew?: boolean;
    classesUsed?: number;
    classesPerTerm?: number | null;
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
  if (patch.termId !== undefined) sub.termId = patch.termId;
  if (patch.paymentMethod !== undefined) sub.paymentMethod = patch.paymentMethod;
  if (patch.paymentStatus !== undefined) sub.paymentStatus = patch.paymentStatus;
  if (patch.autoRenew !== undefined) sub.autoRenew = patch.autoRenew;
  if (patch.classesUsed !== undefined) sub.classesUsed = patch.classesUsed;
  if (patch.classesPerTerm !== undefined) sub.classesPerTerm = patch.classesPerTerm;

  return { ...sub };
}
