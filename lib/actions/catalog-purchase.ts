"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type AuthUser } from "@/lib/auth";
import { getProductRepo, getTermRepo, getSubscriptionRepo } from "@/lib/repositories";
import { createSubscription } from "@/lib/services/subscription-service";
import { getCurrentTerm, getNextTerm, getNextConsecutiveTerm, isCurrentTermPurchasable } from "@/lib/domain/term-rules";
import { getTodayStr } from "@/lib/domain/datetime";
import { getSettings } from "@/lib/services/settings-store";
import { getAccessRule } from "@/config/product-access";
import { paymentPendingEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import { TERM_PURCHASE_WINDOW_DAYS } from "@/config/business-rules";
import type { MockProduct } from "@/lib/mock-data";
import type { PaymentMethod, SalePaymentStatus } from "@/types/domain";

// ── Public types ─────────────────────────────────────────────

export interface PurchaseInput {
  productId: string;
  selectedStyleId?: string | null;
  selectedStyleName?: string | null;
  selectedStyleIds?: string[] | null;
  selectedStyleNames?: string[] | null;
  selectedTermId?: string | null;
}

export interface PreparedPurchase {
  user: AuthUser;
  product: MockProduct;
  termId: string | null;
  validFrom: string;
  validUntil: string | null;
  assignedTermName: string | null;
  selectedStyleId: string | null;
  selectedStyleName: string | null;
  selectedStyleIds: string[] | null;
  selectedStyleNames: string[] | null;
}

// ── Shared validation ────────────────────────────────────────

export async function validateAndPreparePurchase(
  input: PurchaseInput,
): Promise<PreparedPurchase | { error: string }> {
  const user = await requireRole(["student"]);

  const product = await getProductRepo().getById(input.productId);
  if (!product) return { error: "Product not found." };
  if (!product.isActive) return { error: "This product is no longer available." };

  // ── Style validation ───────────────────────────────────────
  const accessRule = getAccessRule(product.id);
  const styleMode = accessRule?.styleAccess.type;

  if (styleMode === "selected_style") {
    if (!input.selectedStyleId || !input.selectedStyleName) {
      return { error: "Please select a dance style." };
    }
    const allowed = accessRule?.styleAccess.type === "selected_style"
      ? accessRule.styleAccess.allowedStyleIds
      : null;
    if (allowed && !allowed.includes(input.selectedStyleId)) {
      return { error: "Selected style is not available for this product." };
    }
  }

  if (styleMode === "course_group") {
    if (!input.selectedStyleIds?.length || !input.selectedStyleNames?.length) {
      return { error: "Please select your styles." };
    }
    const pool = accessRule?.styleAccess.type === "course_group"
      ? accessRule.styleAccess.poolStyleIds
      : [];
    const pickCount = accessRule?.styleAccess.type === "course_group"
      ? accessRule.styleAccess.pickCount
      : 0;
    if (input.selectedStyleIds.length !== pickCount) {
      return { error: `Please select exactly ${pickCount} styles.` };
    }
    for (const id of input.selectedStyleIds) {
      if (!pool.includes(id)) {
        return { error: "One or more selected styles are not available." };
      }
    }
  }

  // ── Term resolution + duplicate check ──────────────────────
  const allTerms = await getTermRepo().getAll();
  const todayStr = getTodayStr();
  const currentTerm = getCurrentTerm(allTerms, todayStr);
  const nextTerm = getNextTerm(allTerms, todayStr);

  const studentSubs = (await getSubscriptionRepo().getAll()).filter(
    (s) => s.studentId === user.id && s.status === "active",
  );

  let termId: string | null = null;
  let validFrom: string;
  let validUntil: string | null;
  let assignedTermName: string | null = null;

  if (product.termBound) {
    const settings = getSettings();
    let assignedTerm: typeof currentTerm = null;

    if (settings.studentTermSelectionEnabled && input.selectedTermId) {
      assignedTerm = allTerms.find((t) => t.id === input.selectedTermId) ?? null;
      if (!assignedTerm) {
        return { error: "Selected term not found." };
      }
      if (assignedTerm.id !== currentTerm?.id && assignedTerm.id !== nextTerm?.id) {
        return { error: "Selected term is not eligible for purchase." };
      }
      if (
        assignedTerm.id === currentTerm?.id &&
        !isCurrentTermPurchasable(currentTerm.startDate, todayStr, TERM_PURCHASE_WINDOW_DAYS)
      ) {
        return { error: "The purchase window for the current term has closed. Please select the next term." };
      }
    } else {
      const currentOk =
        currentTerm && isCurrentTermPurchasable(currentTerm.startDate, todayStr, TERM_PURCHASE_WINDOW_DAYS);
      assignedTerm = currentOk ? currentTerm : (nextTerm ?? currentTerm);
    }

    if (!assignedTerm?.id) {
      return { error: "No active or upcoming term available. Please check back later." };
    }

    termId = assignedTerm.id;
    validFrom = assignedTerm.startDate;
    validUntil = assignedTerm.endDate;
    assignedTermName = assignedTerm.name;

    const spanTerms = product.spanTerms ?? 1;
    if (spanTerms >= 2) {
      const next = getNextConsecutiveTerm(allTerms, assignedTerm.id);
      if (!next) {
        return { error: "This product spans multiple terms, but the next term is not yet available." };
      }
      validUntil = next.endDate;
      assignedTermName = `${assignedTerm.name} + ${next.name}`;
    }

    const hasDuplicate = studentSubs.some((s) => {
      if (s.productId !== product.id) return false;
      if (spanTerms >= 2) {
        return s.validFrom <= validUntil! && (s.validUntil ?? s.validFrom) >= validFrom;
      }
      return s.termId === assignedTerm!.id;
    });
    if (hasDuplicate) {
      return {
        error: spanTerms >= 2
          ? `You already have ${product.name} that covers this period.`
          : `You already have ${product.name} for ${assignedTerm.name}.`,
      };
    }
  } else if (product.durationDays) {
    validFrom = todayStr;
    const end = new Date();
    end.setDate(end.getDate() + product.durationDays);
    validUntil = end.toISOString().slice(0, 10);
  } else {
    validFrom = todayStr;
    validUntil = null;
  }

  return {
    user,
    product,
    termId,
    validFrom,
    validUntil,
    assignedTermName,
    selectedStyleId: input.selectedStyleId ?? null,
    selectedStyleName: input.selectedStyleName ?? null,
    selectedStyleIds: input.selectedStyleIds ?? null,
    selectedStyleNames: input.selectedStyleNames ?? null,
  };
}

// ── Subscription creation helper ─────────────────────────────

export async function createPurchaseSubscription(
  prepared: PreparedPurchase,
  payment: {
    method: PaymentMethod;
    status: SalePaymentStatus;
    reference?: string | null;
    paidAt?: string | null;
    notes?: string;
  },
): Promise<{ success: boolean; error?: string; subscriptionId?: string }> {
  const { user, product, termId, validFrom, validUntil } = prepared;

  return createSubscription({
    studentId: user.id,
    productId: product.id,
    productName: product.name,
    productType: product.productType,
    status: "active",
    totalCredits: product.totalCredits,
    remainingCredits: product.totalCredits,
    validFrom,
    validUntil,
    notes: payment.notes ?? null,
    termId,
    paymentMethod: payment.method,
    paymentStatus: payment.status,
    assignedBy: null,
    assignedAt: new Date().toISOString(),
    autoRenew: product.autoRenew,
    classesUsed: 0,
    classesPerTerm: product.classesPerTerm,
    selectedStyleId: prepared.selectedStyleId,
    selectedStyleName: prepared.selectedStyleName,
    selectedStyleIds: prepared.selectedStyleIds,
    selectedStyleNames: prepared.selectedStyleNames,
    paidAt: payment.paidAt ?? null,
    paymentReference: payment.reference ?? null,
  });
}

// ── "Pay at reception" action ────────────────────────────────

export async function createStudentPurchaseAction(
  input: PurchaseInput,
): Promise<{ success: boolean; error?: string }> {
  const prepared = await validateAndPreparePurchase(input);
  if ("error" in prepared) return { success: false, error: prepared.error };

  const result = await createPurchaseSubscription(prepared, {
    method: "manual",
    status: "pending",
    notes: "Student self-purchase — pay at reception",
  });

  if (result.success && result.subscriptionId) {
    const { user, product, assignedTermName } = prepared;
    await dispatchCommEvents([
      paymentPendingEvent({
        studentId: user.id,
        studentName: user.fullName,
        productName: product.name,
        subscriptionId: result.subscriptionId,
        termName: assignedTermName,
        amountLabel:
          product.priceCents != null
            ? `€${(product.priceCents / 100).toFixed(2)}`
            : null,
      }),
    ]);
    revalidatePath("/catalog");
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }
  return result;
}
