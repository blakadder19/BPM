"use server";

/**
 * Super-admin only finance test data deletion (narrow + explicit).
 *
 * Design (G5 — narrowed):
 *   Broad filters like "manual payment method" are NOT a test signal on their
 *   own (real reception payments are also cash/revolut/etc.), and wiping every
 *   penalty is destructive. Deletion is therefore restricted to records that
 *   carry an explicit test marker AND that the super-admin explicitly picks
 *   from a candidate list.
 *
 * Gates (all must pass):
 *   - env `BPM_ALLOW_FINANCE_TEST_DELETE === "true"`
 *   - env `BPM_SUPER_ADMIN_EMAIL` matches authenticated admin's email
 *   - caller types the confirmation token `DELETE TEST DATA`
 *   - caller provides a non-empty list of record ids
 *   - EVERY provided id must still match the test-marker predicate at the
 *     moment of deletion (re-checked server-side; UI selection is advisory)
 *
 * Test-marker predicate:
 *   A record qualifies as test data only when any of the following text fields
 *   contains one of the explicit markers `[test]`, `#test`, or `TEST:`
 *   (case-insensitive, whole-token match for `TEST:`):
 *     - subscription: paymentNotes, notes, paymentReference, refundReason
 *     - penalty: notes
 *
 * Tables affected:
 *   - `subscriptions` (repo delete) — in-memory + Supabase when configured
 *   - `penalties` (in-memory) + `op_penalty` (Supabase) via deletePenaltyFromDB
 *   - `op_finance_audit_log` gets one `manual_edit` entry per deletion
 *
 * Event purchases are NEVER touched by this action.
 */

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getSubscriptionRepo } from "@/lib/repositories";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import { invalidateHydration } from "@/lib/supabase/hydrate-operational";
import { deletePenaltyFromDB } from "@/lib/supabase/operational-persistence";
import { isRealUser } from "@/lib/utils/is-real-user";

export const FINANCE_TEST_DELETE_CONFIRMATION = "DELETE TEST DATA";

/** Explicit markers a record must carry to qualify as test data. */
const TEST_MARKERS = ["[test]", "#test", "test:"] as const;

function hasTestMarker(...fields: (string | null | undefined)[]): boolean {
  for (const f of fields) {
    if (!f) continue;
    const lower = f.toLowerCase();
    for (const m of TEST_MARKERS) {
      if (lower.includes(m)) return true;
    }
  }
  return false;
}

export interface FinanceSuperAdminStatus {
  /** The current authenticated admin matches `BPM_SUPER_ADMIN_EMAIL`. */
  isSuperAdmin: boolean;
  /** `BPM_ALLOW_FINANCE_TEST_DELETE === "true"` in this environment. */
  envEnabled: boolean;
  /** Convenience: true iff both gates pass and danger UI should be rendered. */
  canDelete: boolean;
}

/**
 * Server-side check used by the Finance page to decide whether to render the
 * danger zone. Returns all-false when gates do not pass.
 */
export async function getFinanceSuperAdminStatus(): Promise<FinanceSuperAdminStatus> {
  const user = await getAuthUser();
  const superEmail = (process.env.BPM_SUPER_ADMIN_EMAIL ?? "").toLowerCase().trim();
  const envEnabled = process.env.BPM_ALLOW_FINANCE_TEST_DELETE === "true";
  const isSuperAdmin = !!(
    user &&
    user.role === "admin" &&
    superEmail.length > 0 &&
    user.email.toLowerCase().trim() === superEmail
  );
  return {
    isSuperAdmin,
    envEnabled,
    canDelete: isSuperAdmin && envEnabled,
  };
}

// ── Candidate listing ───────────────────────────────────────

export interface FinanceTestCandidate {
  kind: "subscription" | "penalty";
  id: string;
  label: string;
  detail: string | null;
  createdAt: string | null;
}

export interface ListFinanceTestCandidatesResult {
  success: boolean;
  error?: string;
  candidates?: FinanceTestCandidate[];
}

/**
 * Return every subscription/penalty record that currently carries an explicit
 * test marker. The super-admin must explicitly select from this list.
 */
export async function listFinanceTestCandidatesAction(): Promise<ListFinanceTestCandidatesResult> {
  const status = await getFinanceSuperAdminStatus();
  if (!status.envEnabled) {
    return { success: false, error: "Test data deletion is not enabled in this environment." };
  }
  if (!status.isSuperAdmin) {
    return { success: false, error: "Not authorized." };
  }

  const candidates: FinanceTestCandidate[] = [];

  const subRepo = getSubscriptionRepo();
  const subs = await subRepo.getAll();
  for (const s of subs) {
    if (!hasTestMarker(s.paymentNotes, s.notes, s.paymentReference, s.refundReason)) continue;
    const detailParts = [
      s.paymentMethod ?? null,
      s.paymentStatus ?? null,
      s.paymentNotes ?? s.notes ?? null,
    ].filter(Boolean) as string[];
    candidates.push({
      kind: "subscription",
      id: s.id,
      label: `${s.productName} — ${s.studentId}`,
      detail: detailParts.join(" · ") || null,
      createdAt: s.assignedAt ?? s.paidAt ?? null,
    });
  }

  const penaltySvc = getPenaltyService();
  for (const p of penaltySvc.getAllPenalties()) {
    if (!hasTestMarker(p.notes)) continue;
    candidates.push({
      kind: "penalty",
      id: p.id,
      label: `${p.reason === "late_cancel" ? "Late cancel" : "No-show"} — ${p.classTitle}`,
      detail: p.notes,
      createdAt: p.createdAt,
    });
  }

  candidates.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return { success: true, candidates };
}

// ── Deletion ────────────────────────────────────────────────

export interface DeleteFinanceTestResult {
  success: boolean;
  error?: string;
  deletedSubscriptions?: number;
  deletedPenalties?: number;
  skipped?: number;
  skippedReasons?: string[];
}

export async function deleteFinanceTestRecordsAction(input: {
  confirmation: string;
  ids: string[];
}): Promise<DeleteFinanceTestResult> {
  const status = await getFinanceSuperAdminStatus();
  if (!status.envEnabled) {
    return { success: false, error: "Test data deletion is not enabled in this environment." };
  }
  if (!status.isSuperAdmin) {
    return { success: false, error: "Not authorized." };
  }
  if (input.confirmation !== FINANCE_TEST_DELETE_CONFIRMATION) {
    return { success: false, error: `Type ${FINANCE_TEST_DELETE_CONFIRMATION} to confirm.` };
  }
  const ids = (input.ids ?? []).filter((x) => typeof x === "string" && x.length > 0);
  if (ids.length === 0) {
    return { success: false, error: "No records selected." };
  }
  const idSet = new Set(ids);

  const user = await getAuthUser();
  const performer = user
    ? { userId: user.id, email: user.email, name: user.fullName }
    : null;

  let deletedSubscriptions = 0;
  let deletedPenalties = 0;
  let skipped = 0;
  const skippedReasons: string[] = [];

  // ── Subscriptions (re-check marker) ──────────────────────
  const subRepo = getSubscriptionRepo();
  const allSubs = await subRepo.getAll();
  for (const s of allSubs) {
    if (!idSet.has(s.id)) continue;
    if (!hasTestMarker(s.paymentNotes, s.notes, s.paymentReference, s.refundReason)) {
      skipped++;
      skippedReasons.push(`${s.id}: no longer carries a test marker`);
      continue;
    }
    try {
      const ok = await subRepo.delete(s.id);
      if (ok) {
        deletedSubscriptions++;
        logFinanceEvent({
          entityType: "subscription",
          entityId: s.id,
          action: "manual_edit",
          performer,
          detail: "Super-admin test data deletion (explicit selection)",
          previousValue: s.paymentStatus,
          newValue: "deleted",
        });
      } else {
        skipped++;
        skippedReasons.push(`${s.id}: repository delete returned false`);
      }
    } catch (e) {
      skipped++;
      skippedReasons.push(`${s.id}: ${e instanceof Error ? e.message : "delete error"}`);
    }
  }

  // ── Penalties (re-check marker) ──────────────────────────
  const penaltySvc = getPenaltyService();
  const allPenalties = penaltySvc.getAllPenalties();
  for (const p of allPenalties) {
    if (!idSet.has(p.id)) continue;
    if (!hasTestMarker(p.notes)) {
      skipped++;
      skippedReasons.push(`${p.id}: no longer carries a test marker`);
      continue;
    }
    const ok = penaltySvc.deletePenalty(p.id);
    if (!ok) {
      skipped++;
      skippedReasons.push(`${p.id}: penalty not found in memory`);
      continue;
    }
    deletedPenalties++;
    if (isRealUser(p.studentId)) {
      try { await deletePenaltyFromDB(p.id); } catch { /* best-effort */ }
    }
    logFinanceEvent({
      entityType: "penalty",
      entityId: p.id,
      action: "manual_edit",
      performer,
      detail: "Super-admin test data deletion (explicit selection)",
      previousValue: p.resolution,
      newValue: "deleted",
    });
  }

  invalidateHydration();
  revalidatePath("/finance");
  revalidatePath("/penalties");
  revalidatePath("/students");
  revalidatePath("/dashboard");

  return {
    success: true,
    deletedSubscriptions,
    deletedPenalties,
    skipped,
    skippedReasons: skippedReasons.length > 0 ? skippedReasons : undefined,
  };
}
