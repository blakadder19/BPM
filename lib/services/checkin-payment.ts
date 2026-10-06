import { getSubscriptionRepo } from "@/lib/repositories";
import { PAYMENT_NOT_CONFIRMED, paymentAllowsCheckIn } from "@/lib/domain/checkin-entitlement";

/** Refusal when the pass a check-in would use is not paid for (Pending, Cancelled, Refunded). */
export async function passPaymentDenial(subscriptionId: string | null | undefined): Promise<string | null> {
  if (!subscriptionId) return null;
  const sub = await getSubscriptionRepo().getById(subscriptionId);
  return sub && !paymentAllowsCheckIn(sub.paymentStatus) ? PAYMENT_NOT_CONFIRMED : null;
}
