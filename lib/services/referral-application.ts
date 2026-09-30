import "server-only";

import { getReferralRepo } from "@/lib/repositories";
import { resolveReferralCode } from "@/lib/domain/referrals";

/**
 * Server-only. Creates a `pending` referral row linking the referrer
 * (resolved from the code) to the just-purchased student.
 *
 * Contract:
 *  - NEVER throws. Returns a discriminated result so callers can log
 *    without rolling back the purchase.
 *  - Re-runs ALL validation server-side. The client-side preview is a
 *    UX nicety; this function does not trust it.
 *  - Idempotent in practice: the underlying unique constraint
 *    `(referrer_student_id, referred_student_id, referred_email)`
 *    plus our `resolveReferralCode` dedup check prevent doubles.
 */
export async function applyPendingReferralForPurchase(input: {
  rawCode: string | null | undefined;
  applicantStudentId: string;
  applicantEmail?: string | null;
}): Promise<
  | { created: true; referralId: string; referrerStudentId: string }
  | { created: false; reason: "no_code" | "invalid" | "duplicate" | "error"; detail?: string }
> {
  const trimmed = (input.rawCode ?? "").trim();
  if (!trimmed) return { created: false, reason: "no_code" };

  try {
    const repo = getReferralRepo();
    const referrerId = await repo.findStudentByCode(trimmed);
    const existing = referrerId
      ? await repo.getReferralsByReferrer(referrerId)
      : [];

    const resolved = resolveReferralCode({
      code: trimmed,
      resolvedReferrerId: referrerId,
      applicantStudentId: input.applicantStudentId,
      applicantEmail: input.applicantEmail ?? null,
      existingForReferrer: existing,
    });

    if (!resolved.ok) {
      return {
        created: false,
        reason: resolved.code === "already_referred" ? "duplicate" : "invalid",
        detail: resolved.message,
      };
    }

    const created = await repo.createReferral({
      referrerStudentId: resolved.referrerStudentId,
      referredStudentId: input.applicantStudentId,
      referredEmail: input.applicantEmail ?? null,
      referralCode: resolved.normalizedCode,
      status: "pending",
      note: "Auto-created from referral code at purchase.",
    });
    return {
      created: true,
      referralId: created.id,
      referrerStudentId: resolved.referrerStudentId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      "[apply-pending-referral] failed (purchase unaffected):",
      msg,
    );
    // Race: another concurrent purchase may have inserted the same row
    // already — treat unique-violation as a benign duplicate.
    if (/duplicate|unique/i.test(msg)) {
      return { created: false, reason: "duplicate", detail: msg };
    }
    return { created: false, reason: "error", detail: msg };
  }
}
