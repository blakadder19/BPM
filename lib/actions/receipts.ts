"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermissionForAction } from "@/lib/staff-permissions";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import { sendStaffGuestReceipt } from "@/lib/services/guest-receipt-delivery";

const sendGuestReceiptSchema = z.object({ purchaseId: z.string().trim().min(1).max(100) });

export type SendGuestReceiptActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Staff "Send receipt" / "Resend receipt" for a guest event purchase.
 * The destination is always the guest email stored on the purchase.
 */
export async function sendGuestReceiptAction(input: { purchaseId: string }): Promise<SendGuestReceiptActionResult> {
  const guard = await requirePermissionForAction("payments:send_receipt");
  if (!guard.ok) return { success: false, error: guard.error };
  const { user } = guard.access;

  const parsed = sendGuestReceiptSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Purchase not found." };
  const { purchaseId } = parsed.data;

  const result = await sendStaffGuestReceipt({ eventPurchaseId: purchaseId, staffUserId: user.id });
  if (!result.ok) return { success: false, error: result.error };

  logFinanceEvent({
    entityType: "event_purchase",
    entityId: purchaseId,
    action: "receipt_sent",
    performer: { userId: user.id, email: user.email, name: user.fullName },
    detail: result.replacedPreviousLink
      ? "Payment receipt link re-sent to the guest email on the purchase; the previous link was revoked."
      : "Payment receipt link sent to the guest email on the purchase.",
    metadata: { receiptTokenId: result.tokenId, replacedPreviousLink: result.replacedPreviousLink },
  });

  revalidatePath(`/events/${result.eventId}`);

  return {
    success: true,
    message: result.replacedPreviousLink
      ? `Receipt sent to ${result.recipientEmail}. The previous receipt link no longer works.`
      : `Receipt sent to ${result.recipientEmail}.`,
  };
}
