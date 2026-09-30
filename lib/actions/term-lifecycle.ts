"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin, requireSuperAdminForAction } from "@/lib/staff-permissions";
import { getSubscriptionRepo, getTermRepo, getStudentRepo } from "@/lib/repositories";
import {
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-service";
import {
  isRenewalEligible,
  findNextTerm,
} from "@/lib/domain/term-lifecycle";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { renewalPreparedEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import {
  getLastLifecycleRun,
  runTermLifecycle,
  type LifecycleResult,
} from "@/lib/services/term-lifecycle-service";

export interface LifecycleRunInfo {
  lastRun: string | null;
}

/** Returns when the last full lifecycle run happened (if tracked). Super Admin only. */
export async function getLifecycleRunInfo(): Promise<LifecycleRunInfo> {
  const guard = await requireSuperAdminForAction();
  if (!guard.ok) return { lastRun: null };
  return { lastRun: getLastLifecycleRun() };
}

/**
 * Manual "Term Lifecycle" button. Always requires Super Admin: the action
 * takes no arguments, so a browser caller cannot claim cron authority.
 * Scheduled runs go through /api/lifecycle, which calls the service directly.
 */
export async function runTermLifecycleAction(): Promise<{
  success: boolean;
  error?: string;
  result?: LifecycleResult;
}> {
  const guard = await requireSuperAdminForAction();
  if (!guard.ok) return { success: false, error: guard.error };
  return runTermLifecycle();
}

/**
 * Admin manually triggers renewal for a specific subscription.
 * Creates a new active subscription for the next consecutive term.
 */
export async function renewSubscriptionAction(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  const adminAccess = await requireSuperAdmin();
  const adminUser = adminAccess.user;
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
      assignedBy: adminUser.fullName ?? adminUser.email ?? adminUser.id,
      assignedAt: new Date().toISOString(),
      autoRenew: source.autoRenew,
      classesUsed: 0,
      classesPerTerm: source.classesPerTerm,
      selectedStyleId: source.selectedStyleId,
      selectedStyleName: source.selectedStyleName,
      selectedStyleIds: source.selectedStyleIds,
      selectedStyleNames: source.selectedStyleNames,
      renewedFromId: source.id,
      priceCentsAtPurchase: source.priceCentsAtPurchase,
      currencyAtPurchase: source.currencyAtPurchase,
      // Phase 1: a renewal inherits the parent subscription's frozen rule
      // state so the renewed term keeps the access the customer originally
      // bought, even if the live product was edited in between.
      productSnapshot: source.productSnapshot ?? null,
      // Phase 4: renewals deliberately do NOT re-evaluate the discount engine.
      // They inherit the parent's frozen pricing snapshot so a one-off
      // first-time/affiliation discount cannot be silently re-applied each
      // term, and so an admin disabling/changing a rule does not retroactively
      // change a renewing customer's price.
      originalPriceCents: source.originalPriceCents ?? source.priceCentsAtPurchase,
      discountAmountCents: source.discountAmountCents,
      appliedDiscount: source.appliedDiscount ?? null,
    });

    if (result.success && result.subscriptionId) {
      const student = await getStudentRepo().getById(source.studentId);
      if (student) {
        await dispatchCommEvents([
          renewalPreparedEvent({
            studentId: source.studentId,
            studentName: student.fullName,
            productName: source.productName,
            subscriptionId: result.subscriptionId,
            termName: nextTerm.name,
            validFrom: nextTerm.startDate,
            validUntil: nextTerm.endDate,
          }),
        ]);
      }
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
  await requireSuperAdmin();
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
