import "server-only";

/**
 * Trusted term-lifecycle engine.
 *
 * Not a Server Action module: nothing here is callable from the browser.
 * Entry points that are allowed to invoke it:
 *   - `runTermLifecycleAction` (lib/actions/term-lifecycle.ts) after
 *     `requireSuperAdminForAction`
 *   - GET/POST /api/lifecycle after the CRON_SECRET check
 *   - `lazyExpireSubscriptions` from server-rendered pages
 */

import { revalidatePath } from "next/cache";
import { getSubscriptionRepo, getTermRepo, getStudentRepo } from "@/lib/repositories";
import {
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-service";
import { getTodayStr } from "@/lib/domain/datetime";
import {
  computeTermLifecycle,
  isSubscriptionExpired,
  type RenewalInstruction,
} from "@/lib/domain/term-lifecycle";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { renewalPreparedEvent, renewalDueSoonEvent, renewalReminderEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import type { CommEvent } from "@/lib/communications/events";
import {
  findRenewalReminderCandidates,
  formatRenewalAmount,
  resolveReminderDaysBefore,
} from "@/lib/domain/renewal-reminders";

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

export type LifecycleRunOutcome =
  | { success: true; result: LifecycleResult }
  | { success: false; error: string };

export const LIFECYCLE_ALREADY_RUNNING = "Lifecycle is already running. Try again shortly.";

export function getLastLifecycleRun(): string | null {
  return g.__bpm_lifecycle_last_run ?? null;
}

/**
 * Full lifecycle run: expires overdue subscriptions, prepares renewals for
 * auto-renew memberships and queues renewal reminders. Performs no
 * authorization — callers must have authorized the request first.
 */
export async function runTermLifecycle(): Promise<LifecycleRunOutcome> {
  if (!acquireLock()) {
    return { success: false, error: LIFECYCLE_ALREADY_RUNNING };
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

    // ── renewal_reminder: heads-up BEFORE the current active sub auto-renews
    //
    // Distinct from `renewal_due_soon`, which fires once the new pending
    // row exists. This loop fires earlier — against the CURRENT active
    // subscription's `validUntil` — so the student knows the renewal
    // is coming up. Idempotency is handled by the comm-event key
    // (`renewal_reminder:<subId>:<renewalDate>:<daysBefore>`).
    const reminderCadence = resolveReminderDaysBefore();
    const reminderCandidates = findRenewalReminderCandidates({
      subscriptions: freshSubs,
      today,
      daysBeforeCadence: reminderCadence,
    });
    if (reminderCandidates.length > 0) {
      // Pre-load students in one batch to avoid N+1 reads against the
      // student repo when many subscriptions land on the same cadence day.
      const studentIds = Array.from(new Set(reminderCandidates.map((c) => c.subscription.studentId)));
      const students = await Promise.all(studentIds.map((id) => getStudentRepo().getById(id)));
      const studentById = new Map(students.filter((s): s is NonNullable<typeof s> => !!s).map((s) => [s.id, s]));
      let reminderCount = 0;
      for (const c of reminderCandidates) {
        const student = studentById.get(c.subscription.studentId);
        // Skip silently when we can't resolve the student or they have no email —
        // the dispatch layer would skip anyway, but bailing early keeps the
        // audit logs (`reminderCount`) honest.
        if (!student) continue;
        if (!student.email || !student.email.includes("@")) continue;
        commEvents.push(
          renewalReminderEvent({
            studentId: c.subscription.studentId,
            studentName: student.fullName,
            productName: c.subscription.productName,
            subscriptionId: c.subscription.id,
            renewalDate: c.renewalDate,
            daysUntilRenewal: c.daysUntilRenewal,
            autoRenewConfirmed: c.autoRenewConfirmed,
            amountLabel: formatRenewalAmount(c.subscription),
            daysBefore: c.daysBefore,
          }),
        );
        reminderCount += 1;
      }
      if (reminderCount > 0) {
        result.details.push(
          `Queued ${reminderCount} renewal reminder${reminderCount === 1 ? "" : "s"} (cadence=${reminderCadence.join(",")})`,
        );
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
      // Phase 1: auto-renewal inherits the parent's frozen rule state.
      productSnapshot: source.productSnapshot ?? null,
      // Phase 4: auto-renewal also inherits the parent's pricing snapshot.
      originalPriceCents: source.originalPriceCents ?? source.priceCentsAtPurchase,
      discountAmountCents: source.discountAmountCents,
      appliedDiscount: source.appliedDiscount ?? null,
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
