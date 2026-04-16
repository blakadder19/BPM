"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getSubscriptionRepo, getTermRepo, getStudentRepo } from "@/lib/repositories";
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
import { renewalPreparedEvent, renewalDueSoonEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import type { CommEvent } from "@/lib/communications/events";

// ── Concurrency guard ────────────────────────────────────────
// Prevents overlapping lifecycle runs in the same server process.

const g = globalThis as unknown as {
  __bpm_lifecycle_lock?: boolean;
  __bpm_lifecycle_last_run?: string;
  __bpm_lazy_last_run?: number;
};

const LAZY_COOLDOWN_MS = 60_000;

function acquireLock(): boolean {
  if (g.__bpm_lifecycle_lock) return false;
  g.__bpm_lifecycle_lock = true;
  return true;
}

function releaseLock() {
  g.__bpm_lifecycle_lock = false;
}

export interface LifecycleResult {
  expired: number;
  renewalsPrepared: number;
  details: string[];
}

export type LifecycleTrigger = "manual" | "scheduled" | "lazy";

export interface LifecycleRunInfo {
  lastRun: string | null;
}

/** Returns when the last full lifecycle run happened (if tracked). */
export async function getLifecycleRunInfo(): Promise<LifecycleRunInfo> {
  return { lastRun: g.__bpm_lifecycle_last_run ?? null };
}

/**
 * Admin-callable: run full lifecycle check on all subscriptions.
 * Expires overdue subscriptions and prepares renewals for auto-renew memberships.
 * Guarded against concurrent execution.
 */
export async function runTermLifecycleAction(
  trigger: LifecycleTrigger = "manual"
): Promise<{
  success: boolean;
  error?: string;
  result?: LifecycleResult;
}> {
  if (trigger === "manual") {
    await requireRole(["admin"]);
  }

  if (!acquireLock()) {
    return { success: false, error: "Lifecycle is already running. Try again shortly." };
  }

  try {
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

    const commEvents: CommEvent[] = [];

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
        const freshSubs = await getSubscriptionRepo().getAll();
        const alreadyExists = freshSubs.some(
          (s) => s.renewedFromId === inst.subscriptionId && s.studentId === inst.source.studentId
        );
        if (!alreadyExists) {
          const prepared = await prepareRenewal(inst);
          if (prepared) {
            result.renewalsPrepared += 1;
            result.details.push(
              `Prepared renewal for ${inst.source.productName} → ${inst.nextTerm.name}`
            );
            const student = await getStudentRepo().getById(inst.source.studentId);
            if (student) {
              commEvents.push(
                renewalPreparedEvent({
                  studentId: inst.source.studentId,
                  studentName: student.fullName,
                  productName: inst.source.productName,
                  subscriptionId: inst.subscriptionId,
                  termName: inst.nextTerm.name,
                  validFrom: inst.nextTerm.startDate,
                  validUntil: inst.nextTerm.endDate,
                })
              );
            }
          }
        }
      }
    }

    // renewal_due_soon: find pending-payment renewals whose term starts within 7 days
    const RENEWAL_DUE_SOON_DAYS = 7;
    const freshSubs = await getSubscriptionRepo().getAll();
    for (const sub of freshSubs) {
      if (!sub.renewedFromId) continue;
      if (sub.status !== "active") continue;
      if (sub.paymentStatus !== "pending") continue;
      if (!sub.validFrom) continue;
      const daysUntil = daysUntilDate(today, sub.validFrom);
      if (daysUntil >= 0 && daysUntil <= RENEWAL_DUE_SOON_DAYS) {
        const term = sub.termId ? allTerms.find((t) => t.id === sub.termId) : null;
        const student = await getStudentRepo().getById(sub.studentId);
        if (student && term) {
          commEvents.push(
            renewalDueSoonEvent({
              studentId: sub.studentId,
              studentName: student.fullName,
              productName: sub.productName,
              subscriptionId: sub.id,
              termName: term.name,
              daysUntilStart: daysUntil,
            })
          );
        }
      }
    }

    if (commEvents.length > 0) {
      await dispatchCommEvents(commEvents);
    }

    g.__bpm_lifecycle_last_run = new Date().toISOString();

    if (result.expired > 0 || result.renewalsPrepared > 0) {
      revalidatePath("/students");
      revalidatePath("/dashboard");
      revalidatePath("/catalog");
    }

    return { success: true, result };
  } finally {
    releaseLock();
  }
}

/**
 * Lightweight lazy expiry check — runs on page load for any role.
 * Only expires overdue subscriptions; does NOT prepare renewals.
 * Throttled: skips if it ran within LAZY_COOLDOWN_MS.
 *
 * Callers are expected to have already authenticated and hydrated
 * operational data before calling this. The function skips redundant
 * auth/hydration calls to avoid extra Supabase round-trips.
 */
export async function lazyExpireSubscriptions(): Promise<number> {
  const now = Date.now();
  if (g.__bpm_lazy_last_run && now - g.__bpm_lazy_last_run < LAZY_COOLDOWN_MS) {
    return 0;
  }

  if (!acquireLock()) return 0;

  try {
    g.__bpm_lazy_last_run = now;

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
  } finally {
    releaseLock();
  }
}

/**
 * Admin manually triggers renewal for a specific subscription.
 * Creates a new active subscription for the next consecutive term.
 */
export async function renewSubscriptionAction(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireRole(["admin"]);
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
      assignedBy: adminUser.id,
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
      assignedBy: null,
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
    });
    return result.success;
  } catch {
    return false;
  }
}

function daysUntilDate(from: string, to: string): number {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  return Math.round((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
}
