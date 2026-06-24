"use server";

/**
 * Phase 7 — referral-code-based referral flow.
 *
 * Two surfaces:
 *   1. `previewReferralCodeAction` — called by the checkout/signup UI
 *      to validate a code BEFORE committing a purchase. Returns a
 *      friendly success/failure shape that the input component can
 *      render directly. Never throws to the React error boundary.
 *
 *   2. `applyPendingReferralForPurchase` — server-only helper invoked
 *      by `createPurchaseSubscription` after a subscription is written.
 *      Creates a `student_referrals` row in `pending` status so admin
 *      can review and approve manually. Idempotent (existing dedup on
 *      referrer+referred via the migration's unique constraint) and
 *      best-effort: any failure is logged but never rolls back the
 *      purchase.
 *
 * Both surfaces enforce the rules in `resolveReferralCode`:
 *   - empty code, unknown code, self-referral, duplicate.
 * All validation is server-side; the UI only echoes the resolved state.
 */

import { getReferralRepo, getStudentRepo } from "@/lib/repositories";
import { resolveReferralCode } from "@/lib/domain/referrals";

export interface PreviewReferralCodeInput {
  code: string;
  /** id of the student APPLYING the code. May be null for guest checkout. */
  applicantStudentId?: string | null;
  /** email of the applicant — used for guest checkout dedup. */
  applicantEmail?: string | null;
}

export type PreviewReferralCodeResult =
  | {
      ok: true;
      code: string;
      referrerName: string;
    }
  | {
      ok: false;
      error: string;
      /** Stable machine code for tests / telemetry. */
      reason: "not_found" | "self_referral" | "already_referred" | "empty";
    };

export async function previewReferralCodeAction(
  input: PreviewReferralCodeInput,
): Promise<PreviewReferralCodeResult> {
  try {
    const trimmed = (input.code ?? "").trim();
    if (!trimmed) {
      return {
        ok: false,
        reason: "empty",
        error: "Enter a referral code.",
      };
    }

    const repo = getReferralRepo();
    const referrerId = await repo.findStudentByCode(trimmed);

    let existing: Awaited<ReturnType<typeof repo.getReferralsByReferrer>> = [];
    if (referrerId) {
      existing = await repo.getReferralsByReferrer(referrerId);
    }

    const resolved = resolveReferralCode({
      code: trimmed,
      resolvedReferrerId: referrerId,
      applicantStudentId: input.applicantStudentId ?? null,
      applicantEmail: input.applicantEmail ?? null,
      existingForReferrer: existing,
    });

    if (!resolved.ok) {
      return { ok: false, reason: resolved.code, error: resolved.message };
    }

    // Look up the referrer's display name. Best-effort — never blocks
    // the apply, and never leaks PII beyond a first-name-only label.
    let referrerName = "Another BPM student";
    try {
      const referrer = await getStudentRepo().getById(resolved.referrerStudentId);
      if (referrer?.fullName) {
        const first = referrer.fullName.split(/\s+/)[0] || referrer.fullName;
        referrerName = first;
      }
    } catch (e) {
      // Non-fatal — keep generic label.
      console.warn(
        "[preview-referral-code] referrer lookup failed:",
        e instanceof Error ? e.message : e,
      );
    }

    return { ok: true, code: resolved.normalizedCode, referrerName };
  } catch (e) {
    // Defence-in-depth: never let a thrown exception reach the React
    // error boundary in the checkout dialog.
    console.error(
      "[preview-referral-code] failed:",
      e instanceof Error ? e.message : e,
    );
    return {
      ok: false,
      reason: "not_found",
      error:
        "We couldn't verify that referral code right now. You can continue without it.",
    };
  }
}

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
