"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getProductRepo, getSubscriptionRepo } from "@/lib/repositories";
import { updateSubscription } from "@/lib/services/subscription-service";
import {
  validateAndPreparePurchase,
  createPurchaseSubscription,
  type PurchaseInput,
} from "@/lib/services/purchase-subscription";
import { paymentPendingEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";

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
    // Use the FROZEN pricing for the email/notification body, not the
    // raw product.priceCents — otherwise discounted purchases were
    // emailed with the base catalog price (Bug 2).
    const pricing = result.pricing;
    const finalCents = pricing?.finalPriceCents ?? product.priceCents ?? null;
    const summary = (pricing?.appliedDiscounts ?? [])
      .map((d) => d.name || d.reason || d.ruleType)
      .filter(Boolean)
      .join(" + ");
    await dispatchCommEvents([
      paymentPendingEvent({
        studentId: user.id,
        studentName: user.fullName,
        productName: product.name,
        subscriptionId: result.subscriptionId,
        termName: assignedTermName,
        amountLabel: finalCents != null ? `€${(finalCents / 100).toFixed(2)}` : null,
        originalPriceCents: pricing?.basePriceCents ?? null,
        discountAmountCents: pricing?.totalDiscountCents ?? null,
        finalPriceCents: pricing?.finalPriceCents ?? null,
        appliedDiscountSummary: summary || null,
      }),
    ]);
    revalidatePath("/catalog");
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }
  return result;
}

// ── Student toggle auto-renew ────────────────────────────────

export async function toggleAutoRenewAction(
  subscriptionId: string,
  autoRenew: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole(["student"]);
    const sub = await getSubscriptionRepo().getById(subscriptionId);
    if (!sub || sub.studentId !== user.id) return { success: false, error: "Subscription not found." };
    if (sub.status !== "active") return { success: false, error: "Only active plans can change auto-renew." };

    const product = await getProductRepo().getById(sub.productId);
    if (!product || !product.autoRenew) {
      return { success: false, error: "This product type does not support auto-renew." };
    }

    const result = await updateSubscription(subscriptionId, { autoRenew });
    if (!result.success) return { success: false, error: result.error ?? "Failed to update." };

    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    return { success: true };
  } catch (e: unknown) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { success: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
