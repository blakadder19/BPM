"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getProductRepo, getTermRepo, getSubscriptionRepo } from "@/lib/repositories";
import { createSubscription } from "@/lib/services/subscription-service";
import { getCurrentTerm, getNextTerm, getNextConsecutiveTerm } from "@/lib/domain/term-rules";
import { getTodayStr } from "@/lib/domain/datetime";
import { getSettings } from "@/lib/services/settings-store";
import { getAccessRule } from "@/config/product-access";
import { paymentPendingEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";

export interface PurchaseInput {
  productId: string;
  selectedStyleId?: string | null;
  selectedStyleName?: string | null;
  selectedStyleIds?: string[] | null;
  selectedStyleNames?: string[] | null;
  selectedTermId?: string | null;
}

export async function createStudentPurchaseAction(
  input: PurchaseInput
): Promise<{ success: boolean; error?: string }> {
  const user = await requireRole(["student"]);

  const product = await getProductRepo().getById(input.productId);
  if (!product) return { success: false, error: "Product not found." };
  if (!product.isActive) return { success: false, error: "This product is no longer available." };

  const accessRule = getAccessRule(product.id);
  const styleMode = accessRule?.styleAccess.type;

  if (styleMode === "selected_style") {
    if (!input.selectedStyleId || !input.selectedStyleName) {
      return { success: false, error: "Please select a dance style." };
    }
    const allowed = accessRule?.styleAccess.type === "selected_style"
      ? accessRule.styleAccess.allowedStyleIds
      : null;
    if (allowed && !allowed.includes(input.selectedStyleId)) {
      return { success: false, error: "Selected style is not available for this product." };
    }
  }

  if (styleMode === "course_group") {
    if (!input.selectedStyleIds?.length || !input.selectedStyleNames?.length) {
      return { success: false, error: "Please select your styles." };
    }
    const pool = accessRule?.styleAccess.type === "course_group"
      ? accessRule.styleAccess.poolStyleIds
      : [];
    const pickCount = accessRule?.styleAccess.type === "course_group"
      ? accessRule.styleAccess.pickCount
      : 0;
    if (input.selectedStyleIds.length !== pickCount) {
      return { success: false, error: `Please select exactly ${pickCount} styles.` };
    }
    for (const id of input.selectedStyleIds) {
      if (!pool.includes(id)) {
        return { success: false, error: "One or more selected styles are not available." };
      }
    }
  }

  const allTerms = await getTermRepo().getAll();
  const todayStr = getTodayStr();
  const currentTerm = getCurrentTerm(allTerms, todayStr);
  const nextTerm = getNextTerm(allTerms, todayStr);

  const studentSubs = (await getSubscriptionRepo().getAll()).filter(
    (s) => s.studentId === user.id && s.status === "active"
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
        return { success: false, error: "Selected term not found." };
      }
      if (assignedTerm.id !== currentTerm?.id && assignedTerm.id !== nextTerm?.id) {
        return { success: false, error: "Selected term is not eligible for purchase." };
      }
    } else {
      assignedTerm = currentTerm ?? nextTerm;
    }

    if (!assignedTerm?.id) {
      return { success: false, error: "No active or upcoming term available. Please check back later." };
    }

    termId = assignedTerm.id;
    validFrom = assignedTerm.startDate;
    validUntil = assignedTerm.endDate;
    assignedTermName = assignedTerm.name;

    const spanTerms = product.spanTerms ?? 1;
    if (spanTerms >= 2) {
      const next = getNextConsecutiveTerm(allTerms, assignedTerm.id);
      if (!next) {
        return { success: false, error: "This product spans multiple terms, but the next term is not yet available." };
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
        success: false,
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

  const result = await createSubscription({
    studentId: user.id,
    productId: product.id,
    productName: product.name,
    productType: product.productType,
    status: "active",
    totalCredits: product.totalCredits,
    remainingCredits: product.totalCredits,
    validFrom,
    validUntil,
    notes: "Student self-purchase (payment pending)",
    termId,
    paymentMethod: "manual",
    paymentStatus: "pending",
    assignedBy: null,
    assignedAt: new Date().toISOString(),
    autoRenew: product.autoRenew,
    classesUsed: 0,
    classesPerTerm: product.classesPerTerm,
    selectedStyleId: input.selectedStyleId ?? null,
    selectedStyleName: input.selectedStyleName ?? null,
    selectedStyleIds: input.selectedStyleIds ?? null,
    selectedStyleNames: input.selectedStyleNames ?? null,
  });

  if (result.success && result.subscriptionId) {
    await dispatchCommEvents([
      paymentPendingEvent({
        studentId: user.id,
        studentName: user.fullName,
        productName: product.name,
        subscriptionId: result.subscriptionId,
        termName: assignedTermName,
        amountLabel: product.priceCents != null ? `€${(product.priceCents / 100).toFixed(2)}` : null,
      }),
    ]);
    revalidatePath("/catalog");
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }
  return result;
}
