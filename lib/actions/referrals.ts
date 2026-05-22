"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionForAction } from "@/lib/staff-permissions";
import { getReferralRepo, getStudentRepo, getSubscriptionRepo } from "@/lib/repositories";
import {
  REFERRAL_STATUSES,
  REFERRAL_REWARD_STATUSES,
  REFERRAL_DISCOUNT_KINDS,
  type ReferralStatus,
  type ReferralRewardStatus,
  type ReferralDiscountKind,
} from "@/lib/mock-data";
import {
  summarizeReferrals,
  validateReferralCreate,
  validateRewardInput,
} from "@/lib/domain/referrals";

const REFERRAL_STATUS_SET = new Set<string>(REFERRAL_STATUSES);
const REWARD_STATUS_SET = new Set<string>(REFERRAL_REWARD_STATUSES);
const DISCOUNT_KIND_SET = new Set<string>(REFERRAL_DISCOUNT_KINDS);

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

function ok<T>(data?: T): ActionResult<T> {
  return { success: true, data };
}
function fail(error: string): ActionResult {
  return { success: false, error };
}

function revalidate() {
  revalidatePath("/referrals");
  revalidatePath("/dashboard");
}

// ── Referrals ──────────────────────────────────────────────

export async function addReferralAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const g = await requirePermissionForAction("referrals:create");
  if (!g.ok) return fail(g.error);

  const referrerStudentId = (formData.get("referrerStudentId") as string)?.trim();
  const referredStudentId =
    ((formData.get("referredStudentId") as string)?.trim() || null) ?? null;
  const referredEmail =
    ((formData.get("referredEmail") as string)?.trim().toLowerCase() || null) ?? null;
  const referralCode = ((formData.get("referralCode") as string)?.trim() || null) ?? null;
  const note = ((formData.get("note") as string)?.trim() || null) ?? null;
  const rawStatus = ((formData.get("status") as string)?.trim() || "pending") as ReferralStatus;

  if (!referrerStudentId) return fail("Referrer is required.");
  if (!REFERRAL_STATUS_SET.has(rawStatus)) return fail("Invalid status.");

  const repo = getReferralRepo();
  const existing = await repo.getReferralsByReferrer(referrerStudentId);
  const validationError = validateReferralCreate({
    referrerStudentId,
    referredStudentId,
    referredEmail,
    existing,
  });
  if (validationError) return fail(validationError);

  // Defence-in-depth: ensure the referrer is a real student row.
  const referrer = await getStudentRepo().getById(referrerStudentId);
  if (!referrer) return fail("Referrer not found.");

  if (referredStudentId) {
    const referred = await getStudentRepo().getById(referredStudentId);
    if (!referred) return fail("Referred student not found.");
  }

  try {
    const created = await repo.createReferral({
      referrerStudentId,
      referredStudentId,
      referredEmail,
      referralCode,
      status: rawStatus,
      note,
    });
    // Allocate referrer's code if missing — helps the admin overview show
    // it immediately after manual entry.
    await repo.getCodeForStudent(referrerStudentId);
    revalidate();
    return ok({ id: created.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error");
  }
}

export async function verifyReferralAction(
  formData: FormData,
): Promise<ActionResult> {
  const g = await requirePermissionForAction("referrals:verify");
  if (!g.ok) return fail(g.error);
  const id = (formData.get("id") as string)?.trim();
  if (!id) return fail("Missing referral ID.");
  const repo = getReferralRepo();
  const existing = await repo.getReferralById(id);
  if (!existing) return fail("Referral not found.");
  if (existing.status === "rewarded") {
    return fail("Cannot change a rewarded referral.");
  }
  try {
    await repo.updateReferral(id, {
      status: "verified",
      verifiedAt: new Date().toISOString(),
      verifiedBy: g.access.user.id,
    });
    revalidate();
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error");
  }
}

export async function rejectReferralAction(
  formData: FormData,
): Promise<ActionResult> {
  const g = await requirePermissionForAction("referrals:verify");
  if (!g.ok) return fail(g.error);
  const id = (formData.get("id") as string)?.trim();
  const note = ((formData.get("note") as string)?.trim() || null) ?? null;
  if (!id) return fail("Missing referral ID.");
  const repo = getReferralRepo();
  const existing = await repo.getReferralById(id);
  if (!existing) return fail("Referral not found.");
  if (existing.status === "rewarded") {
    return fail("Cannot reject a referral that has already been rewarded.");
  }
  try {
    await repo.updateReferral(id, {
      status: "rejected",
      verifiedAt: new Date().toISOString(),
      verifiedBy: g.access.user.id,
      note: note ?? existing.note,
    });
    revalidate();
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error");
  }
}

export async function deleteReferralAction(
  formData: FormData,
): Promise<ActionResult> {
  const g = await requirePermissionForAction("referrals:cancel");
  if (!g.ok) return fail(g.error);
  const id = (formData.get("id") as string)?.trim();
  if (!id) return fail("Missing referral ID.");
  const repo = getReferralRepo();
  const existing = await repo.getReferralById(id);
  if (!existing) return fail("Referral not found.");
  if (existing.status === "rewarded") {
    return fail("Cannot delete a referral that has been rewarded.");
  }
  try {
    await repo.deleteReferral(id);
    revalidate();
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error");
  }
}

// ── Rewards ────────────────────────────────────────────────

function parseDiscountValue(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function createRewardAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const g = await requirePermissionForAction("referrals:reward");
  if (!g.ok) return fail(g.error);

  const referrerStudentId = (formData.get("referrerStudentId") as string)?.trim();
  const termId = ((formData.get("termId") as string)?.trim() || null) ?? null;
  const discountKind = ((formData.get("discountKind") as string)?.trim() ||
    "percentage") as ReferralDiscountKind;
  const discountValue = parseDiscountValue(formData.get("discountValue"));
  const note = ((formData.get("note") as string)?.trim() || null) ?? null;

  if (!referrerStudentId) return fail("Referrer is required.");
  if (!DISCOUNT_KIND_SET.has(discountKind)) return fail("Invalid discount kind.");
  if (discountValue == null) return fail("Discount value must be a positive whole number.");
  const validationError = validateRewardInput({ discountKind, discountValue });
  if (validationError) return fail(validationError);

  const referrer = await getStudentRepo().getById(referrerStudentId);
  if (!referrer) return fail("Referrer not found.");

  const repo = getReferralRepo();
  const referrals = await repo.getReferralsByReferrer(referrerStudentId);
  const counts = summarizeReferrals(referrals);

  try {
    const created = await repo.createReward({
      referrerStudentId,
      termId,
      verifiedReferralCount: counts.verifiedAllTime,
      discountKind,
      discountValue,
      status: "pending",
      note,
    });
    revalidate();
    return ok({ id: created.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error");
  }
}

export async function approveRewardAction(
  formData: FormData,
): Promise<ActionResult> {
  const g = await requirePermissionForAction("referrals:reward");
  if (!g.ok) return fail(g.error);
  const id = (formData.get("id") as string)?.trim();
  if (!id) return fail("Missing reward ID.");
  const repo = getReferralRepo();
  const reward = await repo.getRewardById(id);
  if (!reward) return fail("Reward not found.");
  if (reward.status !== "pending") {
    return fail("Only pending rewards can be approved.");
  }
  try {
    await repo.updateReward(id, {
      status: "approved",
      approvedBy: g.access.user.id,
      approvedAt: new Date().toISOString(),
    });
    revalidate();
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error");
  }
}

export async function applyRewardAction(
  formData: FormData,
): Promise<ActionResult> {
  const g = await requirePermissionForAction("referrals:reward");
  if (!g.ok) return fail(g.error);
  const id = (formData.get("id") as string)?.trim();
  const subscriptionId =
    ((formData.get("subscriptionId") as string)?.trim() || null) ?? null;
  const note = ((formData.get("note") as string)?.trim() || null) ?? null;
  if (!id) return fail("Missing reward ID.");

  const repo = getReferralRepo();
  const reward = await repo.getRewardById(id);
  if (!reward) return fail("Reward not found.");
  if (reward.status !== "approved") {
    return fail("Only approved rewards can be marked as applied.");
  }

  // Defence-in-depth: if a subscription id is supplied, ensure it
  // belongs to the referrer. This guarantees the reward is tied to the
  // referrer's own membership, never to the referred beginner.
  if (subscriptionId) {
    const subs = await getSubscriptionRepo().getByStudent(reward.referrerStudentId);
    const match = subs.find((s) => s.id === subscriptionId);
    if (!match) {
      return fail("Selected subscription does not belong to the referrer.");
    }
  }

  try {
    await repo.updateReward(id, {
      status: "applied",
      appliedSubscriptionId: subscriptionId,
      appliedAt: new Date().toISOString(),
      note: note ?? reward.note,
    });
    revalidate();
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error");
  }
}

export async function cancelRewardAction(
  formData: FormData,
): Promise<ActionResult> {
  const g = await requirePermissionForAction("referrals:cancel");
  if (!g.ok) return fail(g.error);
  const id = (formData.get("id") as string)?.trim();
  const reason = ((formData.get("reason") as string)?.trim() || null) ?? null;
  if (!id) return fail("Missing reward ID.");
  const repo = getReferralRepo();
  const reward = await repo.getRewardById(id);
  if (!reward) return fail("Reward not found.");
  if (reward.status === "applied" || reward.status === "cancelled") {
    return fail("This reward can no longer be cancelled.");
  }
  try {
    await repo.updateReward(id, {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledReason: reason,
    });
    revalidate();
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error");
  }
}

/**
 * Ensures the authenticated student has a referral code allocated,
 * returning it. Used by the student dashboard so the "your referral
 * code" widget never shows null on first view.
 *
 * Permission: callable by any authenticated user for THEIR OWN id.
 * The caller passes their id explicitly so we can compare.
 */
export async function ensureMyReferralCodeAction(
  studentId: string,
): Promise<ActionResult<{ code: string }>> {
  // We deliberately don't use requirePermissionForAction here — students
  // (who have no staff permissions) must still be able to read their own
  // code. We rely on the caller passing their own id.
  if (!studentId) return fail("Missing student id.");
  try {
    const code = await getReferralRepo().getCodeForStudent(studentId);
    return ok({ code });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error");
  }
}

/** Exposed so the admin UI can guard reward-status transitions client-side too. */
export const REFERRAL_REWARD_STATUS_VALUES = REFERRAL_REWARD_STATUSES;
export type { ReferralRewardStatus };
