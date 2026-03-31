"use server";

import { revalidatePath } from "next/cache";
import { requireRole, getAuthUser } from "@/lib/auth";
import { getSubscriptionRepo, getTermRepo } from "@/lib/repositories";
import {
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-service";
import { getTodayStr } from "@/lib/domain/datetime";
import {
  computeTermLifecycle,
  isSubscriptionExpired,
  isRenewalEligible,
  findNextTerm,
  type RenewalInstruction,
} from "@/lib/domain/term-lifecycle";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";

export interface LifecycleResult {
  expired: number;
  renewalsPrepared: number;
  details: string[];
}

/**
 * Admin-callable: run full lifecycle check on all subscriptions.
 * Expires overdue subscriptions and prepares renewals for auto-renew memberships.
 */
export async function runTermLifecycleAction(): Promise<{
  success: boolean;
  error?: string;
  result?: LifecycleResult;
}> {
  await requireRole(["admin"]);
  await ensureOperationalDataHydrated();

  const [allSubs, allTerms] = await Promise.all([
    getSubscriptionRepo().getAll(),
    getTermRepo().getAll(),
  ]);

  const today = getTodayStr();
  const instructions = computeTermLifecycle(allSubs, allTerms, today);

  const result: LifecycleResult = {
    expired: 0,
    renewalsPrepared: 0,
    details: [],
  };

  for (const inst of instructions) {
    if (inst.type === "expire") {
      const res = await updateSubscription(inst.subscriptionId, {
        status: "expired",
      });
      if (res.success) {
        result.expired += 1;
        result.details.push(`Expired subscription ${inst.subscriptionId} (${inst.reason})`);
      }
    } else if (inst.type === "prepare_renewal") {
      const prepared = await prepareRenewal(inst);
      if (prepared) {
        result.renewalsPrepared += 1;
        result.details.push(
          `Prepared renewal for ${inst.source.productName} → ${inst.nextTerm.name}`
        );
      }
    }
  }

  if (result.expired > 0 || result.renewalsPrepared > 0) {
    revalidatePath("/students");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
  }

  return { success: true, result };
}

/**
 * Lightweight lazy expiry check — runs on page load for any role.
 * Only expires overdue subscriptions; does NOT prepare renewals.
 * Returns the number of subscriptions expired (for logging/debugging).
 */
export async function lazyExpireSubscriptions(): Promise<number> {
  const user = await getAuthUser();
  if (!user) return 0;

  await ensureOperationalDataHydrated();

  const allSubs = await getSubscriptionRepo().getAll();
  const today = getTodayStr();

  let count = 0;
  for (const sub of allSubs) {
    if (isSubscriptionExpired(sub, today)) {
      const res = await updateSubscription(sub.id, { status: "expired" });
      if (res.success) count += 1;
    }
  }

  return count;
}

/**
 * Admin manually triggers renewal for a specific subscription.
 * Creates a new active subscription for the next consecutive term.
 */
export async function renewSubscriptionAction(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  await ensureOperationalDataHydrated();

  const [allSubs, allTerms] = await Promise.all([
    getSubscriptionRepo().getAll(),
    getTermRepo().getAll(),
  ]);

  const source = allSubs.find((s) => s.id === subscriptionId);
  if (!source) return { success: false, error: "Subscription not found" };

  if (!isRenewalEligible(source, allSubs, allTerms)) {
    return { success: false, error: "Subscription is not eligible for renewal" };
  }

  const sortedTerms = [...allTerms].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const nextTerm = findNextTerm(sortedTerms, source.termId!);
  if (!nextTerm) return { success: false, error: "No next term available" };

  try {
    const result = await createSubscription({
      studentId: source.studentId,
      productId: source.productId,
      productName: source.productName,
      productType: source.productType,
      status: "active",
      totalCredits: source.totalCredits,
      remainingCredits: source.totalCredits,
      validFrom: nextTerm.startDate,
      validUntil: nextTerm.endDate,
      notes: `Renewed from ${source.id}`,
      termId: nextTerm.id,
      paymentMethod: source.paymentMethod,
      paymentStatus: "pending",
      assignedBy: "admin",
      assignedAt: new Date().toISOString(),
      autoRenew: source.autoRenew,
      classesUsed: 0,
      classesPerTerm: source.classesPerTerm,
      selectedStyleId: source.selectedStyleId,
      selectedStyleName: source.selectedStyleName,
      selectedStyleIds: source.selectedStyleIds,
      selectedStyleNames: source.selectedStyleNames,
      renewedFromId: source.id,
    });

    if (result.success) {
      revalidatePath("/students");
      revalidatePath("/dashboard");
      revalidatePath("/catalog");
    }
    return result;
  } catch {
    return { success: false, error: "Failed to create renewal" };
  }
}

/**
 * Admin cancels a pending renewal that hasn't been paid yet.
 */
export async function cancelRenewalAction(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  await ensureOperationalDataHydrated();

  const allSubs = await getSubscriptionRepo().getAll();
  const sub = allSubs.find((s) => s.id === subscriptionId);
  if (!sub) return { success: false, error: "Subscription not found" };
  if (!sub.renewedFromId) return { success: false, error: "Not a renewal subscription" };
  if (sub.status !== "active") return { success: false, error: "Renewal is not active" };

  const result = await updateSubscription(subscriptionId, { status: "cancelled" });
  if (result.success) {
    revalidatePath("/students");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
  }
  return result;
}

async function prepareRenewal(inst: RenewalInstruction): Promise<boolean> {
  const { source, nextTerm } = inst;

  try {
    const result = await createSubscription({
      studentId: source.studentId,
      productId: source.productId,
      productName: source.productName,
      productType: source.productType,
      status: "active",
      totalCredits: source.totalCredits,
      remainingCredits: source.totalCredits,
      validFrom: nextTerm.startDate,
      validUntil: nextTerm.endDate,
      notes: `Auto-renewal from ${source.id}`,
      termId: nextTerm.id,
      paymentMethod: source.paymentMethod,
      paymentStatus: "pending",
      assignedBy: "system",
      assignedAt: new Date().toISOString(),
      autoRenew: source.autoRenew,
      classesUsed: 0,
      classesPerTerm: source.classesPerTerm,
      selectedStyleId: source.selectedStyleId,
      selectedStyleName: source.selectedStyleName,
      selectedStyleIds: source.selectedStyleIds,
      selectedStyleNames: source.selectedStyleNames,
      renewedFromId: source.id,
    });
    return result.success;
  } catch {
    return false;
  }
}
