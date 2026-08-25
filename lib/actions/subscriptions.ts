"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requirePermission, requirePermissionForAction } from "@/lib/staff-permissions";
import {
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-service";
import { getProductRepo, getTermRepo, getSubscriptionRepo, getStudentRepo } from "@/lib/repositories";
import { buildSnapshotFromProduct } from "@/lib/services/subscription-snapshot-service";
import {
  priceProductForStudent,
  buildAuditDiscountMetadata,
  releaseDiscountClaim,
  attachClaimRelations,
} from "@/lib/services/pricing-service";
import { getNextConsecutiveTerm } from "@/lib/domain/term-rules";
import {
  computeSubscriptionValidity,
  validateSubscriptionExtension,
} from "@/lib/domain/subscription-validity";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getBookingService } from "@/lib/services/booking-store";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import { getTodayStr } from "@/lib/domain/datetime";
import { paymentPendingEvent, paymentConfirmedEvent, subscriptionRefundedEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import type { PaymentMethod, SalePaymentStatus, ProductType, SubscriptionStatus } from "@/types/domain";
import type { MockTerm } from "@/lib/mock-data";

const VALID_STATUSES = new Set<string>([
  "active",
  "paused",
  "expired",
  "exhausted",
  "cancelled",
]);

const VALID_PAYMENT_METHODS = new Set<string>([
  "stripe",
  "cash",
  "card",
  "bank_transfer",
  "revolut",
  "manual",
  "complimentary",
]);

const VALID_PAYMENT_STATUSES = new Set<string>([
  "paid",
  "pending",
  "complimentary",
  "waived",
  "cancelled",
  "refunded",
]);

function parseCredits(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? null : n;
}

export async function createSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string; subscriptionId?: string }> {
  const adminAccess = await requirePermission("students:edit");
  const adminUser = adminAccess.user;
  const studentId = formData.get("studentId") as string;
  const productId = (formData.get("productId") as string)?.trim();
  const termId = (formData.get("termId") as string)?.trim() || null;
  const paymentMethodRaw = (formData.get("paymentMethod") as string)?.trim();
  const paymentStatusRaw = (formData.get("paymentStatus") as string)?.trim() || "paid";
  const autoRenew = formData.get("autoRenew") === "on" || formData.get("autoRenew") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;
  const selectedStyleId = (formData.get("selectedStyleId") as string)?.trim() || null;
  const selectedStyleName = (formData.get("selectedStyleName") as string)?.trim() || null;

  // ── Manual discount (sensitive — permission-gated) ────────
  //
  // The admin form may submit a manual one-off discount in euros plus
  // a free-text reason. This bypasses the rule engine entirely and
  // requires `payments:manual_adjustment`. We re-read permissions
  // here (rather than trust the client) so a forged form post from
  // a user without the permission is rejected server-side.
  const rawManualDiscountEuros = (formData.get("manualDiscountEuros") as string | null)?.trim();
  const rawManualDiscountCents = (formData.get("manualDiscountCents") as string | null)?.trim();
  const manualDiscountReason = (formData.get("manualDiscountReason") as string | null)?.trim() || null;

  let manualDiscountCents = 0;
  if (rawManualDiscountCents && rawManualDiscountCents !== "") {
    const n = Math.round(Number(rawManualDiscountCents));
    if (!Number.isFinite(n) || n < 0) {
      return { success: false, error: "Manual discount must be a non-negative number." };
    }
    manualDiscountCents = n;
  } else if (rawManualDiscountEuros && rawManualDiscountEuros !== "") {
    const euros = Number(rawManualDiscountEuros);
    if (!Number.isFinite(euros) || euros < 0) {
      return { success: false, error: "Manual discount must be a non-negative number." };
    }
    manualDiscountCents = Math.round(euros * 100);
  }

  if (manualDiscountCents > 0) {
    if (!hasPermission(adminAccess, "payments:manual_adjustment")) {
      return {
        success: false,
        error: "You do not have permission to apply manual discounts.",
      };
    }
    if (!manualDiscountReason) {
      return {
        success: false,
        error: "A reason is required when applying a manual discount.",
      };
    }
  }

  let selectedStyleIds: string[] | null = null;
  let selectedStyleNames: string[] | null = null;
  const rawIds = formData.get("selectedStyleIds") as string;
  const rawNames = formData.get("selectedStyleNames") as string;
  if (rawIds) {
    try { selectedStyleIds = JSON.parse(rawIds); } catch { /* ignore */ }
  }
  if (rawNames) {
    try { selectedStyleNames = JSON.parse(rawNames); } catch { /* ignore */ }
  }

  if (!studentId) return { success: false, error: "Missing student ID" };
  if (!productId) return { success: false, error: "Please select a product" };
  if (!paymentMethodRaw || !VALID_PAYMENT_METHODS.has(paymentMethodRaw)) {
    return { success: false, error: "Invalid payment method" };
  }
  if (!VALID_PAYMENT_STATUSES.has(paymentStatusRaw)) {
    return { success: false, error: "Invalid payment status" };
  }

  const product = await getProductRepo().getById(productId);
  if (!product) return { success: false, error: "Product not found" };

  // Term-based vs fixed-duration vs open-ended expiry math is now
  // owned by a single pure helper — see lib/domain/subscription-validity.ts.
  // Look up the term (and its consecutive follower for spanTerms >= 2)
  // if the admin picked one, then delegate.
  let chosenTerm: MockTerm | null = null;
  let nextConsecutive: MockTerm | null = null;
  if (termId) {
    chosenTerm = await getTermRepo().getById(termId);
    if (!chosenTerm) return { success: false, error: "Term not found" };
    const spanTerms = product.spanTerms ?? 1;
    if (spanTerms >= 2) {
      const allTerms = await getTermRepo().getAll();
      const next = getNextConsecutiveTerm(allTerms, termId);
      if (!next) {
        return {
          success: false,
          error: `Cannot assign — no next consecutive term exists after "${chosenTerm.name}". Please create the next term first.`,
        };
      }
      nextConsecutive = next;
    }
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  const computed = computeSubscriptionValidity({
    product: {
      id: product.id,
      productType: product.productType,
      termBound: product.termBound,
      spanTerms: product.spanTerms ?? null,
      durationDays: product.durationDays ?? null,
    },
    purchaseDate: todayStr,
    chosenTerm,
    nextConsecutiveTerm: nextConsecutive,
  });
  if (!computed.ok) return { success: false, error: computed.error.message };
  const validFrom: string = computed.validity.validFrom;
  const validUntil: string | null = computed.validity.validUntil;

  const totalCredits = product.totalCredits;
  const remainingCredits = product.totalCredits;
  const classesPerTerm = product.classesPerTerm;

  // Phase 1: freeze product + access-rule state at the moment the admin
  // assigns this subscription so future product edits cannot retroactively
  // change its entitlement.
  const productSnapshot = await buildSnapshotFromProduct(product);

  // Phase 4 hardening: evaluate the discount engine in COMMIT mode so
  // any first-time-purchase rule is atomically claimed before the row
  // is written. Complimentary/waived flows still run through the engine
  // — when base price is zero, no discounts apply and no claim is made.
  const pricing = await priceProductForStudent({
    studentId,
    product: { id: product.id, productType: product.productType, priceCents: product.priceCents },
    commit: { source: "admin_manual" },
  });

  // Stackability: only block when the product is explicitly marked
  // non-stackable. Drop-ins are always stackable. Otherwise an admin
  // assigning a second pass (e.g. Bronze Bachata for a student who
  // already holds Bronze Salsa) must succeed.
  const isStackable =
    product.productType === "drop_in" ||
    product.allowMultipleActivePurchases !== false;
  if (!isStackable) {
    const existingActive = (await getSubscriptionRepo().getByStudent(studentId)).filter(
      (s) => s.status === "active" && s.productId === product.id,
    );
    if (existingActive.length > 0) {
      return {
        success: false,
        error: `${product.name} is configured as non-stackable and the student already has an active one.`,
      };
    }
  }

  // Manual discount: subtract from the engine-derived final price.
  // Cap at the engine final price so we never charge a negative amount.
  // Reject if the requested manual discount exceeds the engine final
  // price — admins should set the engine-applied discount aside (or
  // not apply it) rather than silently zeroing it.
  const engineFinalCents = pricing.finalPriceCents;
  if (manualDiscountCents > engineFinalCents) {
    return {
      success: false,
      error: `Manual discount (€${(manualDiscountCents / 100).toFixed(2)}) cannot exceed the product price (€${(engineFinalCents / 100).toFixed(2)}).`,
    };
  }
  const finalPriceAfterManualCents = engineFinalCents - manualDiscountCents;
  const combinedDiscountCents = pricing.totalDiscountCents + manualDiscountCents;
  const notesWithManualReason =
    manualDiscountCents > 0 && manualDiscountReason
      ? notes
        ? `${notes}\nManual discount reason: ${manualDiscountReason}`
        : `Manual discount reason: ${manualDiscountReason}`
      : notes;

  const result = await createSubscription({
    studentId,
    productId: product.id,
    productName: product.name,
    productType: product.productType,
    status: "active",
    totalCredits,
    remainingCredits,
    validFrom,
    validUntil,
    notes: notesWithManualReason,
    termId,
    paymentMethod: paymentMethodRaw as PaymentMethod,
    paymentStatus: paymentStatusRaw as SalePaymentStatus,
    // Supabase column `student_subscriptions.assigned_by` is `uuid
    // REFERENCES users(id)` — must be the auth user id, NEVER the
    // display name. The Finance BY column resolves this id back to a
    // human label via `identityMap`. Writing a name here previously
    // caused: invalid input syntax for type uuid: "BPM Admin".
    assignedBy: adminUser.id,
    assignedAt: new Date().toISOString(),
    autoRenew,
    classesUsed: 0,
    classesPerTerm,
    selectedStyleId,
    selectedStyleName,
    selectedStyleIds,
    selectedStyleNames,
    priceCentsAtPurchase: finalPriceAfterManualCents,
    currencyAtPurchase: "EUR",
    productSnapshot,
    originalPriceCents: pricing.basePriceCents,
    discountAmountCents: combinedDiscountCents,
    appliedDiscount: pricing.snapshot,
    manualDiscountCents,
    manualDiscountReason,
    manualDiscountBy: manualDiscountCents > 0 ? adminUser.id : null,
  });

  if (result.success && result.subscriptionId) {
    const baseMetadata = buildAuditDiscountMetadata(pricing);
    const auditMetadata: Record<string, unknown> = {
      ...(baseMetadata ?? {}),
    };
    if (manualDiscountCents > 0) {
      auditMetadata.manualDiscount = {
        amountCents: manualDiscountCents,
        reason: manualDiscountReason,
        performedByUserId: adminUser.id,
        performedByEmail: adminUser.email,
        performedByName: adminUser.fullName,
        engineFinalCents,
        finalAfterManualCents: finalPriceAfterManualCents,
        basePriceCents: pricing.basePriceCents,
        appliedAt: new Date().toISOString(),
      };
    }

    const detail = manualDiscountCents > 0
      ? `Admin assigned subscription with manual discount €${(manualDiscountCents / 100).toFixed(2)} (reason: ${manualDiscountReason ?? "—"})`
      : pricing.snapshot
        ? `Admin assigned subscription with ${pricing.appliedDiscounts.length} discount(s) applied`
        : "Admin assigned subscription";
    const newValue = manualDiscountCents > 0
      ? `final ${finalPriceAfterManualCents}c (manual −${manualDiscountCents}c, engine −${pricing.totalDiscountCents}c)`
      : pricing.snapshot
        ? `final ${pricing.finalPriceCents}c (saved ${pricing.totalDiscountCents}c)`
        : null;

    logFinanceEvent({
      entityType: "subscription",
      entityId: result.subscriptionId,
      action: manualDiscountCents > 0 ? "manual_edit" : "created",
      performer: { userId: adminUser.id, email: adminUser.email, name: adminUser.fullName },
      detail,
      newValue,
      metadata: Object.keys(auditMetadata).length > 0 ? auditMetadata : null,
    });

    // Phase 4 hardening: link the discount claim row to the resulting
    // subscription for audit traceability.
    if (pricing.claim) {
      await attachClaimRelations(pricing.claim.id, {
        relatedSubscriptionId: result.subscriptionId,
      });
    }
  } else if (pricing.claim) {
    // Subscription creation failed AFTER we recorded a discount claim
    // — release it so the student can retry without losing first-time.
    await releaseDiscountClaim(
      pricing.claim.id,
      "admin_manual_subscription_create_failed",
    );
  }

  if (result.success && result.subscriptionId && paymentStatusRaw === "pending") {
    const student = await getStudentRepo().getById(studentId);
    if (student) {
      const term = termId ? await getTermRepo().getById(termId) : null;
      // Phase 4 / Bug 2: use frozen pricing from the engine result so
      // the email shows the discounted amount, not raw product price.
      const finalCents = finalPriceAfterManualCents ?? pricing.finalPriceCents ?? product.priceCents ?? null;
      const summary = [
        ...pricing.appliedDiscounts.map((d) => d.name || d.reason || d.ruleType),
        manualDiscountCents > 0 ? `Manual discount (${manualDiscountReason ?? "—"})` : null,
      ]
        .filter(Boolean)
        .join(" + ");
      await dispatchCommEvents([
        paymentPendingEvent({
          studentId,
          studentName: student.fullName,
          productName: product.name,
          subscriptionId: result.subscriptionId,
          termName: term?.name ?? null,
          amountLabel: finalCents != null ? `€${(finalCents / 100).toFixed(2)}` : null,
          originalPriceCents: pricing.basePriceCents,
          discountAmountCents: combinedDiscountCents,
          finalPriceCents: finalPriceAfterManualCents,
          appliedDiscountSummary: summary || null,
        }),
      ]);
    }
  }

  if (result.success) {
    revalidatePath("/students");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }
  return result;
}

export async function updateSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requirePermission("students:edit");
  const id = formData.get("id") as string;
  const statusRaw = formData.get("status") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const paymentMethodRaw = (formData.get("paymentMethod") as string)?.trim() || null;
  const paymentStatusRaw = (formData.get("paymentStatus") as string)?.trim() || null;

  if (!id) return { success: false, error: "Missing subscription ID" };
  if (!VALID_STATUSES.has(statusRaw)) return { success: false, error: "Invalid status" };
  if (paymentMethodRaw && !VALID_PAYMENT_METHODS.has(paymentMethodRaw)) {
    return { success: false, error: "Invalid payment method" };
  }
  if (paymentStatusRaw && !VALID_PAYMENT_STATUSES.has(paymentStatusRaw)) {
    return { success: false, error: "Invalid payment status" };
  }

  if (paymentStatusRaw === "refunded") {
    const existing = await getSubscriptionRepo().getById(id);
    if (existing && existing.paymentStatus !== "paid") {
      return {
        success: false,
        error: "Only paid items can be refunded. A pending payment was never received.",
      };
    }
  }

  const patch: Parameters<typeof updateSubscription>[1] = {
    status: statusRaw as SubscriptionStatus,
    notes,
  };

  if (paymentMethodRaw) patch.paymentMethod = paymentMethodRaw as PaymentMethod;
  if (paymentStatusRaw) patch.paymentStatus = paymentStatusRaw as SalePaymentStatus;

  const selectedStyleId = formData.get("selectedStyleId") as string | null;
  const selectedStyleName = formData.get("selectedStyleName") as string | null;
  if (selectedStyleId !== null) {
    patch.selectedStyleId = selectedStyleId || null;
    patch.selectedStyleName = selectedStyleName || null;
  }

  const rawStyleIds = formData.get("selectedStyleIds") as string | null;
  const rawStyleNames = formData.get("selectedStyleNames") as string | null;
  if (rawStyleIds !== null) {
    try { patch.selectedStyleIds = JSON.parse(rawStyleIds); } catch { /* ignore */ }
  }
  if (rawStyleNames !== null) {
    try { patch.selectedStyleNames = JSON.parse(rawStyleNames); } catch { /* ignore */ }
  }

  const paidAtRaw = (formData.get("paidAt") as string | null)?.trim() || null;
  const paymentReference = (formData.get("paymentReference") as string | null)?.trim() || null;
  const paymentNotes = (formData.get("paymentNotes") as string | null)?.trim() || null;
  const collectedBy = (formData.get("collectedBy") as string | null)?.trim() || null;

  if (paidAtRaw) {
    const d = new Date(paidAtRaw);
    patch.paidAt = isNaN(d.getTime()) ? null : d.toISOString();
  } else {
    patch.paidAt = null;
  }
  patch.paymentReference = paymentReference;
  patch.paymentNotes = paymentNotes;
  patch.collectedBy = collectedBy;

  const result = await updateSubscription(id, patch);

  if (result.success) {
    if (paymentStatusRaw === "paid") {
      try {
        const sub = await getSubscriptionRepo().getById(id);
        if (sub) {
          const { dismissNotificationsForSubscription } = await import("@/lib/communications/notification-store");
          await dismissNotificationsForSubscription(sub.studentId, id);

          const student = await getStudentRepo().getById(sub.studentId);
          if (student) {
            const amountLabel = sub.priceCentsAtPurchase != null
              ? `€${(sub.priceCentsAtPurchase / 100).toFixed(2)}`
              : null;
            const appliedDiscount = sub.appliedDiscount as
              | { appliedDiscounts?: Array<{ name?: string; ruleType?: string; reason?: string }> }
              | null
              | undefined;
            const summary = (appliedDiscount?.appliedDiscounts ?? [])
              .map((d) => d.name || d.reason || d.ruleType)
              .filter(Boolean)
              .join(" + ");
            await dispatchCommEvents([
              paymentConfirmedEvent({
                studentId: sub.studentId,
                studentName: student.fullName,
                productName: sub.productName,
                subscriptionId: id,
                amountLabel,
                paymentMethod: sub.paymentMethod,
                originalPriceCents: sub.originalPriceCents ?? null,
                discountAmountCents: sub.discountAmountCents ?? 0,
                finalPriceCents: sub.priceCentsAtPurchase ?? null,
                appliedDiscountSummary: summary || null,
              }),
            ]).catch(() => {});
          }
        }
      } catch { /* best-effort */ }
    }
    revalidatePath("/students");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
  }
  return result;
}

// ── Payment impact check ─────────────────────────────────────

export interface PaymentChangeImpact {
  futureBookingsCount: number;
  subscriptionStatus: SubscriptionStatus;
  productName: string;
}

/**
 * Check the impact of cancelling an entitlement linked to this subscription.
 */
export async function checkPaymentChangeImpactAction(
  subscriptionId: string
): Promise<{ success: boolean; impact?: PaymentChangeImpact; error?: string }> {
  await requirePermission("students:edit");
  await ensureOperationalDataHydrated();

  const sub = (await getSubscriptionRepo().getAll()).find((s) => s.id === subscriptionId);
  if (!sub) return { success: false, error: "Subscription not found" };

  const today = getTodayStr();
  const svc = getBookingService();
  const futureBookings = svc.bookings.filter((b) => {
    if (b.studentId !== sub.studentId) return false;
    if (b.subscriptionId !== sub.id) return false;
    if (b.status !== "confirmed" && b.status !== "checked_in") return false;
    const cls = svc.getClass(b.bookableClassId);
    return cls ? cls.date >= today : false;
  });

  return {
    success: true,
    impact: {
      futureBookingsCount: futureBookings.length,
      subscriptionStatus: sub.status,
      productName: sub.productName,
    },
  };
}

/**
 * Apply a sensitive payment status change with optional entitlement cancellation.
 * Called from the confirmation modal after the admin has chosen what to do.
 *
 * Enforced transition rules:
 * - "refunded" is only allowed from "paid" (a pending item was never paid)
 * - "cancelled" is allowed from "pending" or "paid"
 */
export async function applyPaymentChangeAction(params: {
  subscriptionId: string;
  newPaymentStatus: SalePaymentStatus;
  cancelEntitlement: boolean;
  refundReason?: string;
  performedBy?: string;
}): Promise<{ success: boolean; error?: string }> {
  // Permission gate: refunds need finance:refund (or payments:refund as
  // a back-office equivalent); pending→paid transitions need
  // finance:mark_paid OR the front-desk reception equivalent
  // (payments:mark_paid_reception). Anything else falls back to the
  // legacy admin gate so we don't accidentally widen access.
  const adminGuardCandidates: import("@/lib/domain/permissions").Permission[] =
    params.newPaymentStatus === "refunded"
      ? ["finance:refund", "payments:refund"]
      : params.newPaymentStatus === "paid"
        ? ["finance:mark_paid", "payments:mark_paid_reception"]
        : ["finance:mark_paid"];
  let admin: import("@/lib/auth").AuthUser | null = null;
  let lastError: string | null = null;
  for (const perm of adminGuardCandidates) {
    const g = await requirePermissionForAction(perm);
    if (g.ok) { admin = g.access.user; break; }
    lastError = g.error;
  }
  if (!admin) {
    return { success: false, error: lastError ?? "Not authorized" };
  }

  const sub = await getSubscriptionRepo().getById(params.subscriptionId);
  if (!sub) return { success: false, error: "Subscription not found" };

  const previousStatus = sub.paymentStatus;

  if (params.newPaymentStatus === "refunded" && previousStatus !== "paid") {
    return {
      success: false,
      error: "Only paid items can be refunded. A pending payment was never received.",
    };
  }

  // Finance hardening (Phase 5 / Stripe refunds): the dropdown change
  // is the legacy BPM-only refund path. Refusing it for Stripe-paid
  // subscriptions prevents the situation where BPM looks refunded but
  // the customer was never actually credited. Stripe-paid subscriptions
  // must go through `issueStripeRefundAction`, which calls Stripe first
  // and only marks BPM refunded after the refund is accepted.
  if (
    params.newPaymentStatus === "refunded" &&
    sub.paymentMethod === "stripe" &&
    (sub.refundedAmountCents ?? 0) === 0 &&
    !sub.stripeRefundId
  ) {
    return {
      success: false,
      error:
        "This subscription was paid through Stripe. Use the Issue Stripe refund action so the customer actually gets their money back.",
    };
  }

  const patch: Parameters<typeof updateSubscription>[1] = {
    paymentStatus: params.newPaymentStatus,
  };

  if (params.cancelEntitlement) {
    patch.status = "cancelled";
  }

  if (params.newPaymentStatus === "refunded") {
    patch.refundedAt = new Date().toISOString();
    patch.refundedBy = params.performedBy ?? admin.fullName ?? admin.email;
    patch.refundReason = params.refundReason ?? null;
  }

  // Pending → paid transition: stamp the actor + payment timestamp so
  // Finance's BY column resolves to the admin who marked it paid (and
  // not to the original assignedBy / null self-purchase author).
  if (params.newPaymentStatus === "paid" && previousStatus !== "paid") {
    patch.collectedBy = params.performedBy ?? admin.fullName ?? admin.email;
    if (!sub.paidAt) {
      patch.paidAt = new Date().toISOString();
    }
  }

  const result = await updateSubscription(params.subscriptionId, patch);

  if (result.success) {
    const action = params.newPaymentStatus === "refunded"
      ? "refunded" as const
      : params.newPaymentStatus === "paid"
        ? "marked_paid" as const
        : "status_changed" as const;

    // Phase 4 hardening: when refunding, attach the frozen discount snapshot
    // (and base/discount/final amounts) to the audit metadata so finance
    // reviewers can see WHAT was being reversed — not just the new status.
    let refundMetadata: Record<string, unknown> | null = null;
    if (params.newPaymentStatus === "refunded") {
      refundMetadata = {
        basePriceCents: sub.originalPriceCents ?? sub.priceCentsAtPurchase ?? null,
        discountAmountCents: sub.discountAmountCents ?? 0,
        finalPaidCents: sub.priceCentsAtPurchase ?? null,
        currency: sub.currencyAtPurchase ?? "EUR",
        appliedDiscount: sub.appliedDiscount ?? null,
      };
    }

    logFinanceEvent({
      entityType: "subscription",
      entityId: params.subscriptionId,
      action,
      performer: { userId: admin.id, email: admin.email, name: admin.fullName },
      performedBy: params.performedBy,
      detail: params.refundReason ?? null,
      previousValue: previousStatus,
      newValue: params.newPaymentStatus,
      metadata: refundMetadata,
    });

    // Notify the student about the payment state change
    try {
      const updatedSub = await getSubscriptionRepo().getById(params.subscriptionId);
      if (updatedSub) {
        const student = await getStudentRepo().getById(updatedSub.studentId);
        const amountLabel = updatedSub.priceCentsAtPurchase != null
          ? `€${(updatedSub.priceCentsAtPurchase / 100).toFixed(2)}`
          : null;

        // Bug 2: surface the frozen discount snapshot to the email
        // template so confirmation emails show the discounted total.
        const discountAmountCents = updatedSub.discountAmountCents ?? 0;
        const originalPriceCents = updatedSub.originalPriceCents ?? null;
        const appliedDiscount = updatedSub.appliedDiscount as
          | { appliedDiscounts?: Array<{ name?: string; ruleType?: string; reason?: string }> }
          | null
          | undefined;
        const summary = (appliedDiscount?.appliedDiscounts ?? [])
          .map((d) => d.name || d.reason || d.ruleType)
          .filter(Boolean)
          .join(" + ");

        if (params.newPaymentStatus === "paid" && student) {
          await dispatchCommEvents([
            paymentConfirmedEvent({
              studentId: updatedSub.studentId,
              studentName: student.fullName,
              productName: updatedSub.productName,
              subscriptionId: params.subscriptionId,
              amountLabel,
              paymentMethod: updatedSub.paymentMethod,
              originalPriceCents,
              discountAmountCents,
              finalPriceCents: updatedSub.priceCentsAtPurchase ?? null,
              appliedDiscountSummary: summary || null,
            }),
          ]).catch(() => {});

          const { dismissNotificationsForSubscription } = await import("@/lib/communications/notification-store");
          await dismissNotificationsForSubscription(updatedSub.studentId, params.subscriptionId);
        }

        if (params.newPaymentStatus === "refunded" && student) {
          await dispatchCommEvents([
            subscriptionRefundedEvent({
              studentId: updatedSub.studentId,
              studentName: student.fullName,
              productName: updatedSub.productName,
              subscriptionId: params.subscriptionId,
              amountLabel,
              refundReason: params.refundReason ?? null,
              entitlementCancelled: params.cancelEntitlement,
            }),
          ]).catch(() => {});
        }
      }
    } catch { /* best-effort notification */ }

    revalidatePath("/students");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    revalidatePath("/classes");
    revalidatePath("/bookings");
    revalidatePath("/finance");
  }
  return result;
}

// ── Extend subscription expiry (admin-only) ─────────────────
//
// Phase 14. Business rule: term-based passes/memberships expire at
// the selected term's end date (see `computeSubscriptionValidity`).
// In exceptional circumstances (illness, injury, mis-sale) an admin
// with `payments:manual_adjustment` may push a single subscription's
// `validUntil` forward. Every extension is logged via the existing
// finance-audit trail so Finance/Zaria have a clean record of why
// the entitlement ran into the next term.
//
// Rules enforced server-side (never trust the client):
//   * Permission gate: `payments:manual_adjustment`.
//   * `newValidUntil` must be strictly AFTER the current `validUntil`.
//     Shortening/no-op is rejected — a shortening flow can be added
//     later if needed but is out of scope here.
//   * `reason` must be non-empty (matches the manual-discount UX).
//   * The subscription must currently HAVE a `validUntil` — open-ended
//     drop-in credit packs are not extendable.
//   * The row itself must still be active or paused; expired/cancelled
//     rows are read-only (an admin should renew instead).
//
// Audit shape: `logFinanceEvent({ entityType: "subscription",
//   action: "manual_edit", detail: <reason>, previousValue: old,
//   newValue: new, metadata: { extension: { previousValidUntil,
//   newValidUntil, reason, adminId, adminEmail, adminName,
//   performedAt } } })`.

export interface ExtendSubscriptionInput {
  subscriptionId: string;
  newValidUntil: string;
  reason: string;
}

export async function extendSubscriptionAction(
  input: ExtendSubscriptionInput,
): Promise<{
  success: boolean;
  error?: string;
  previousValidUntil?: string | null;
  newValidUntil?: string;
}> {
  const access = await requirePermission("payments:manual_adjustment");
  const adminUser = access.user;

  const id = (input.subscriptionId ?? "").trim();
  if (!id) return { success: false, error: "Missing subscription ID" };

  const sub = await getSubscriptionRepo().getById(id);
  if (!sub) return { success: false, error: "Subscription not found" };

  if (sub.status !== "active" && sub.status !== "paused") {
    return {
      success: false,
      error: `Cannot extend a ${sub.status} subscription. Use renew instead.`,
    };
  }

  const validation = validateSubscriptionExtension({
    currentValidUntil: sub.validUntil,
    newValidUntil: input.newValidUntil,
    reason: input.reason,
  });
  if (!validation.ok) {
    return { success: false, error: validation.message };
  }

  const previousValidUntil = sub.validUntil;
  const newValidUntil = input.newValidUntil.trim();
  const reason = input.reason.trim();

  const result = await updateSubscription(id, { validUntil: newValidUntil });
  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to update subscription." };
  }

  const performedAt = new Date().toISOString();
  logFinanceEvent({
    entityType: "subscription",
    entityId: id,
    action: "manual_edit",
    performer: {
      userId: adminUser.id,
      email: adminUser.email,
      name: adminUser.fullName,
    },
    detail: `Expiry extended by admin — reason: ${reason}`,
    previousValue: previousValidUntil ?? null,
    newValue: newValidUntil,
    metadata: {
      extension: {
        previousValidUntil: previousValidUntil ?? null,
        newValidUntil,
        reason,
        adminId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        performedAt,
      },
    },
  });

  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/finance");

  return {
    success: true,
    previousValidUntil: previousValidUntil ?? null,
    newValidUntil,
  };
}
